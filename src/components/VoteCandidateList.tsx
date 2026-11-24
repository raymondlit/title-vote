import { memo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { JudgeCandidate } from "@/lib/judgeOrder";
import { adjacentCandidateId, voteKeyboardAction } from "@/lib/voteNav";

type Props = {
  candidates: JudgeCandidate[];
  choices: Record<string, string>;
  groupNames: Record<string, string>;
  showGroups: boolean;
  showVotes: boolean;
  activeId: string | null;
  flashId: string | null;
  keyboardEnabled: boolean;
  labels: { recommend: string; not_recommend: string };
  onActivate: (id: string) => void;
  onPick: (id: string, value: "recommend" | "not_recommend") => void;
  onPending: () => void;
  emptyText: string;
  onShowAll: () => void;
  /** Jump to the next undecided person after a first decision (default on). */
  autoAdvance?: boolean;
};

/** A single ordered DOM serves both the desktop table and touch-friendly narrow layout. */
export function VoteCandidateList(props: Props) {
  const rows = useRef(new Map<string, HTMLTableRowElement>());
  const { activeId, candidates } = props;
  useEffect(() => {
    if (!activeId) return;
    const row = rows.current.get(activeId);
    row?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    row?.focus({ preventScroll: true });
  }, [activeId, candidates]);

  // Latest props behind refs keep row callbacks stable, so memoized rows skip re-rendering.
  const latest = useRef(props);
  latest.current = props;
  const advanceFrom = useRef<string | null>(null);
  const activate = useCallback((id: string) => latest.current.onActivate(id), []);
  const pick = useCallback((id: string, value: "recommend" | "not_recommend") => {
    if (!latest.current.choices[id]) advanceFrom.current = id;
    latest.current.onPick(id, value);
  }, []);
  useEffect(() => {
    if (!props.keyboardEnabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="dialog"], [role="alertdialog"]'))) return;
      // Native Space activates a focused button; don't hijack navigation or form controls.
      if (event.key === " " && target instanceof HTMLElement && target.closest('button, a, [role="tab"], [role="radio"]')) return;
      const action = voteKeyboardAction(event.key);
      if (!action) return;
      event.preventDefault();
      if (action === "pending") return props.onPending();
      const ids = candidates.map((candidate) => candidate.id);
      if (action === "next" || action === "previous") {
        const id = adjacentCandidateId(ids, activeId, action === "next" ? 1 : -1);
        if (id) props.onActivate(id);
        return;
      }
      const id = activeId && ids.includes(activeId) ? activeId : ids[0];
      if (!id) return;
      props.onActivate(id);
      // Same handler as clicks/taps, so keyboard decisions also auto-advance.
      pick(id, action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props, activeId, candidates, pick]);

  const registerRow = useCallback((id: string, element: HTMLTableRowElement | null) => {
    if (element) rows.current.set(id, element); else rows.current.delete(id);
  }, []);
  // After a first decision is accepted, move focus to the next undecided person.
  useEffect(() => {
    const from = advanceFrom.current;
    if (!from || !props.choices[from]) return;
    advanceFrom.current = null;
    if (props.autoAdvance === false) return;
    const start = candidates.findIndex((c) => c.id === from);
    const order = [...candidates.slice(start + 1), ...candidates.slice(0, Math.max(start, 0))];
    const next = order.find((c) => !props.choices[c.id]);
    if (next) props.onActivate(next.id);
  }, [props, candidates]);

  return (
    <table className="vote-candidate-table w-full">
      <thead><tr className="hairline-b text-left text-muted-foreground">
        <th className="font-normal">姓名</th><th className="font-normal">单位</th><th className="font-normal">现职称</th>
        {props.showVotes ? <th className="font-normal">学科组推荐票</th> : null}
        <th className="font-normal">表决</th>
      </tr></thead>
      <tbody>
        {candidates.length === 0 ? <tr><td colSpan={props.showVotes ? 5 : 4} className="py-10 text-center text-muted-foreground">
          {props.emptyText}<Button variant="link" onClick={props.onShowAll}>查看全部</Button>
        </td></tr> : null}
        {candidates.map((candidate, index) => {
          const previous = candidates[index - 1];
          const newGroup = props.showGroups && (!previous || previous.group_id !== candidate.group_id);
          return [
            newGroup ? <tr key={`group-${candidate.id}`} className="vote-group-row bg-muted/60"><td colSpan={props.showVotes ? 5 : 4}>
              {candidate.group_id ? props.groupNames[candidate.group_id] ?? "未分组" : "未分组"}
            </td></tr> : null,
            <CandidateRow key={candidate.id} candidate={candidate} index={index} choice={props.choices[candidate.id]}
              active={activeId === candidate.id || props.flashId === candidate.id} showVotes={props.showVotes}
              labels={props.labels} onActivate={activate} onPick={pick} registerRow={registerRow} />,
          ];
        })}
      </tbody>
    </table>
  );
}

type RowProps = {
  candidate: JudgeCandidate;
  index: number;
  choice: string | undefined;
  active: boolean;
  showVotes: boolean;
  labels: { recommend: string; not_recommend: string };
  onActivate: (id: string) => void;
  onPick: (id: string, value: "recommend" | "not_recommend") => void;
  registerRow: (id: string, element: HTMLTableRowElement | null) => void;
};

const CandidateRow = memo(function CandidateRow({ candidate, index, choice, active, showVotes, labels, onActivate, onPick, registerRow }: RowProps) {
  return (
    <tr tabIndex={0} aria-label={`${candidate.full_name}，${choice ? labels[choice as keyof typeof labels] ?? "已表态" : "未表态"}`}
      ref={(element) => registerRow(candidate.id, element)}
      onFocus={() => onActivate(candidate.id)} onPointerDown={() => onActivate(candidate.id)}
      data-active={active}
      className="vote-candidate-row hairline-b outline-none">
      <td className="vote-candidate-name break-words font-medium">
        <span className="mr-2 text-muted-foreground tabular-nums">{index + 1}.</span>{candidate.full_name}
        {!choice ? <span aria-label="未表态" className="ml-2 inline-block h-2 w-2 rounded-full bg-primary" /> : null}
      </td>
      <td className="vote-candidate-detail break-words text-muted-foreground"><span className="vote-mobile-label">单位：</span>{candidate.unit ?? "—"}</td>
      <td className="vote-candidate-detail break-words text-muted-foreground"><span className="vote-mobile-label">现职称：</span>{candidate.current_title ?? "—"}</td>
      {showVotes ? <td className="vote-candidate-detail"><span className="vote-mobile-label">学科组推荐票：</span>{candidate.agree_votes ?? 0}{candidate.total_votes ? ` / ${candidate.total_votes}` : ""}</td> : null}
      <td className="vote-candidate-actions">
        <div role="group" aria-label={`${candidate.full_name} 表决`} className="grid grid-cols-2 border">
          {(["recommend", "not_recommend"] as const).map((option) => <Button key={option} variant="ghost" aria-pressed={choice === option} data-choice={option}
            onClick={() => onPick(candidate.id, option)}
            className={`vote-choice min-h-11 h-auto min-w-0 whitespace-normal rounded-none px-3 py-2 [&+&]:border-l ${choice === option ? option === "recommend" ? "bg-vote-recommend-bg text-vote-recommend hover:bg-vote-recommend-bg hover:text-vote-recommend ring-1 ring-inset ring-vote-recommend/50" : "bg-vote-reject-bg text-vote-reject hover:bg-vote-reject-bg hover:text-vote-reject ring-1 ring-inset ring-vote-reject/50" : "text-muted-foreground"}`}>
            {labels[option]}
          </Button>)}
        </div>
      </td>
    </tr>
  );
});
