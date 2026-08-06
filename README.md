# FrameBranch

Semantic version-control engine for video timelines — branch, diff, and merge edits at the timeline level instead of file-level diffs.

Status: feature-complete. Engine (`packages/engine` — 8 verbs, diff, 3-way merge, OTIO import/export, benchmarks), server (`apps/web` — API routes, 8-table Postgres schema, merge/conflict resolution), and UI (timeline, editing, branch/merge/history panels) are all built and merged.

> Semantic diff of a 10,000-clip timeline in 3.20 ms, 3-way merge in 724.75 ms, backed by 363 tests and 10,000 fuzz cases.

## Documentation

- [Project Requirements Document](docs/PRD.md) — what this is and why, what's in scope and out
- [High-Level Design](docs/HLD.md) — architecture, storage, API, reliability
- [Algorithms](docs/ALGORITHMS.md) — the diff engine, split identity, and the 3-way merge
- [Low-Level Design](docs/LLD.md) — types, database schema, API reference
- [Open Questions](docs/OPEN-QUESTIONS.md) — genuinely unresolved design questions

Suggested reading order: PRD → HLD → Algorithms → LLD → Open Questions.

## Running the server locally

The API needs a real Postgres — locally that is Homebrew Postgres, in
production Neon. The same `DATABASE_URL` shape drives both.

```bash
brew install postgresql@14
pg_ctl -D /opt/homebrew/var/postgresql@14 start
createdb framebranch && createdb framebranch_test

cp apps/web/.env.example apps/web/.env      # localhost URLs, no secrets
pnpm install

# ONE command fills an empty database from the committed migration:
pnpm --filter @framebranch/web db:migrate

pnpm test                                    # engine + server tests
pnpm --filter @framebranch/web dev
```

The server tests truncate every table between tests, so `TEST_DATABASE_URL`
must point at a throwaway database (`framebranch_test` above), never at the
one you develop against.
