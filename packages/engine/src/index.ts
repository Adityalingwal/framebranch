/**
 * FrameBranch engine — public API entry point ("public darwaza", docs/11 C7).
 *
 * The 7-function public API will live here (comment only — no implementations
 * yet; Milestone 1 is repo skeleton only):
 *
 *   applyCommand, computeDiff, startMerge, applyChoice,
 *   finalizeCheck, importOtio, exportOtio
 *
 * apps/web will import ONLY from this index (small door = free internal
 * refactoring). Pure core: no DB / network / UI imports, ever.
 */
export {};
