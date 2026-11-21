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
- Login reads the caller-only SECURITY INVOKER get_current_account snapshot and validates its account ID; warm component chunks without protected route guards to reduce requests without weakening RLS.
- Multi-round voting: a session's fixed candidate pool (`vote_sessions.candidate_ids`) and per-round quota (`max_recommend`) take precedence over category/group/committee scoping and voting rules; client pages resolve them via `src/lib/rounds.ts`/`voteRules.ts` helpers, and ballot submission validates and writes in the single-transaction SQL function `public.submit_ballot` (SECURITY INVOKER, called by `submitBallot`) — any rule change must update both so judges, server validation and results stay consistent.
- Read ballot_items through `fetchAllBallotItems` (paged) — single queries cap at 1000 rows and would silently drop votes.
- Tests: `bunx vitest run --root . --dir src/lib`.
- Vote sessions: archiving is a soft hide via `vote_sessions.archived_at` (judges' RLS hides archived rows; ballots cannot be inserted); hard deletion is only possible through the `deleteVoteSession` server function after re-verifying the admin's password — authenticated users have no DELETE grant on vote_sessions.
- Any admin deletion of vote records (sessions, `vote_archives`, clearing offline group results) goes through a server function that calls `verifyOwnPassword`, and the UI uses `PasswordConfirmDialog` with an archive/keep hint — so destructive actions are re-authenticated server-side and consistently steer admins toward archiving. Authenticated users have no DELETE grant on vote_archives.
- Browser traffic to the backend (auth/rest/storage) is rewritten by `src/lib/backendProxy.ts` to the same-origin relay `src/routes/api/public/sb/$.ts` — users in mainland China cannot reach the backend host directly; the relay only forwards the caller's own key/token so RLS still applies. Realtime websockets stay direct, so every live-updating view must also poll.
- The same-origin relay must forward HEAD and HTTP 204/205/304 with a null body; otherwise successful mutations become false 500 errors.
- Roster E2E tests create uniquely named disposable schools through the real UI, keep credentials in memory, and clean only their own fixture in finally; this avoids contaminating live reviews.
- Emergency paper ballots: grouping/pagination live in pure `src/lib/paperBallot.ts` and one canvas renderer (`paperBallotPdf.ts`) feeds preview, PDF and print, so all three stay identical; candidate order comes from `judgeOrder.ts` so paper matches the judge screen.
- Judge ballots use one responsive candidate DOM in `VoteCandidateList`; keyboard actions go through the same pick handler and pause in dialogs, so touch, mouse and keyboard preserve identical rules.
- Static school metadata uses the shared five-minute SWR policy and school-scoped category/group query options in `metadata.ts`; keep mutation prefix invalidations and do not apply this policy to ballots or live results.
- Confirmed ballots use an account-scoped persistent browser queue in the judge layout; retries keep payloads immutable and the server verifies the queued account and exact stored choices before accepting a duplicate. Keep `submit_ballot` as the sole transactional writer to preserve vote rules and prevent duplicate or overwritten votes.
- Results use the admin-only SECURITY INVOKER `get_session_summary` RPC for live counts; fetch paged ballot details only for confirmation sheets, printing and archives, so live refresh cost does not scale with ballot-item count.
- Judge workspaces share one account-bound renewal guard on foreground resume, heartbeat and delivery; refresh near expiry before sending, and keep drafts and queued ballots intact during inline reauthentication, so expired or switched accounts never submit another account's ballot.
