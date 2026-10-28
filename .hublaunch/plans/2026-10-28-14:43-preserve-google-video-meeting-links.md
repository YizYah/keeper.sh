# Preserve Google video-meeting links in synced event descriptions

## Plan Summary

- **What / why:** When Keeper ingests a Google Calendar source event, the join URL that Google exposes in `hangoutLink` or `conferenceData.entryPoints` (but not necessarily in the body) is currently dropped, so synced appointments can lose their video-meeting link. This change appends that link to the copied description during ingest.
- **Key decision:** Carry forward upstream stuck PR #997 by @lybertybox443 verbatim where it still applies — a small pure utility (`resolveGoogleDescription`) that prefers `hangoutLink`, falls back to an HTTP(S) `"video"` entry point, keeps the author's `"Join Google Meet: <url>"` / `"Join video meeting: <url>"` label wording, and only appends when the link is not already present (`description.includes(link)` guard). No extra gating was added (safer-alternative answer = keep the feature as designed, disclose the one-time re-push in the PR body).
- **Most important files:** `packages/calendar/src/providers/google/source/utils/conference-link.ts` (new util), `packages/calendar/src/providers/google/source/utils/fetch-events.ts:377` (wire-in), `packages/calendar/src/providers/google/source/types.ts:25` (two optional fields), plus a new vitest spec.
- **Priority / complexity:** Low complexity, high confidence — the author's base context is byte-identical to current `main` (commit `462be1ab`), so the work applies with no conflict resolution. No new dependencies, no schema change, no config/CI edits.
- **One behavioural note to surface:** because the synced `description` feeds `createSyncEventContentHash`, the first ingest after merge re-pushes every Google event that has a conference link (its hash shifts once). This is intended and must be stated plainly in the PR body, not suppressed.

## Problem Statement

Google Calendar events can carry their meeting join URL in `hangoutLink` and/or `conferenceData.entryPoints` while omitting it from the event `description`. Keeper's Google source conversion assigns `description: event.description` directly (`packages/calendar/src/providers/google/source/utils/fetch-events.ts:377`), so when the URL lives only in those conference fields it is never copied to the synced destination event, and the user loses their join link.

Upstream `ridafkih/keeper.sh` PR #997 ("fix(google): preserve video meeting links in synced descriptions", opened by @lybertybox443, +118/-1 across 4 files) fixes this but has gone stale — its mergeable state is `blocked`. This plan reproduces the same intent as a fresh change branched from the current `main` on the fork `YizYah/keeper.sh`, preserving the author's work as far as it still applies.

#### Planning Context

**Key requirements**
- On Google source conversion, append the event's video-meeting URL to the copied description, preferring `hangoutLink` and falling back to an HTTP(S) `conferenceData.entryPoints` entry whose `entryPointType === "video"`.
- Preserve any existing description; append the link on its own paragraph only when the description does not already contain that exact link.
- Leave the Google source event object unmutated.
- Rebuild the description on every ingest so a changed or removed conference link flows through the existing content hash.

**Decisions made (with rationale)**
- **Carry the author's design forward verbatim where it still applies** (util name/shape, resolution order, HTTP(S) gating, `includes(link)` dedupe, and the exact label wording `"Join Google Meet: <url>"` / `"Join video meeting: <url>"`). Rationale: the task is to carry forward their PR, not redesign it; the base context still matches `main` so nothing needs re-deriving. (Confirmed answer: keep labels as written.)
- **No additional gating around the content-hash re-push.** The user chose the "safer alternative" meaning *keep the feature exactly as designed* and simply disclose the one-time re-push in the PR body — not add opt-in logic or suppress the churn. Rationale: smallest change; the author's original added no such gate.
- **No schema change in `packages/data-schemas`.** `googleEventSchema` (`packages/data-schemas/src/index.ts:110`) does not set `"+": "reject"` and there is no global `configure({ onUndeclaredKey })`, so ArkType v2 retains the undeclared `hangoutLink` / `conferenceData` keys and they reach the parser untouched. The original +118/-1 PR likewise left the schema alone.
- **No `.hublaunch/goals.md` and no files outside the fix.** (Confirmed answer: do not add project-goals file; this PR goes upstream and must contain only the change.)

**Out of scope**
- Microsoft/Outlook-source meeting-link extraction.
- Destination-side native conferencing metadata (e.g. populating real conference fields on the destination event rather than text in the description).
- Any user-facing opt-in setting.
- Editing the Google source event, CI workflows, release config, licence, `FUNDING.yml`, or security files.
- Referencing the upstream issue/PR number (`#997` / `997`) in any commit message, branch name, or PR text on this fork.

## Detailed Requirements

**Functional**
1. Extract a conference link from a `GoogleCalendarEvent`, in priority order:
   1. `event.hangoutLink`
   2. the `uri` of each `conferenceData.entryPoints[]` entry with `entryPointType === "video"`, in array order.
2. Accept a candidate only if, after `trim()`, it parses as a URL whose protocol is `http:` or `https:`. Skip invalid or non-web candidates and continue to the next one (so an invalid `hangoutLink` falls through to a valid video entry point).
3. If no valid link is found, return `event.description` unchanged (which may be `undefined`).
4. If the resolved `event.description` already contains the link substring, return `event.description` unchanged (dedupe).
5. Otherwise build a line `"<label>: <link>"` where `label` is `"Join Google Meet"` when the link's hostname is `meet.google.com`, else `"Join video meeting"`. Append it to the existing description separated by a blank line (`\n\n`); if there is no existing description, the line itself becomes the description.
6. The Google source event object passed in must not be mutated.

**Technical**
- Add two optional fields to the local `GoogleCalendarEvent` interface: `hangoutLink?: string;` and `conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };`.
- Implement resolution in a new pure util module and call it at the single `description` assignment site in `parseGoogleEventsWithDiagnostics`.
- TypeScript strict compile (`tsc --noEmit`) and `oxlint` on changed files must pass.
- No new runtime or dev dependencies.

**Non-Functional**
- Match repo idioms exactly: per-field `resolve*` helpers over `GoogleCalendarEvent`, guard-clause / early-return style, `?.` + `??` chaining, `new URL()`-in-`try/catch` URL validation.
- The appended line must be plain text (no HTML) so it survives the downstream HTML→plain-text projection unchanged.
- One logical change, Conventional-Commits subject in the repo's style.

## Proposed Solution

Introduce a pure helper `resolveGoogleDescription(event)` in a new file `packages/calendar/src/providers/google/source/utils/conference-link.ts`, following the exact shape and naming of the existing per-field resolvers (`resolveGoogleAvailability` at `fetch-events.ts:295`, `resolveGoogleLocation` at `fetch-events.ts:313`, `resolveSourceEventType` at `fetch-events.ts:332`). It builds a candidate list (`hangoutLink` first, then `"video"` entry-point URIs), picks the first that `isWebLink()` accepts, dedupes against the existing description, and appends a labelled line.

Wire it in at the one assignment site (`fetch-events.ts:377`), changing `description: event.description` to `description: resolveGoogleDescription(event)`. Add the two optional interface fields so the data is typed and reachable. No other production code changes.

```
Google HTTP body
   │  googleEventListSchema.assert(...)   (fetch-events.ts:172 — undeclared keys retained)
   ▼
GoogleCalendarEvent { …, hangoutLink?, conferenceData? }   (types.ts:25)
   │  parseGoogleEventsWithDiagnostics loop   (fetch-events.ts:360)
   ▼
description: resolveGoogleDescription(event)   (fetch-events.ts:377 → conference-link.ts)
   ▼
EventTimeSlot.description ──► createSyncEventContentHash   (content-hash.ts:46)
```

The link lands in `EventTimeSlot.description`, which feeds `createSyncEventContentHash` (`content-hash.ts:46` normalizes and hashes `description`). That is exactly why a changed/removed conference link is picked up by change detection — and why already-synced events with a link re-push once on first ingest after merge.

## Technical Considerations

- **Dependencies:** none added. `new URL()` is a platform global; `vitest` (`^4.1.4`) and `structuredClone` are already used.
- **Schema / config:** no change to `packages/data-schemas/src/index.ts`. Undeclared keys already pass through `googleEventSchema.assert(...)`. Adding only *optional* properties to the `GoogleCalendarEvent` target interface keeps the narrower ArkType-inferred type assignable, so the existing `.assert(...)`-into-`PageFetchResult.data` assignment still compiles.
- **Security / safety:** the HTTP(S)-only `isWebLink` gate prevents `tel:`, `ftp:`, `mailto:`, or garbage strings from being surfaced as "join" links; the source event is never mutated (asserted by tests via `structuredClone` + `toEqual`).
- **Behavioural side-effect (must be disclosed in the PR body, not fixed):** first ingest after merge re-pushes every Google event that carries a conference link, because the description — and therefore the content hash — changes once. Previously ingested events only pick up their link after they are read again from Google.

## Testing Strategy

- **Unit:** add `packages/calendar/tests/providers/google/source/utils/conference-link.test.ts` (same directory and vitest `describe`/`it`/`it.each` conventions as the existing `fetch-events.test.ts` and `list-calendars.test.ts`). Drive the util through the already-exported `parseGoogleEvents` (`fetch-events.ts:398`) so behaviour is exercised end-to-end at the conversion boundary, and assert source immutability with `structuredClone` + `toEqual`. Cover: Meet link from `hangoutLink`; `"video"` entry point used while `"phone"`/dial-in ignored; `hangoutLink` preferred over an entry point; empty/undefined description; dedupe when the link is already present; no conference → description unchanged; invalid `hangoutLink` falling back to a valid video URI; and a content-hash case proving changed vs removed vs present yield three distinct hashes via `createSyncEventContentHash` (`content-hash.ts:43`).
- **Integration:** none added; the conversion path is covered through `parseGoogleEvents`. Existing suite must pass unchanged.
- **Manual:** none runnable in the sandbox — no live Google↔destination sync is available. State this secret/service gap in the PR body rather than weakening tests.
- **Commands:** `cd packages/calendar && bun run test` (i.e. `TZ=UTC bun x --bun vitest run`), `bun run types` (`tsc --noEmit`), `bun run lint` (`oxlint .`).

## Documentation Updates

None. There is no `CONTRIBUTING.md` and no `.github/PULL_REQUEST_TEMPLATE`; `README.md` only asks that large features be discussed in an issue first and is not affected. No user-facing docs cover source-event conversion. The behaviour is documented in code comments and in the PR body.

## Acceptance Criteria

1. A Google event whose join URL is only in `hangoutLink` produces a synced description ending with `"\n\nJoin Google Meet: <url>"` (or the line alone when there was no description).
2. When `hangoutLink` is absent, the first HTTP(S) `conferenceData.entryPoints` entry with `entryPointType === "video"` is used; non-video entries (e.g. `"phone"`/`tel:`) are ignored.
3. `hangoutLink` is preferred over any entry point when both exist.
4. A link already present in the description is not appended again (no duplicate line).
5. Non-HTTP(S) / unparseable candidates are skipped, falling through to the next valid candidate; if none is valid the description is returned unchanged (including `undefined`).
6. The input `GoogleCalendarEvent` is not mutated.
7. A link that is hostname `meet.google.com` yields label `"Join Google Meet"`; any other HTTP(S) host yields `"Join video meeting"`.
8. Changed / removed / present conference links yield distinct `createSyncEventContentHash` results.
9. `bun run test`, `bun run types`, and `bun run lint` all pass in `packages/calendar`.
10. No new dependency; no file touched outside the fix; no `#997`/`997` reference in any commit message, branch name, or PR text on this fork; the PR body credits @lybertybox443 and discloses the one-time re-push.

<details><summary><b>Implementation Detail</b></summary>

### Implementation Steps

**Phase 1 — Type the conference fields**
- File: `packages/calendar/src/providers/google/source/types.ts`
- In the `GoogleCalendarEvent` interface (starts line 25), add two optional members. Place them adjacent to the other optional fields; the author put them at the top of the interface, which is fine:
  ```ts
  interface GoogleCalendarEvent {
    hangoutLink?: string;
    conferenceData?: {
      entryPoints?: { entryPointType?: string; uri?: string }[];
    };
    id?: string;
    // …existing members unchanged…
  }
  ```

**Phase 2 — Add the resolver util**
- File (new): `packages/calendar/src/providers/google/source/utils/conference-link.ts`
- Implement a pure module mirroring the existing `resolve*` helpers (`fetch-events.ts:295`, `:313`, `:332`) and the `new URL()`-in-`try/catch` idiom (cf. `fetch-events.ts:111`):
  ```ts
  import type { GoogleCalendarEvent } from "../types";

  const isWebLink = (value: string): boolean => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  };

  // Build from the source description on each read: a changed or removed conference
  // link replaces the previous derived content without editing the Google event.
  const resolveGoogleDescription = (event: GoogleCalendarEvent): string | undefined => {
    const candidates = [
      event.hangoutLink,
      ...event.conferenceData?.entryPoints
        ?.filter((entry) => entry.entryPointType === "video")
        .map((entry) => entry.uri) ?? [],
    ];
    const link = candidates
      .map((candidate) => candidate?.trim())
      .find((candidate): candidate is string => Boolean(candidate && isWebLink(candidate)));

    if (!link || event.description?.includes(link)) {
      return event.description;
    }

    let label = "Join video meeting";
    if (new URL(link).hostname === "meet.google.com") {
      label = "Join Google Meet";
    }
    const conferenceLine = `${label}: ${link}`;
    if (event.description) {
      return `${event.description}\n\n${conferenceLine}`;
    }
    return conferenceLine;
  };

  export { resolveGoogleDescription };
  ```
- This is the author's implementation verbatim; it already matches repo style, so reproduce it as-is unless `oxlint` flags something on the current config (it did not for the original).

**Phase 3 — Wire it into conversion**
- File: `packages/calendar/src/providers/google/source/utils/fetch-events.ts`
- Add the import near the top of the file:
  ```ts
  import { resolveGoogleDescription } from "./conference-link";
  ```
- At line 377, change the single assignment inside `parseGoogleEventsWithDiagnostics` (loop at line 360):
  ```ts
  -      description: event.description,
  +      description: resolveGoogleDescription(event),
  ```
- No other edits to this file. `parseGoogleEvents` is already exported (line 398) for the test.

**Phase 4 — Tests**
- File (new): `packages/calendar/tests/providers/google/source/utils/conference-link.test.ts`
- Reproduce the author's spec (it still applies unchanged against current `main`). It imports `parseGoogleEvents` and `GoogleCalendarEvent` from the source util/types and `createSyncEventContentHash` from `../../../../../src/core/events/content-hash`, builds an event via a `parse()` helper, snapshots the source with `structuredClone`, parses, and asserts `toEqual(before)` for immutability. Keep all cases listed in the Testing Strategy. The content-hash case calls `createSyncEventContentHash({ ...event, summary: event.title ?? "" })` because `EventTimeSlot` exposes `title` while `SyncableEventContent` expects `summary`.

**Phase 5 — Validate & commit**
- Run `bun run test`, `bun run types`, `bun run lint` in `packages/calendar`; all must pass.
- Branch from `main`, named in words with no number (e.g. `fix/google-preserve-conference-links`). Single Conventional-Commits commit, e.g. `fix(google): preserve video meeting links in synced descriptions`. No `#997`/`997` anywhere in commit/branch/PR-fork text.

### Edge Cases
- `description` is `undefined` or `""` → the labelled line becomes the whole description (`""` is falsy, so it is treated as "no existing description").
- `hangoutLink` present but invalid (e.g. `"ftp://…"`, `"not a URL"`) → skipped; a valid `"video"` entry point is used if present, otherwise the description is returned unchanged.
- Multiple `"video"` entry points → first valid one in array order.
- Dial-in / `"phone"` / `"more"` entry points → never considered (filtered to `"video"`).
- Link already embedded (even inside HTML like `<a href="…">`) → `includes(link)` short-circuits; no duplicate.
- Non-Meet HTTP(S) host (e.g. Zoom) → `"Join video meeting"` label.
- `conferenceData` present but `entryPoints` undefined/empty → `?.` + `?? []` yields no candidates; description unchanged.

### Error Handling
- All URL parsing is wrapped so malformed strings never throw out of `resolveGoogleDescription`. The second `new URL(link)` (for hostname) only runs after `isWebLink(link)` already succeeded, so it cannot throw.

### Rollout / Migration
- One-time content-hash churn: on first ingest after merge, every Google event that carries a conference link gets its description rebuilt, shifting its hash once and causing a single re-push to destinations. No data migration; events pick up links only after being re-read from Google. Disclose this explicitly in the PR body.

### Assumptions
- Base context is byte-identical to the author's PR at current `main` (commit `462be1ab`): `types.ts:25–43` and `fetch-events.ts:377` match the PR's "before" context, so the change is re-derived cleanly with no conflict resolution (the diff's stale blob-hash header is irrelevant; do not `git apply` the raw patch — reproduce the edits).
- The repo test runner is **vitest** invoked via `TZ=UTC bun x --bun vitest run` (`packages/calendar/package.json:18`); the Understanding's phrase "Bun test runner" refers to this bun-driven vitest invocation, not `bun:test`. Author the spec as a vitest file (`import { describe, expect, it } from "vitest"`), matching the existing specs in the same directory.
- `googleEventSchema` tolerates undeclared keys (no `"+": "reject"`, no global `onUndeclaredKey`), so no `data-schemas` change is needed; adding only optional interface fields keeps the ArkType-inferred type assignable.
- The appended `"<label>: <url>"` line contains no `<`/HTML, so the downstream HTML→plain-text projector (`core/events/plain-text-description.ts`) leaves it unchanged; it is not on this code path at append time.
- Label wording is kept exactly as the author wrote it (`"Join Google Meet"` / `"Join video meeting"`) — confirmed decision, not a place to restyle.
- No `.hublaunch/goals.md` and no files outside the fix are created — confirmed decision.
- The dedupe guard remains `event.description?.includes(link)` with no further opt-in gating — confirmed "safer alternative" = keep feature as designed, disclose re-push in PR body.
- Branch is cut from and targets `main`; branch name and all fork-side text omit the upstream number; the PR body credits @lybertybox443 (the `#997` upstream link is added later by a person in the upstream PR body only).
- Sandbox cannot run live Google↔destination sync; validation is the vitest suite plus `tsc`/`oxlint` on changed files, with any secret/service gap stated in the PR body rather than worked around.

### Dependencies & Related Work
- Depends on no other in-flight work. Relates to upstream issue #1031 (dropped conference links) and #453 (broader conferencing support). This change addresses Google-source conference links only; native destination conferencing metadata, a user-facing opt-in, and Microsoft-source extraction remain future work.
- Files referenced: `packages/calendar/src/providers/google/source/types.ts:25`, `packages/calendar/src/providers/google/source/utils/fetch-events.ts:172,295,313,332,360,377,398`, `packages/calendar/src/core/events/content-hash.ts:43,46`, `packages/data-schemas/src/index.ts:110`, `packages/calendar/package.json:18`, existing specs in `packages/calendar/tests/providers/google/source/utils/`.

</details>
