# HubLaunch Lessons Learned

This file persists context across agent sessions. Update it as you work.

## Current Status
- Phase: COMPLETE
- Last action: Implemented + verified; committing fix.
- Blockers: None

## Key Discoveries
- `bun` was NOT preinstalled in the container. Installed via `curl -fsSL https://bun.sh/install | bash`; binary lands at `~/.bun/bin/bun`. Must `export PATH="$HOME/.bun/bin:$PATH"` in every Bash call. Then `bun install` at repo root.
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
