import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import type { GlossaryEntry, GitCommitMode } from "./types.js";
import { findGlossaryFile, resolveGlossaryPaths } from "./loader.js";
import { commitFile, resolveCommitMessage, relativeFilePath } from "./git.js";
import type { GitBatcher } from "./git-batcher.js";

export interface StoreCommitOptions {
  mode: GitCommitMode;
  commitMessage: string;
  batchCommitMessage: string;
  cwd: string;
  batcher?: GitBatcher;
}

export interface StoreHandle {
  path: string;
  entries: GlossaryEntry[];
  hash: string;
}

/**
 * Read a glossary file with its content hash for optimistic locking.
 */
export function readStore(filePath: string): StoreHandle {
  const content = readFileSync(filePath, "utf-8");
  const hash = createHash("sha256").update(content).digest("hex");
  const entries = JSON.parse(content) as GlossaryEntry[];
  return { path: filePath, entries, hash };
}

/**
 * Write glossary entries back to file with optimistic lock check.
 */
export function writeStore(handle: StoreHandle, entries: GlossaryEntry[]): void {
  // Check if file has been modified since we read it
  if (existsSync(handle.path)) {
    const currentContent = readFileSync(handle.path, "utf-8");
    const currentHash = createHash("sha256")
      .update(currentContent)
      .digest("hex");
    if (currentHash !== handle.hash) {
      throw new Error(
        "Glossary modified externally since last read. Reload and retry."
      );
    }
  }

  const content = JSON.stringify(entries, null, 2) + "\n";
  writeFileSync(handle.path, content, "utf-8");
}

/**
 * Resolve the target glossary file path for a given scope.
 * Creates the file if it doesn't exist.
 */
export function resolveStoreTarget(
  scope: "global" | "project",
  cwd?: string
): string {
  const paths = resolveGlossaryPaths(cwd);
  const scopePaths = scope === "global" ? paths.global : paths.project;

  // Try to find an existing file first
  for (const basePath of scopePaths) {
    const existing = findGlossaryFile(basePath);
    if (existing) return existing;
  }

  // Default to first path in scope with .json extension
  const defaultPath = scopePaths[0] + ".json";
  const dir = dirname(defaultPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(defaultPath)) {
    writeFileSync(defaultPath, "[]\n", "utf-8");
  }
  return defaultPath;
}

/**
 * Add a term to the glossary.
 */
export async function addTerm(
  scope: "global" | "project",
  entry: GlossaryEntry,
  cwd?: string,
  gitOptions?: StoreCommitOptions
): Promise<void> {
  const filePath = resolveStoreTarget(scope, cwd);
  const store = readStore(filePath);

  // Check for duplicate
  const existing = store.entries.find(
    (e) => e.term.toLowerCase() === entry.term.toLowerCase()
  );
  if (existing) {
    throw new Error(`Term '${entry.term}' already exists. Use edit to modify.`);
  }

  const updated = [...store.entries, entry];
  writeStore(store, updated);
  await maybeCommit(filePath, "add", entry.term, cwd ?? process.cwd(), gitOptions);
}

/**
 * Edit an existing term's fields.
 */
export async function editTerm(
  scope: "global" | "project",
  term: string,
  updates: Partial<Omit<GlossaryEntry, "term">>,
  cwd?: string,
  gitOptions?: StoreCommitOptions
): Promise<void> {
  const filePath = resolveStoreTarget(scope, cwd);
  const store = readStore(filePath);

  const index = store.entries.findIndex(
    (e) => e.term.toLowerCase() === term.toLowerCase()
  );
  if (index === -1) {
    throw new Error(`Term '${term}' not found in ${scope} glossary.`);
  }

  store.entries[index] = { ...store.entries[index], ...updates };
  writeStore(store, store.entries);
  await maybeCommit(filePath, "edit", term, cwd ?? process.cwd(), gitOptions);
}

/**
 * Remove a term from the glossary.
 */
export async function removeTerm(
  scope: "global" | "project",
  term: string,
  cwd?: string,
  gitOptions?: StoreCommitOptions
): Promise<void> {
  const filePath = resolveStoreTarget(scope, cwd);
  const store = readStore(filePath);

  const index = store.entries.findIndex(
    (e) => e.term.toLowerCase() === term.toLowerCase()
  );
  if (index === -1) {
    throw new Error(`Term '${term}' not found in ${scope} glossary.`);
  }

  store.entries.splice(index, 1);
  writeStore(store, store.entries);
  await maybeCommit(filePath, "remove", term, cwd ?? process.cwd(), gitOptions);
}

// ---------------------------------------------------------------------------
// Internal git helpers
// ---------------------------------------------------------------------------

async function maybeCommit(
  filePath: string,
  operation: "add" | "edit" | "remove",
  term: string,
  cwd: string,
  gitOptions?: StoreCommitOptions
): Promise<void> {
  if (!gitOptions || gitOptions.mode === "manual") return;

  const relFile = relativeFilePath(filePath, cwd);

  if (gitOptions.mode === "batch" && gitOptions.batcher) {
    gitOptions.batcher.record({ operation, term, file: filePath });
    return;
  }

  // operation mode (or batch fallback when no batcher is available)
  const message = resolveCommitMessage(gitOptions.commitMessage, {
    operation,
    term,
    file: relFile,
  });
  await commitFile({ filePath, message, cwd });
}
