/**
 * naming.ts — commit names.
 *
 * docs/09 Item 6a(5) LOCK: names come from DETERMINISTIC TEMPLATES ONLY,
 * never from AI ("templates jhooth nahi bol sakte"). Detail lives in the
 * op-log, not in the name. The UI word for a commit is "version".
 *
 * Every template used anywhere in the server is in this one file so the
 * whole vocabulary can be read at a glance.
 */

/** The seed commit of a new project (C8 step 1 / Q1: always a full snapshot). */
export const IMPORT_COMMIT_NAME = 'Imported "demo.otio"';

/** Boundary auto-seals (docs/09 Item 6a(4) — the "before X" family). */
export const SEAL_BEFORE_BRANCH_SWITCH = "Auto — before branch switch";
export const SEAL_BEFORE_BRANCH_CREATE = "Auto — before new branch";

/**
 * Default name for a user's explicit save when they do not type one
 * (docs/09 Item 6a(3): the button is optional, the name is the user's).
 * `n` = how many versions the project has after this one.
 */
export const versionName = (n: number): string => `Version ${n}`;
