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
- Multi-round voting: a session's fixed candidate pool (`vote_sessions.candidate_ids`) and per-round quota (`max_recommend`) take precedence over category/group/committee scoping and voting rules; client pages resolve them via `src/lib/rounds.ts`/`voteRules.ts` helpers, and ballot submission validates and writes in the single-transaction SQL function `public.submit_ballot` (SECURITY INVOKER, called by `submitBallot`) — any rule change must update both so judges, server validation and results stay consistent.
- Read ballot_items through `fetchAllBallotItems` (paged) — single queries cap at 1000 rows and would silently drop votes.
- Tests: `bunx vitest run --root . --dir src/lib`.
- Vote sessions: archiving is a soft hide via `vote_sessions.archived_at` (judges' RLS hides archived rows; ballots cannot be inserted); hard deletion is only possible through the `deleteVoteSession` server function after re-verifying the admin's password — authenticated users have no DELETE grant on vote_sessions.
- Any admin deletion of vote records (sessions, `vote_archives`, clearing offline group results) goes through a server function that calls `verifyOwnPassword`, and the UI uses `PasswordConfirmDialog` with an archive/keep hint — so destructive actions are re-authenticated server-side and consistently steer admins toward archiving. Authenticated users have no DELETE grant on vote_archives.
- Browser traffic to the backend (auth/rest/storage) is rewritten by `src/lib/backendProxy.ts` to the same-origin relay `src/routes/api/public/sb/$.ts` — users in mainland China cannot reach the backend host directly; the relay only forwards the caller's own key/token so RLS still applies. Realtime websockets stay direct, so every live-updating view must also poll.
- Emergency paper ballots: grouping/pagination live in pure `src/lib/paperBallot.ts` and one canvas renderer (`paperBallotPdf.ts`) feeds preview, PDF and print, so all three stay identical; candidate order comes from `judgeOrder.ts` so paper matches the judge screen.
