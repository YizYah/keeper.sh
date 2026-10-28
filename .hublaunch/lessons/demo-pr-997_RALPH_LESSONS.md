# HubLaunch Lessons Learned

This file persists context across agent sessions. Update it as you work.

## Current Status
- Phase: COMPLETE
- Last action: Implemented + verified; committing fix.
- Blockers: None

## Key Discoveries
- `bun` was NOT preinstalled in the container. Installed via `curl -fsSL https://bun.sh/install | bash`; binary lands at `~/.bun/bin/bun`. Must `export PATH="$HOME/.bun/bin:$PATH"` in every Bash call. Then `bun install` at repo root.
- Recurring gotcha: `ralph-run.sh: bun: command not found` is just the harness's shell missing `~/.bun/bin` on PATH — NOT a real type/lint/unused error. `bun` is already installed from the earlier run; just export PATH before invoking checks. Re-verified 2026-10-28: working tree was already clean (no pending code changes), and `bun run types; bun run lint; bun run unused` all passed with zero errors/warnings — no fixes were needed.
- Re-re-verified 2026-10-28 (second pass same day): identical clean result — `types` 17/17 cached OK, `lint` 17/17 cached 0 warnings/0 errors, `unused` (knip) exit 0 with only the same pre-existing `@keeper.sh/fixtures` ignoreDependencies hint. Confirms the "bun: command not found" in the issue report is purely a PATH artifact of the harness invocation, not a signal of real check failures — safe to treat as a false positive once `bun` has been installed once in the container.
- Re-re-re-verified 2026-10-28 (third pass, production build task): working tree clean, `bun --version` → 1.4.4 once `~/.bun/bin` is on PATH. Ran full `bun run build` (turbo, 5/5 tasks) with zero errors — `@keeper.sh/web` built successfully (rolldown/vite SSR build, server.js + client/server assets emitted). Reconfirms this is 100% a harness PATH artifact; no source changes were made or needed.
- Re-re-re-re-verified 2026-10-28 (fourth pass, "production build failed" task where the sole reported error was the bun-not-found line): same root cause confirmed again. `git status --short` was clean, `bun run build` (5/5 tasks, 4 cached) succeeded in 16.1s total with zero errors. No code fix needed — only action required was exporting `~/.bun/bin` onto PATH before invoking bun.
- Re-re-re-re-re-verified 2026-10-28 (fifth pass, regression-test task with empty "FAILED REGRESSION OUTPUT" and only the bun-not-found line in full output): identical root cause confirmed a fifth time. `git status --short` clean, `bun run types` (17/17 cached OK), `bun run lint` (17/17 cached, 0 warnings/0 errors), `bun run unused` (knip exit 0, only the same pre-existing `@keeper.sh/fixtures` hint), and calendar's own `TZ=UTC bun x --bun vitest run` (265 files / 2206 tests, all passed) all green. No code changes made or needed.
- Re-re-re-re-re-re-verified 2026-10-28 (sixth pass, same regression-test task shape — empty FAILED OUTPUT + bun-not-found in full output): sixth consecutive confirmation of the same false positive. `git status --short` clean. Ran the complete matrix: `bun run types` (17/17 OK), `bun run lint` (17/17, 0 warnings/0 errors), `bun run unused` (knip exit 0, same pre-existing hint), `bun run test` (11/11 tasks incl. calendar's 265 files/2206 tests, all passed, ~3m19s uncached), `bun run build` (5/5 tasks, web app built in 3.14s). Zero failures anywhere. No code changes made or needed — confirms this is a reliable, repeatable artifact of the harness's shell not sourcing `~/.bun/bin` onto PATH before invoking the regression check, not a real test/build issue.
- Re-re-re-re-re-re-re-verified 2026-10-28 (seventh pass, identical regression-test task shape — empty FAILED OUTPUT + bun-not-found in full output): seventh consecutive confirmation of the same false positive. `git status --short` clean. `bun run types` (17/17 OK), `bun run lint` (17/17, 0 warnings/0 errors), `bun run unused` (knip exit 0, same pre-existing hint), and calendar's `TZ=UTC bun x --bun vitest run` (265 files / 2206 tests, all passed in 94.87s). No code changes made or needed. If this keeps recurring, the real fix belongs in the harness invocation (ralph-run.sh) sourcing `~/.bun/bin` onto PATH, not in this repo's source.
- Re-re-re-re-re-re-re-re-verified 2026-10-28 (eighth pass, identical regression-test task shape — empty FAILED OUTPUT + bun-not-found in full output): eighth consecutive confirmation of the same false positive. `git status --short` clean. `bun run types` (17/17 OK), `bun run lint` (17/17, 0 warnings/0 errors), `bun run unused` (knip exit 0, same pre-existing hint), `bun run test` (11/11 tasks incl. calendar's 265 files/2206 tests, all passed, ~3m17s uncached). No code changes made or needed.
- Re-re-re-re-re-re-re-re-re-verified 2026-10-28 (ninth pass, identical regression-test task shape — empty FAILED OUTPUT + bun-not-found in full output): ninth consecutive confirmation of the same false positive. `git status --short` clean. Full matrix green: `bun run types` (17/17 OK), `bun run lint` (17/17, 0 warnings/0 errors), `bun run unused` (knip exit 0, same pre-existing `@keeper.sh/fixtures` hint), `bun run test` (11/11 tasks, calendar 265 files/2206 tests all passed, ~3m15s uncached), `bun run build` (5/5 tasks, web built in 3.06s). No code changes made or needed. Pattern is extremely well-established now — if seen again, skip straight to running the matrix with PATH fixed rather than re-deriving the diagnosis.
- Verification commands: root-level `bun run types`, `bun run lint`, `bun run unused` (knip), `bun run build`, `bun run test`. The calendar package also has its own `bun run test` (`TZ=UTC bun x --bun vitest run`).
- Base context was byte-identical to plan: `types.ts:25` and `fetch-events.ts:377` matched exactly; no conflict resolution needed.

## Solutions That Worked
- Phase 1-3 implemented verbatim from plan (types.ts 2 optional fields, new conference-link.ts util, wire-in at fetch-events.ts).
- Test file drives through exported `parseGoogleEvents`, covers all 8 Testing-Strategy cases + immutability (structuredClone/toEqual) + 3-distinct-hash case via `createSyncEventContentHash({...event, summary: event.title ?? ""})`.

## Things to Avoid
- oxlint `no-undefined`: cannot write `description: undefined` literal in tests — omit the key instead (base factory leaves it undefined).
- oxlint `capitalized-comments`: a two-line `//` comment flags the continuation line as lowercase. Use a block comment `/* ... */` (repo idiom in fetch-events.ts) instead.

## Files Modified
- packages/calendar/src/providers/google/source/types.ts (added hangoutLink?, conferenceData? optional fields)
- packages/calendar/src/providers/google/source/utils/fetch-events.ts (import + description assignment)
- packages/calendar/src/providers/google/source/utils/conference-link.ts (NEW util)
- packages/calendar/tests/providers/google/source/utils/conference-link.test.ts (NEW spec)

## Verification Results
- types: 17 tasks OK
- lint: 0 warnings 0 errors
- unused (knip): exit 0 (only a pre-existing config hint for @keeper.sh/fixtures, unrelated)
- build: exit 0
- calendar test suite: 2206 passed / 265 files

## Next Steps
- Done. Only the 4 fix files committed (not ralph.md / lessons / .hublaunch infra).
