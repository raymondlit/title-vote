<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Multi-round voting: a session's fixed candidate pool (`vote_sessions.candidate_ids`) and per-round quota (`max_recommend`) take precedence over category/group/committee scoping and voting rules; always resolve via `src/lib/rounds.ts` helpers in client pages and `submitBallot` so judges, server validation and results stay consistent.
- Read ballot_items through `fetchAllBallotItems` (paged) — single queries cap at 1000 rows and would silently drop votes.
- Tests: `bunx vitest run --root . --dir src/lib`.
- Vote sessions: archiving is a soft hide via `vote_sessions.archived_at` (judges' RLS hides archived rows; ballots cannot be inserted); hard deletion is only possible through the `deleteVoteSession` server function after re-verifying the admin's password — authenticated users have no DELETE grant on vote_sessions.
