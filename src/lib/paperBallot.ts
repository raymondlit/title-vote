/**
 * 应急纸质选票（网络故障时的冗余方案）：选票分组、栏目宽度与分页的纯逻辑。
 * 绘制见 paperBallotPdf.ts；预览、PDF、打印共用同一套分页结果，所见即所得。
 */
import { A4, MARGIN, FOOTER_H } from "@/lib/passwordBookPdf";

export type BallotCandidate = {
  id: string;
  full_name: string;
  unit: string | null;
  current_title: string | null;
  group_id: string | null;
  agree_votes: number | null;
  total_votes: number | null;
};

/** 指定学科组独立票 / 全类别一张票（按学科组分段）/ 按学科组批量（每组一份） */
export type BallotScope = "group" | "all" | "batch";
export type BallotOptionalColumn = "unit" | "title" | "group" | "votes";
export type BallotMarks = "agree" | "agree_reject" | "agree_reject_abstain";
export type BallotRowSize = "compact" | "normal" | "loose";

export const ROW_HEIGHTS: Record<BallotRowSize, number> = { compact: 8, normal: 10, loose: 12 };
export const BALLOT_HEADER_H = 34; // 首页标题 + 说明（mm）
export const BALLOT_RUN_H = 7; // 续页页眉
export const BALLOT_COLHEAD_H = 9; // 表头
export const BALLOT_GROUP_H = 8; // 学科组分段行
export const BALLOT_SIGN_H = 18; // 评委签名栏
export const BALLOT_WIDTH = A4.w - MARGIN * 2;

export type BallotLine =
  | { kind: "group"; label: string; groupKey: string; cont?: boolean }
  | {
      kind: "row";
      no: number;
      candidate: BallotCandidate;
      groupKey: string;
      groupLabel: string;
    };

export type BallotDoc = {
  key: string;
  /** 独立票所属学科组名称；全类别一张票为 null */
  groupLabel: string | null;
  groupId: string | null;
  grouped: boolean;
  count: number;
  groupCount: number;
  quota: number | null;
  lines: BallotLine[];
};

const keyOf = (id: string | null) => id ?? "";

/** 按出现顺序列出名单中的学科组 */
export function groupsInOrder(list: { group_id: string | null }[]): (string | null)[] {
  const seen = new Set<string>();
  const out: (string | null)[] = [];
  for (const c of list) {
    const k = keyOf(c.group_id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c.group_id ?? null);
  }
  return out;
}

export function buildBallotDocs(args: {
  candidates: BallotCandidate[]; // 已按评委端顺序排好、且已勾选
  scope: BallotScope;
  groupId: string | null;
  groupName: (id: string | null) => string;
  quotaFor: (groupId: string | null) => number | null;
}): BallotDoc[] {
  const { candidates, scope, groupName, quotaFor } = args;

  const single = (list: BallotCandidate[], gid: string | null): BallotDoc => ({
    key: `g:${keyOf(gid)}`,
    groupLabel: groupName(gid),
    groupId: gid,
    grouped: false,
    count: list.length,
    groupCount: 1,
    quota: quotaFor(gid),
    lines: list.map((c, i) => ({
      kind: "row",
      no: i + 1,
      candidate: c,
      groupKey: keyOf(gid),
      groupLabel: groupName(gid),
    })),
  });

  if (scope === "group") {
    const gid = args.groupId ?? null;
    return [single(candidates.filter((c) => keyOf(c.group_id) === keyOf(gid)), gid)];
  }
  if (scope === "batch") {
    return groupsInOrder(candidates).map((gid) =>
      single(
        candidates.filter((c) => keyOf(c.group_id) === keyOf(gid)),
        gid,
      ),
    );
  }

  const groups = groupsInOrder(candidates);
  const grouped = groups.length > 1;
  const counts = new Map<string, number>();
  candidates.forEach((c) => counts.set(keyOf(c.group_id), (counts.get(keyOf(c.group_id)) ?? 0) + 1));
  const lines: BallotLine[] = [];
  candidates.forEach((c, i) => {
    const k = keyOf(c.group_id);
    if (grouped && (i === 0 || keyOf(candidates[i - 1]!.group_id) !== k))
      lines.push({ kind: "group", label: `${groupName(c.group_id)}（${counts.get(k)} 人）`, groupKey: k });
    lines.push({ kind: "row", no: i + 1, candidate: c, groupKey: k, groupLabel: groupName(c.group_id) });
  });
  return [
    {
      key: "all",
      groupLabel: null,
      groupId: null,
      grouped,
      count: candidates.length,
      groupCount: groups.length,
      quota: quotaFor(null),
      lines,
    },
  ];
}

const pageCap = (pageIdx: number, signEveryPage: boolean) =>
  A4.h -
  MARGIN * 2 -
  FOOTER_H -
  BALLOT_COLHEAD_H -
  (pageIdx === 0 ? BALLOT_HEADER_H : BALLOT_RUN_H) -
  (signEveryPage ? BALLOT_SIGN_H : 0);

/**
 * 分页：首页留标题与说明；组标题不落在页底；学科组跨页时新页顶部补「组名（续）」；
 * 签名栏仅在末页时，末页放不下就把最后一人连同签名栏移到新页，签名栏不会孤零零一页。
 */
export function paginateBallot(
  lines: BallotLine[],
  opts: { rowH: number; signEveryPage: boolean; grouped: boolean },
): BallotLine[][] {
  const { rowH, signEveryPage, grouped } = opts;
  const h = (l: BallotLine) => (l.kind === "group" ? BALLOT_GROUP_H : rowH);
  const contOf = (l: BallotLine): BallotLine | null =>
    grouped && l.kind === "row"
      ? { kind: "group", label: `${l.groupLabel}（续）`, groupKey: l.groupKey, cont: true }
      : null;

  const pages: BallotLine[][] = [];
  let cur: BallotLine[] = [];
  let used = 0;
  const startPage = (first: BallotLine) => {
    pages.push(cur);
    cur = [];
    used = 0;
    const cont = contOf(first);
    if (cont) {
      cur.push(cont);
      used += BALLOT_GROUP_H;
    }
  };

  for (const l of lines) {
    const need = h(l) + (l.kind === "group" ? rowH : 0); // 组标题至少带一行
    if (cur.some((x) => x.kind === "row") && used + need > pageCap(pages.length, signEveryPage))
      startPage(l);
    cur.push(l);
    used += h(l);
  }

  if (!signEveryPage && used + BALLOT_SIGN_H > pageCap(pages.length, false)) {
    const rows = cur.filter((x) => x.kind === "row").length;
    if (rows >= 2) {
      const last = cur.pop()!;
      startPage(last);
      cur.push(last);
    }
  }
  pages.push(cur);
  return pages;
}

export type BallotColumnSpec = {
  key: "no" | "name" | BallotOptionalColumn | "agree" | "reject" | "abstain";
  label: string;
  w: number;
  mark?: boolean;
};

export const OPTIONAL_COLUMN_LABEL: Record<BallotOptionalColumn, string> = {
  unit: "单位",
  title: "现职称",
  group: "学科组",
  votes: "学科组推荐",
};

export const MARKS_LABEL: Record<BallotMarks, string> = {
  agree: "仅「推荐」一栏",
  agree_reject: "推荐 / 不推荐",
  agree_reject_abstain: "推荐 / 不推荐 / 弃权",
};

/** 栏目宽度（mm），合计等于版心宽度；单位栏吸收剩余宽度，未选单位时由姓名栏吸收 */
export function ballotColumns(
  optional: BallotOptionalColumn[],
  marks: BallotMarks,
): BallotColumnSpec[] {
  const has = (k: BallotOptionalColumn) => optional.includes(k);
  const cols: BallotColumnSpec[] = [
    { key: "no", label: "序号", w: 11 },
    { key: "name", label: "姓名", w: 26 },
  ];
  if (has("unit")) cols.push({ key: "unit", label: "单位", w: 0 });
  if (has("title")) cols.push({ key: "title", label: "现职称", w: 26 });
  if (has("group")) cols.push({ key: "group", label: "学科组", w: 24 });
  if (has("votes")) cols.push({ key: "votes", label: "学科组推荐", w: 20 });
  cols.push({ key: "agree", label: "推荐", w: 16, mark: true });
  if (marks !== "agree") cols.push({ key: "reject", label: "不推荐", w: 16, mark: true });
  if (marks === "agree_reject_abstain") cols.push({ key: "abstain", label: "弃权", w: 16, mark: true });
  const rest = BALLOT_WIDTH - cols.reduce((s, c) => s + c.w, 0);
  const flex = cols.find((c) => c.key === "unit") ?? cols[1]!;
  flex.w += rest;
  return cols;
}

/** 说明文字中的 {名额} 替换为推荐名额；无名额时去掉含该占位符的句子 */
export function resolveInstructions(text: string, quota: number | null): string {
  if (quota != null) return text.split("{名额}").join(String(quota));
  return text
    .split(/(?<=[。；;!！])/)
    .filter((s) => !s.includes("{名额}"))
    .join("")
    .trim();
}

export function defaultInstructions(marks: BallotMarks): string {
  const how =
    marks === "agree"
      ? "请在同意推荐人员的「推荐」栏内划「√」，不同意的留空。"
      : "请在每位参评人员对应栏内划「√」，每人只能选择一项。";
  return `${how}推荐人数不得超过 {名额} 人，超出名额、涂改不清或未签名的选票无效。`;
}

export function serialLabel(copyIndex: number, numbered: boolean): string | null {
  return numbered ? `No.${String(copyIndex + 1).padStart(3, "0")}` : null;
}
