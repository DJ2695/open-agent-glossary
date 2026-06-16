import type { GlossaryConfig } from "./types.js";
import type { StoreCommitOptions } from "./store.js";
import type { GitBatcher } from "./git-batcher.js";

/**
 * Build StoreCommitOptions from resolved config.
 *
 * @param config  - Resolved GlossaryConfig (from loadConfig)
 * @param cwd     - Working directory for the operation
 * @param batcher - GitBatcher instance (only used in batch mode from the
 *                  control server). When omitted in batch mode, falls back
 *                  to operation mode and emits a warning to stderr.
 */
export function buildStoreCommitOptions(
  config: Required<GlossaryConfig>,
  cwd: string,
  batcher?: GitBatcher
): StoreCommitOptions | undefined {
  const mode = config.git.autoCommit ?? "manual";

  if (mode === "manual") return undefined;

  if (mode === "batch" && !batcher) {
    // CLI is one-shot — the idle timer would never fire. Fall back gracefully.
    process.stderr.write(
      "⚠ git.autoCommit \"batch\" is not meaningful in CLI mode. Committing immediately.\n"
    );
    return {
      mode: "operation",
      commitMessage: config.git.commitMessage ?? "chore(glossary): {operation} term '{term}'",
      batchCommitMessage: config.git.batchCommitMessage ?? "chore(glossary): update {count} glossary term(s)",
      cwd,
    };
  }

  return {
    mode,
    commitMessage: config.git.commitMessage ?? "chore(glossary): {operation} term '{term}'",
    batchCommitMessage: config.git.batchCommitMessage ?? "chore(glossary): update {count} glossary term(s)",
    cwd,
    batcher,
  };
}
