import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSchool } from "@/lib/session";
import { loadJudgeCandidates, orderJudgeCandidates } from "@/lib/judgeOrder";
import { pickVotingRule } from "@/lib/voteRules";
import { downloadBlob } from "@/lib/passwordBookPdf";
import {
  MARKS_LABEL,
  OPTIONAL_COLUMN_LABEL,
  ROW_HEIGHTS,
  buildBallotDocs,
  defaultInstructions,
  groupsInOrder,
  resolveInstructions,
  type BallotCandidate,
  type BallotMarks,
  type BallotOptionalColumn,
  type BallotRowSize,
  type BallotScope,
} from "@/lib/paperBallot";
import {
  ballotPageCount,
  buildPaperBallotPdf,
  forEachBallotPage,
  printPaperBallots,
  type BallotLayout,
  type RenderDoc,
} from "@/lib/paperBallotPdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PaperBallotSession = {
  id: string;
  title: string;
  school_id: string;
  category_id: string | null;
  group_id: string | null;
  voter_scope: string | null;
  candidate_ids?: string[] | null;
  round_number?: number | null;
  max_recommend?: number | null;
};

const SCOPE_LABEL: Record<BallotScope, { label: string; hint: string }> = {
  group: { label: "指定学科组独立票", hint: "仅打印所选学科组的人员，用于学科组线下推荐。" },
  all: { label: "全类别一张票", hint: "该评审类别全部学科人员集中在一张选票上，按学科组分段。" },
  batch: { label: "按学科组批量", hint: "每个学科组各一份独立选票，合并在一个文件中依次排列。" },
};

const fieldLabel = "text-[11px] tracking-[0.18em] text-muted-foreground";
const selectCls = "h-9 w-full border border-border bg-card px-2 text-[12px] text-foreground";

async function loadCategoryPool(schoolId: string, categoryId: string) {
  const [{ data: cands }, { data: groups }] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, full_name, unit, current_title, group_id, sort_order")
      .eq("school_id", schoolId)
      .eq("category_id", categoryId)
      .order("sort_order")
      .order("full_name")
      .range(0, 1999),
    supabase.from("subject_groups").select("id, name").eq("school_id", schoolId),
  ]);
  const base = cands ?? [];
  const ids = base.map((c) => c.id);
  const votes = new Map<string, { agree: number; total: number }>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from("offline_group_results")
      .select("candidate_id, agree_votes, total_votes")
      .eq("school_id", schoolId)
      .in("candidate_id", ids.slice(i, i + 100));
    (data ?? []).forEach((o) =>
      votes.set(o.candidate_id, { agree: o.agree_votes ?? 0, total: o.total_votes ?? 0 }),
    );
  }
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name] as const));
  const candidates = orderJudgeCandidates(
    base.map((c) => ({
      ...c,
      agree_votes: votes.get(c.id)?.agree ?? null,
      total_votes: votes.get(c.id)?.total ?? null,
    })),
    groupName,
  );
  return { candidates, groupNames: Object.fromEntries(groupName) as Record<string, string> };
}

/** 应急纸质选票工作台：网络故障时管理员勾选人员、定制表头，预览后导出 PDF 或直接打印 */
export function PaperBallotWorkbench({
  open,
  onOpenChange,
  schoolId,
  session,
  defaultCategoryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  session?: PaperBallotSession | null;
  defaultCategoryId?: string | null;
}) {
  const school = useSchool(schoolId);
  const meta = useQuery({
    queryKey: ["paper-ballot-meta", schoolId],
    enabled: open && !!schoolId,
    queryFn: async () => {
      const [{ data: categories }, { data: rules }] = await Promise.all([
        supabase
          .from("review_categories")
          .select("id, name, sort_order")
          .eq("school_id", schoolId!)
          .order("sort_order")
          .order("name"),
        supabase
          .from("voting_rules")
          .select("category_id, group_id, total_count, max_recommend, allow_abstain, require_all")
          .eq("school_id", schoolId!),
      ]);
      return { categories: categories ?? [], rules: rules ?? [] };
    },
  });

  const [categoryId, setCategoryId] = useState<string>("");
  useEffect(() => {
    if (!open || session) return;
    const cats = meta.data?.categories ?? [];
    if (cats.length === 0) return;
    setCategoryId((prev) => {
      if (prev && cats.some((c) => c.id === prev)) return prev;
      if (defaultCategoryId && cats.some((c) => c.id === defaultCategoryId)) return defaultCategoryId;
      return cats[0]!.id;
    });
  }, [open, session, meta.data, defaultCategoryId]);

  const effCategory = session ? session.category_id : categoryId || null;
  const pool = useQuery({
    queryKey: ["paper-ballot-pool", schoolId, session?.id ?? null, session ? null : categoryId],
    enabled: open && !!schoolId && (!!session || !!categoryId),
    queryFn: () =>
      session ? loadJudgeCandidates(supabase, session) : loadCategoryPool(schoolId!, categoryId),
  });

  const candidates: BallotCandidate[] = useMemo(() => pool.data?.candidates ?? [], [pool.data]);
  const groupName = (id: string | null) => (id ? (pool.data?.groupNames[id] ?? "未分组") : "未分组");
  const poolGroups = useMemo(() => groupsInOrder(candidates), [candidates]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelected(new Set(candidates.map((c) => c.id)));
  }, [candidates]);

  const [scope, setScope] = useState<BallotScope>(session ? "all" : "group");
  const [groupKey, setGroupKey] = useState<string>("");
  useEffect(() => {
    const keys = poolGroups.map((g) => g ?? "");
    if (!keys.includes(groupKey)) setGroupKey(keys[0] ?? "");
  }, [poolGroups, groupKey]);

  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [customInstr, setCustomInstr] = useState<string | null>(null);
  const [quotaText, setQuotaText] = useState("");
  const [columns, setColumns] = useState<BallotOptionalColumn[]>(["unit", "title"]);
  const [marks, setMarks] = useState<BallotMarks>("agree_reject");
  const [rowSize, setRowSize] = useState<BallotRowSize>("normal");
  const [signEveryPage, setSignEveryPage] = useState(true);
  const [signLabel, setSignLabel] = useState("评委签名");
  const [copies, setCopies] = useState(1);
  const [numbered, setNumbered] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "print" | null>(null);

  const categoryName =
    (meta.data?.categories ?? []).find((c) => c.id === effCategory)?.name ?? (effCategory ? "" : "全部类别");
  const schoolName = school.data?.name ?? "";
  const autoTitle = [schoolName, session ? session.title : `${categoryName}评审`]
    .filter(Boolean)
    .join(" · ")
    .concat(" 推荐选票");
  const title = customTitle ?? autoTitle;
  const instructions = customInstr ?? defaultInstructions(marks);

  const manualQuota = Number.parseInt(quotaText, 10);
  const quotaFor = (gid: string | null) => {
    if (Number.isFinite(manualQuota) && manualQuota > 0) return manualQuota;
    if (session?.max_recommend) return session.max_recommend;
    const rule = pickVotingRule(meta.data?.rules, effCategory, gid ?? session?.group_id ?? null);
    return rule && rule.max_recommend > 0 ? rule.max_recommend : null;
  };

  const scopeGroupId = groupKey || null;
  const scopedPool =
    scope === "group" ? candidates.filter((c) => (c.group_id ?? "") === groupKey) : candidates;

  const docs: RenderDoc[] = useMemo(() => {
    const chosen = candidates.filter((c) => selected.has(c.id));
    return buildBallotDocs({ candidates: chosen, scope, groupId: scopeGroupId, groupName, quotaFor })
      .filter((d) => d.count > 0)
      .map((d) => ({
        ...d,
        title,
        instructions: resolveInstructions(instructions, d.quota),
        subtitle: [
          d.groupLabel ? `【${d.groupLabel}】` : d.grouped ? `全部学科组（${d.groupCount} 组）` : null,
          effCategory || session ? `评审类别：${categoryName || "—"}` : null,
          session ? `第 ${session.round_number ?? 1} 轮` : null,
          `共 ${d.count} 人`,
          d.quota ? `限推荐 ${d.quota} 人` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, selected, scope, scopeGroupId, pool.data, title, instructions, quotaText, meta.data, categoryName]);

  const layout: BallotLayout = useMemo(
    () => ({
      columns,
      marks,
      rowH: ROW_HEIGHTS[rowSize],
      signEveryPage,
      signLabel: signLabel.trim() || "评委签名",
      copies: Math.min(60, Math.max(1, copies || 1)),
      numbered,
    }),
    [columns, marks, rowSize, signEveryPage, signLabel, copies, numbered],
  );

  const pagesPerCopy = docs.reduce((s, d) => s + ballotPageCount(d, layout), 0);
  const totalPages = pagesPerCopy * layout.copies;

  const [previews, setPreviews] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRendering(true);
    const t = setTimeout(async () => {
      const urls: string[] = [];
      await forEachBallotPage(docs, layout, { dpi: 110, copies: 1, maxPages: 12 }, (c) => {
        urls.push(c.toDataURL("image/png"));
      });
      if (!cancelled) {
        setPreviews(urls);
        setRendering(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, docs, layout]);

  const fileTitle = `${title}${scope === "group" && docs[0]?.groupLabel ? `-${docs[0].groupLabel}` : ""}`;

  async function exportPdf() {
    if (docs.length === 0) return;
    setBusy("pdf");
    try {
      const blob = await buildPaperBallotPdf(docs, layout, fileTitle);
      downloadBlob(blob, `${fileTitle}.pdf`);
      toast.success(`选票 PDF 已导出，共 ${totalPages} 页`);
    } catch (e) {
      toast.error(`导出失败：${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function printNow() {
    if (docs.length === 0) return;
    const win = window.open("", "_blank", "width=1000,height=760");
    if (!win) {
      toast.error("打印窗口被浏览器拦截，请允许弹出窗口，或改用「导出选票 PDF」");
      return;
    }
    win.document.write("<p style='font-family:sans-serif;padding:24px'>正在生成选票，请稍候…</p>");
    setBusy("print");
    try {
      await printPaperBallots(win, docs, layout, fileTitle);
    } catch (e) {
      win.close();
      toast.error(`打印失败：${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const toggleColumn = (k: BallotOptionalColumn, on: boolean) =>
    setColumns((prev) =>
      (["unit", "title", "group", "votes"] as const).filter((x) => (x === k ? on : prev.includes(x))),
    );
  const setScoped = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      scopedPool.forEach((c) => (on ? next.add(c.id) : next.delete(c.id)));
      return next;
    });
  const scopedSelected = scopedPool.filter((c) => selected.has(c.id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden rounded-none p-0 sm:rounded-none">
        <DialogHeader className="hairline-b px-6 pb-4 pt-6 md:px-8">
          <DialogTitle className="text-[15px] font-normal tracking-[0.16em]">
            应急纸质选票{session ? ` · ${session.title}` : ""}
          </DialogTitle>
          <DialogDescription className="text-[11px] leading-loose tracking-[0.12em]">
            网络或系统故障、评委无法在线投票时使用：勾选参评人员，定制表头与栏目，右侧即为实际打印效果。人员顺序与评委端一致。
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[360px_1fr]">
          <div className="min-h-0 space-y-6 overflow-y-auto border-border px-6 py-5 md:border-r md:px-8">
            {!session ? (
              <div className="space-y-2">
                <div className={fieldLabel}>评审类别</div>
                <select
                  aria-label="评审类别"
                  className={selectCls}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  {(meta.data?.categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className={fieldLabel}>选票范围</div>
              <div className="grid gap-2">
                {(Object.keys(SCOPE_LABEL) as BallotScope[]).map((k) => (
                  <label
                    key={k}
                    className={`flex cursor-pointer gap-3 border px-3 py-2.5 text-[12px] tracking-[0.08em] ${
                      scope === k ? "border-foreground" : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="ballot-scope"
                      checked={scope === k}
                      onChange={() => setScope(k)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block">{SCOPE_LABEL[k].label}</span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                        {SCOPE_LABEL[k].hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {scope === "group" ? (
                <select
                  aria-label="学科组"
                  className={selectCls}
                  value={groupKey}
                  onChange={(e) => setGroupKey(e.target.value)}
                >
                  {poolGroups.map((g) => (
                    <option key={g ?? ""} value={g ?? ""}>
                      {groupName(g)}（{candidates.filter((c) => (c.group_id ?? null) === g).length} 人）
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className={fieldLabel}>表头</div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>选票标题</span>
                  {customTitle != null ? (
                    <button className="underline" onClick={() => setCustomTitle(null)}>
                      恢复默认
                    </button>
                  ) : null}
                </div>
                <Input
                  aria-label="选票标题"
                  value={title}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="h-9 rounded-none text-[12px]"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>填写说明（{"{名额}"} 自动替换为推荐名额）</span>
                  {customInstr != null ? (
                    <button className="underline" onClick={() => setCustomInstr(null)}>
                      恢复默认
                    </button>
                  ) : null}
                </div>
                <Textarea
                  aria-label="填写说明"
                  value={instructions}
                  onChange={(e) => setCustomInstr(e.target.value)}
                  rows={3}
                  className="rounded-none text-[12px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-[11px] text-muted-foreground">
                  <span>推荐名额</span>
                  <Input
                    aria-label="推荐名额"
                    inputMode="numeric"
                    value={quotaText}
                    onChange={(e) => setQuotaText(e.target.value.replace(/\D/g, ""))}
                    placeholder={`按规则：${quotaFor(scope === "all" ? null : scopeGroupId) ?? "不限"}`}
                    className="h-9 rounded-none text-[12px]"
                  />
                </label>
                <label className="space-y-1 text-[11px] text-muted-foreground">
                  <span>签名栏文字</span>
                  <Input
                    aria-label="签名栏文字"
                    value={signLabel}
                    onChange={(e) => setSignLabel(e.target.value)}
                    className="h-9 rounded-none text-[12px]"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className={fieldLabel}>栏目</div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
                <span className="text-muted-foreground">序号、姓名（固定）</span>
                {(Object.keys(OPTIONAL_COLUMN_LABEL) as BallotOptionalColumn[]).map((k) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={columns.includes(k)}
                      onChange={(e) => toggleColumn(k, e.target.checked)}
                    />
                    {OPTIONAL_COLUMN_LABEL[k]}
                  </label>
                ))}
              </div>
              <label className="block space-y-1 text-[11px] text-muted-foreground">
                <span>表决栏</span>
                <select
                  aria-label="表决栏"
                  className={selectCls}
                  value={marks}
                  onChange={(e) => setMarks(e.target.value as BallotMarks)}
                >
                  {(Object.keys(MARKS_LABEL) as BallotMarks[]).map((k) => (
                    <option key={k} value={k}>
                      {MARKS_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-3">
              <div className={fieldLabel}>版式与份数</div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-[11px] text-muted-foreground">
                  <span>行高</span>
                  <select
                    aria-label="行高"
                    className={selectCls}
                    value={rowSize}
                    onChange={(e) => setRowSize(e.target.value as BallotRowSize)}
                  >
                    <option value="compact">紧凑</option>
                    <option value="normal">标准</option>
                    <option value="loose">宽松</option>
                  </select>
                </label>
                <label className="space-y-1 text-[11px] text-muted-foreground">
                  <span>签名栏位置</span>
                  <select
                    aria-label="签名栏位置"
                    className={selectCls}
                    value={signEveryPage ? "every" : "last"}
                    onChange={(e) => setSignEveryPage(e.target.value === "every")}
                  >
                    <option value="every">每页底部</option>
                    <option value="last">仅最后一页</option>
                  </select>
                </label>
                <label className="space-y-1 text-[11px] text-muted-foreground">
                  <span>{scope === "batch" ? "每组份数" : "份数"}（最多 60）</span>
                  <Input
                    aria-label="份数"
                    type="number"
                    min={1}
                    max={60}
                    value={copies}
                    onChange={(e) => setCopies(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
                    className="h-9 rounded-none text-[12px]"
                  />
                </label>
                <label className="flex items-end gap-2 pb-2 text-[12px]">
                  <input
                    type="checkbox"
                    checked={numbered}
                    onChange={(e) => setNumbered(e.target.checked)}
                  />
                  印选票编号
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className={fieldLabel}>
                  参评人员（已选 {scopedSelected}/{scopedPool.length}）
                </div>
                <div className="flex gap-3 text-[11px] text-muted-foreground">
                  <button className="underline" onClick={() => setScoped(true)}>
                    全选
                  </button>
                  <button className="underline" onClick={() => setScoped(false)}>
                    全不选
                  </button>
                </div>
              </div>
              {pool.isLoading ? (
                <p className="text-[12px] text-muted-foreground">正在加载名单…</p>
              ) : scopedPool.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">暂无参评人员。</p>
              ) : (
                <ul className="max-h-72 overflow-y-auto border border-border">
                  {scopedPool.map((c, i) => {
                    const newGroup =
                      scope !== "group" &&
                      poolGroups.length > 1 &&
                      (i === 0 || scopedPool[i - 1]!.group_id !== c.group_id);
                    return (
                      <li key={c.id}>
                        {newGroup ? (
                          <div className="bg-muted px-3 py-1.5 text-[11px] tracking-[0.14em] text-muted-foreground">
                            {groupName(c.group_id)}
                          </div>
                        ) : null}
                        <label className="hairline-t flex cursor-pointer items-center gap-3 px-3 py-2 text-[12px]">
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={(e) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(c.id);
                                else next.delete(c.id);
                                return next;
                              })
                            }
                          />
                          <span className="w-20 truncate">{c.full_name}</span>
                          <span className="flex-1 truncate text-muted-foreground">{c.unit ?? ""}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col bg-muted/40">
            <div className="hairline-b flex flex-wrap items-center justify-between gap-3 px-6 py-3">
              <span className="text-[11px] tracking-[0.14em] text-muted-foreground">
                {docs.length === 0
                  ? "请勾选参评人员"
                  : `${docs.length > 1 ? `${docs.length} 个学科组 · ` : ""}每份 ${pagesPerCopy} 页${
                      layout.copies > 1 ? ` × ${layout.copies} 份` : ""
                    } · 合计 ${totalPages} 页${rendering ? " · 正在更新预览…" : ""}`}
              </span>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={printNow}
                  disabled={!!busy || docs.length === 0}
                  className="h-9 rounded-none px-5 text-[12px] tracking-[0.16em]"
                >
                  {busy === "print" ? "正在生成…" : "直接打印"}
                </Button>
                <Button
                  onClick={exportPdf}
                  disabled={!!busy || docs.length === 0}
                  className="h-9 rounded-none px-5 text-[12px] tracking-[0.16em]"
                >
                  {busy === "pdf" ? "正在生成…" : "导出选票 PDF"}
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {docs.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">没有可预览的选票。</p>
              ) : (
                <div className="mx-auto max-w-[560px] space-y-6">
                  {previews.map((src, i) => (
                    <figure key={i} className="space-y-1.5">
                      <figcaption className="text-[10px] tracking-[0.16em] text-muted-foreground">
                        预览第 {i + 1} 页
                      </figcaption>
                      <img
                        src={src}
                        alt={`选票预览第 ${i + 1} 页`}
                        className="w-full border border-border bg-card shadow-sm"
                      />
                    </figure>
                  ))}
                  {pagesPerCopy > previews.length && !rendering ? (
                    <p className="text-center text-[11px] text-muted-foreground">
                      预览仅显示前 {previews.length} 页，导出与打印包含全部 {totalPages} 页。
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
