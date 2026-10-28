# Keeper.sh

Keeper.sh is a TypeScript monorepo (Bun workspaces + Turborepo) for a calendar-syncing tool. It is split into `applications/` (a Vite/React web app with a Bun server and a vitest test suite), `services/` (api, cron, mcp, worker — Bun-run backend services), and `packages/` (shared libraries including a Postgres-backed `database` package, `auth`, `calendar`, `queue`, `sync`, etc.). Linting uses oxlint/eslint, unused-code detection uses knip, and task orchestration across the workspace is handled by Turborepo.

## Setup

Install dependencies:

    bun install

## Verification

Type-check with `bun run types` (runs each workspace's `tsc --noEmit` via Turborepo), lint with `bun run lint`, build with `bun run build`, and run the test suite with `bun run test` (runs each workspace's vitest suite via Turborepo).

<!-- RALPH_CHECK_COMMANDS
bun run types
bun run lint
bun run unused
RALPH_CHECK_COMMANDS_END -->

<!-- RALPH_BUILD_COMMANDS
bun run build
RALPH_BUILD_COMMANDS_END -->

<!-- RALPH_REGRESSION_COMMANDS
bun run test
RALPH_REGRESSION_COMMANDS_END -->
