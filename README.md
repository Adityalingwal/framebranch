# FrameBranch

Semantic version-control engine for video timelines — branch, diff, and merge edits at the timeline level instead of file-level diffs.

Design docs live in `/docs` (start at `docs/00-INDEX.md`).

Status: engine complete (`packages/engine` — 8 verbs, diff, 3-way merge, OTIO import/export, benchmarks). Server foundation in progress in `apps/web` (API routes only; no UI yet).

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

# framebranch
