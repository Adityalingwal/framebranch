# IMPLEMENTATION-NOTES

**Rule of this file:** every assumption a coding agent makes while implementing
goes here as a dated entry (what was assumed + why it was safe to decide
locally). Only *trivial tooling details* may be assumed; anything design-level
that a doc does not answer is a **blocker — stop work and report it, do not
guess** (docs/00-INDEX.md standing rules). This file is the audit trail the
owner reads to see what was decided without him.

## 2026-08-03 — Milestone 1 (repo skeleton)

- **README.md replaced with the M1 stub.** The old research-phase README
  (2026-07-27, pointing at superseded docs 01–06) was overwritten per the M1
  brief's deliverable + its README carve-out. Since the folder is not yet a
  git repo, the old content was backed up to the session scratchpad
  (`README-pre-M1-backup.md`) before overwriting.
- **pnpm via corepack:** pnpm was not installed globally; activated through
  corepack (`corepack enable`), resolved to pnpm 10.34.5, pinned in root
  `package.json` `"packageManager"` so CI and local use the same version.
- **tsconfig.base.json:** `strict: true` (locked) plus standard non-behavioral
  options only: ES2022 target/lib, ESNext modules + Bundler resolution,
  `esModuleInterop`, `isolatedModules`, `skipLibCheck`,
  `forceConsistentCasingInFileNames`, `noEmit` (no build output needed yet).
- **ESLint = flat config** (`eslint.config.mjs`) with `@eslint/js` recommended
  + `typescript-eslint` recommended + `eslint-config-prettier` (so lint never
  fights formatting). No custom rules — "default/recommended" lock.
- **Prettier = pure defaults** (`.prettierrc.json` is `{}`). `docs/`,
  `archive/`, and the historical analysis file are prettier-ignored so tooling
  never touches hand-written design docs.
- **Engine package named `@framebranch/engine`**, `private: true`, version
  0.0.0, `"exports"` pointing at `src/index.ts` directly (no build step in M1;
  a build/dist setup is a later-milestone tooling decision).
- **Placeholder test location:** `packages/engine/tests/index.test.ts` —
  matches C7's `tests/` folder mention. Vitest picked with zero config
  (default include pattern covers it).
- **CI pins Node 20** (matches local Node v20.19.6) and takes pnpm's version
  from the `packageManager` field. Fuzz (step 4, TODO M4) and coverage +
  gap-script (step 5, TODO) are commented placeholders in the locked T5 order;
  benchmarks deliberately absent (T5 lock).
