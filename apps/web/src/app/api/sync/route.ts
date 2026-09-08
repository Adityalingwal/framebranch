/**
 * POST /api/sync — J1's ONE collaboration route.
 *
 * A tab says where it is and what it last saw; the answer is the project's
 * events since that point plus the other tabs that are alive right now.
 * Three seconds later it asks again. That is the whole channel: no SSE, no
 * WebSockets (there is no infrastructure for either here), and no
 * co-editing of one cut — everyone works on their own cut.
 *
 * **Presence is display-only. Nothing else reads the `presence` table and
 * no compare-and-swap ever will** (J1). It is a lock, not a note: the
 * moment a server decision consulted presence, a lost heartbeat would
 * become a lost edit.
 *
 * No ticket and no retry ladder: a heartbeat is not a mutation anyone may
 * replay, a failed tick is silent, and expiry covers a tab that stopped.
 */

import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";

import { presence, projectEvents } from "../../../db/schema";
import { handleRequest, readBody } from "../../../server/handler";
import { syncBodySchema } from "../../../server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** J1 IMPL-NOTE — a peer is alive if it was seen inside this window. */
const PEER_ALIVE_SECONDS = 10;
/**
 * …and its row is deleted only after a much longer one. The two differ on
 * purpose: the 10s rule is a FILTER, so a tab that was merely slow (a
 * throttled background timer, a long GC) reappears on its next tick
 * without an insert/delete dance.
 */
const PRESENCE_TTL_SECONDS = 60;
/**
 * A tick's page size. Past it the client simply gets the rest on the next
 * tick — a `more` flag would buy nothing at 3s intervals.
 */
const EVENT_PAGE = 200;

export type SyncEvent = {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  at: string;
};

export type Peer = {
  tabId: string;
  name: string;
  cut: string;
  playheadFrame: number;
  colourSeed: number;
  lastSeenAt: string;
};

export type SyncData = {
  cursor: number;
  events: SyncEvent[];
  peers: Peer[];
};

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project, editorName }) => {
    const body = await readBody(request, syncBodySchema);

    return db.transaction(async (tx): Promise<SyncData> => {
      // 1. This tab's heartbeat. `now()` is the DATABASE's clock on
      //    purpose: the expiry below and the peer window compare against
      //    the same clock, so a skewed laptop cannot make itself immortal
      //    or invisible.
      await tx
        .insert(presence)
        .values({
          projectId: project.id,
          tabId: body.tabId,
          name: editorName,
          cut: body.cut,
          playheadFrame: body.playheadFrame,
          colourSeed: body.colourSeed,
          lastSeenAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: [presence.projectId, presence.tabId],
          set: {
            name: editorName,
            cut: body.cut,
            playheadFrame: body.playheadFrame,
            colourSeed: body.colourSeed,
            lastSeenAt: sql`now()`,
          },
        });

      // 2. Lazy expiry — no scheduler anywhere in this app, so every tick
      //    sweeps its own project.
      await tx
        .delete(presence)
        .where(
          and(
            eq(presence.projectId, project.id),
            lt(
              presence.lastSeenAt,
              sql`now() - interval '${sql.raw(String(PRESENCE_TTL_SECONDS))} seconds'`,
            ),
          ),
        );

      // 3. The live peers — never the caller's own row (a tab does not
      //    draw a second playhead on top of its own).
      const peerRows = await tx
        .select()
        .from(presence)
        .where(
          and(
            eq(presence.projectId, project.id),
            ne(presence.tabId, body.tabId),
            gt(
              presence.lastSeenAt,
              sql`now() - interval '${sql.raw(String(PEER_ALIVE_SECONDS))} seconds'`,
            ),
          ),
        )
        .orderBy(asc(presence.name), asc(presence.tabId));

      const peers: Peer[] = peerRows.map((row) => ({
        tabId: row.tabId,
        name: row.name,
        cut: row.cut,
        playheadFrame: row.playheadFrame,
        colourSeed: row.colourSeed,
        lastSeenAt: row.lastSeenAt.toISOString(),
      }));

      // 4. Events. A FRESH tab (`cursor: null`) gets the current high-water
      //    mark and NOTHING else: it has just fetched everything it shows,
      //    so replaying the feed would only re-run invalidations (and, if a
      //    `New project` were in there, reset a tab that is already new).
      if (body.cursor === null) {
        const [latest] = await tx
          .select({ id: projectEvents.id })
          .from(projectEvents)
          .where(eq(projectEvents.projectId, project.id))
          .orderBy(desc(projectEvents.id))
          .limit(1);
        return { cursor: latest?.id ?? 0, events: [], peers };
      }

      const rows = await tx
        .select({
          id: projectEvents.id,
          kind: projectEvents.kind,
          payload: projectEvents.payload,
          createdAt: projectEvents.createdAt,
        })
        .from(projectEvents)
        .where(
          and(
            eq(projectEvents.projectId, project.id),
            gt(projectEvents.id, body.cursor),
          ),
        )
        .orderBy(asc(projectEvents.id))
        .limit(EVENT_PAGE);

      const events: SyncEvent[] = rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        payload: row.payload,
        at: row.createdAt.toISOString(),
      }));

      return {
        // The server is stateless about the client: it never records what
        // was handed out. Nothing came back → the cursor stands.
        cursor: events.length > 0 ? events[events.length - 1].id : body.cursor,
        events,
        peers,
      };
    });
  });
}
