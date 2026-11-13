import { useEffect, useRef } from "react";
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
      props.onPick(id, action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props, activeId, candidates]);

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
          const choice = props.choices[candidate.id];
          return [
            newGroup ? <tr key={`group-${candidate.id}`} className="vote-group-row bg-muted/60"><td colSpan={props.showVotes ? 5 : 4}>
              {candidate.group_id ? props.groupNames[candidate.group_id] ?? "未分组" : "未分组"}
            </td></tr> : null,
            <tr key={candidate.id} tabIndex={0} aria-label={`${candidate.full_name}，${choice ? props.labels[choice as keyof typeof props.labels] ?? "已表态" : "未表态"}`}
              ref={(element) => { if (element) rows.current.set(candidate.id, element); else rows.current.delete(candidate.id); }}
              onFocus={() => props.onActivate(candidate.id)} onPointerDown={() => props.onActivate(candidate.id)}
              data-active={activeId === candidate.id || props.flashId === candidate.id}
              className="vote-candidate-row hairline-b outline-none">
              <td className="vote-candidate-name break-words font-medium">
                <span className="mr-2 text-muted-foreground tabular-nums">{index + 1}.</span>{candidate.full_name}
                {!choice ? <span aria-label="未表态" className="ml-2 inline-block h-2 w-2 rounded-full bg-primary" /> : null}
              </td>
              <td className="vote-candidate-detail break-words text-muted-foreground"><span className="vote-mobile-label">单位：</span>{candidate.unit ?? "—"}</td>
              <td className="vote-candidate-detail break-words text-muted-foreground"><span className="vote-mobile-label">现职称：</span>{candidate.current_title ?? "—"}</td>
              {props.showVotes ? <td className="vote-candidate-detail"><span className="vote-mobile-label">学科组推荐票：</span>{candidate.agree_votes ?? 0}{candidate.total_votes ? ` / ${candidate.total_votes}` : ""}</td> : null}
              <td className="vote-candidate-actions">
                <div role="group" aria-label={`${candidate.full_name} 表决`} className="grid grid-cols-2 border">
                  {(["recommend", "not_recommend"] as const).map((option) => <Button key={option} variant="ghost" aria-pressed={choice === option} data-choice={option}
                    onClick={() => props.onPick(candidate.id, option)}
                    className={`vote-choice min-h-11 h-auto min-w-0 whitespace-normal rounded-none px-3 py-2 [&+&]:border-l ${choice === option ? option === "recommend" ? "bg-vote-recommend-bg text-vote-recommend hover:bg-vote-recommend-bg hover:text-vote-recommend ring-1 ring-inset ring-vote-recommend/50" : "bg-vote-reject-bg text-vote-reject hover:bg-vote-reject-bg hover:text-vote-reject ring-1 ring-inset ring-vote-reject/50" : "text-muted-foreground"}`}>
                    {props.labels[option]}
                  </Button>)}
                </div>
              </td>
            </tr>,
          ];
        })}
      </tbody>
    </table>
  );
}