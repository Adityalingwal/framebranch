/**
 * naming.ts — commit names.
 *
 * Names come from deterministic templates only, never from AI. Detail lives
 * in the op-log, not in the name. The UI word for a commit is "version".
 *
 * Every template used anywhere in the server is in this one file so the
 * whole vocabulary can be read at a glance.
 */

/** The seed commit of a new project. */
export const IMPORT_COMMIT_NAME = 'Imported "demo.otio"';

/**
 * The name of the commit a user-supplied `POST import` writes. The seed
 * import above names its file; a user import is not tied to one fixture.
 */
export const IMPORTED_TIMELINE_COMMIT_NAME = "Imported timeline";

/**
 * Boundary auto-seals — the "before X" family. There are six boundary
 * endpoints that auto-seal when dirty, so there are exactly six of these.
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
 * Restore: a NEW commit whose content is an old version. `name` is the
 * name of the version that was restored FROM.
 */
export const restoreCommitName = (name: string): string =>
  `Restored version "${name}"`;

/** An agent run is one auto-commit named for its script. */
export const agentCommitName = (script: string): string =>
  `Agent run — "${script}"`;

/**
 * Default name for a user's explicit save when they do not type one.
 * `n` = how many versions the project has after this one.
 */
export const versionName = (n: number): string => `Version ${n}`;
