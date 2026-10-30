import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { buildJudgeListPdf, downloadBlob, type ListLine } from "@/lib/judgeListPdf";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { loadJudgeCandidates } from "@/lib/judgeOrder";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PreviewSession = {
  id: string;
  title: string;
  school_id: string;
  category_id: string | null;
  group_id: string | null;
  voter_scope: string | null;
  candidate_ids?: string[] | null;
  round_number?: number | null;
};

/** 管理端预览：与评委投票页完全相同的名单顺序与分组 */
export function JudgeListPreview({
  session,
  onClose,
}: {
  session: PreviewSession | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["judge-list-preview", session?.id],
    enabled: !!session,
    queryFn: () => loadJudgeCandidates(supabase, session!),
  });

  const list = data?.candidates ?? [];
  const multiGroup = new Set(list.map((c) => c.group_id ?? "none")).size > 1;
  const groupLabel = (id: string | null) => (id ? (data?.groupNames[id] ?? "未分组") : "未分组");
  const groupCounts = new Map<string, number>();
  list.forEach((c) => groupCounts.set(c.group_id ?? "", (groupCounts.get(c.group_id ?? "") ?? 0) + 1));

  const [exporting, setExporting] = useState(false);

  async function exportPdf() {
    if (!session || list.length === 0) return;
    setExporting(true);
    try {
      const lines: ListLine[] = [];
      list.forEach((c, i) => {
        if (multiGroup && (i === 0 || list[i - 1]?.group_id !== c.group_id))
          lines.push({
            kind: "group",
            label: `${groupLabel(c.group_id)}（${groupCounts.get(c.group_id ?? "")} 人）`,
          });
        lines.push({
          kind: "row",
          no: i + 1,
          name: c.full_name,
          unit: c.unit ?? "—",
          title: c.current_title ?? "—",
          votes: c.agree_votes != null ? `${c.agree_votes}/${c.total_votes ?? "—"}` : "",
        });
      });
      const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
      const blob = await buildJudgeListPdf(lines, {
        title: `${session.title} · 评委端名单`,
        subtitle: `第 ${session.round_number ?? 1} 轮 · 共 ${list.length} 人${
          multiGroup ? ` · ${groupCounts.size} 个学科组` : ""
        } · 导出时间 ${stamp}`,
      });
      downloadBlob(blob, `${session.title}-评委端名单.pdf`);
      toast.success("名单 PDF 已导出");
    } catch (e) {
      toast.error(`导出失败：${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden rounded-none p-0">
        <DialogHeader className="hairline-b px-8 pb-5 pt-8">
          <DialogTitle className="text-[15px] font-normal tracking-[0.16em]">
            评委端名单预览 · {session?.title}
          </DialogTitle>
          <DialogDescription className="text-[11px] leading-loose tracking-[0.12em]">
            以下为评委打开本场次时看到的顺序与分组，共 {list.length} 人
            {multiGroup ? `，分 ${groupCounts.size} 个学科组` : ""}。
            有学科组推荐票数的按票数优先，其余按「评审对象」页设定的顺序；如需调整请到「评审对象」页选择参评类型后排序。
          </DialogDescription>
          <div className="pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={exportPdf}
              disabled={exporting || isLoading || list.length === 0}
              className="h-8 rounded-none px-5 text-[11px] tracking-[0.16em]"
            >
              {exporting ? "正在生成…" : "导出名单 PDF"}
            </Button>
          </div>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto px-8 pb-8">
          {isLoading ? (
            <p className="py-8 text-[12px] tracking-[0.1em] text-muted-foreground">正在加载名单…</p>
          ) : list.length === 0 ? (
            <p className="py-8 text-[12px] tracking-[0.1em] text-muted-foreground">
              本场次暂无评审对象，评委端将显示空名单。
            </p>
          ) : (
            <ol className="text-[12px] tracking-[0.1em]">
              {list.map((c, i) => {
                const newGroup = multiGroup && (i === 0 || list[i - 1]?.group_id !== c.group_id);
                return (
                  <li key={c.id}>
                    {newGroup ? (
                      <div className="mt-6 pb-2 text-[11px] tracking-[0.2em] text-muted-foreground">
                        {groupLabel(c.group_id)}（{groupCounts.get(c.group_id ?? "")} 人）
                      </div>
                    ) : null}
                    <div className="hairline-t flex items-center gap-6 py-2.5">
                      <span className="w-8 tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="w-24">{c.full_name}</span>
                      <span className="flex-1 truncate text-muted-foreground">{c.unit ?? "—"}</span>
                      <span className="w-28 text-muted-foreground">{c.current_title ?? "—"}</span>
                      <span className="w-24 text-right tabular-nums text-muted-foreground">
                        {c.agree_votes != null ? `推荐 ${c.agree_votes}/${c.total_votes ?? "—"}` : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
