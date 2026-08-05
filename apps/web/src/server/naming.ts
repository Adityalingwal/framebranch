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

/**
 * The name of the commit a user-supplied `POST import` writes. The seed
 * import above names its file; a user import is not tied to one fixture.
 */
export const IMPORTED_TIMELINE_COMMIT_NAME = "Imported timeline";

/**
 * Boundary auto-seals (docs/09 Item 6a(4) — the "before X" family). There
 * are exactly SIX boundary endpoints, so there are exactly six of these:
 * branch-switch and branch-create (M7a) and merge / restore / agent-run /
 * import / export (M7b — branch create+switch share the branch family).
 * "Auto — before export" is fixed verbatim by docs/09 #4.
 */
export const SEAL_BEFORE_BRANCH_SWITCH = "Auto — before branch switch";
export const SEAL_BEFORE_BRANCH_CREATE = "Auto — before new branch";
export const SEAL_BEFORE_MERGE = "Auto — before merge";
export const SEAL_BEFORE_RESTORE = "Auto — before restore";
export const SEAL_BEFORE_AGENT_RUN = "Auto — before agent run";
export const SEAL_BEFORE_IMPORT = "Auto — before import";
export const SEAL_BEFORE_EXPORT = "Auto — before export";

/** The merge commit itself (the only commit with two parents — C3). */
export const mergeCommitName = (from: string, into: string): string =>
  `Merged "${from}" into "${into}"`;

/**
 * docs/09 Item 6c: restore is a NEW commit whose content is an old version,
 * and its history entry reads "Restored version 'X'". `name` is the name of
 * the version that was restored FROM.
 */
export const restoreCommitName = (name: string): string =>
  `Restored version "${name}"`;

/** docs/09 Item 6a(2): an agent run is one auto-commit named for its script. */
export const agentCommitName = (script: string): string =>
  `Agent run — "${script}"`;

/**
 * Default name for a user's explicit save when they do not type one
 * (docs/09 Item 6a(3): the button is optional, the name is the user's).
 * `n` = how many versions the project has after this one.
 */
export const versionName = (n: number): string => `Version ${n}`;
