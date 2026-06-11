import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

// Lazily-resolved exec so test mocks are always picked up.
function exec(cmd: string, args: string[], opts?: { cwd?: string }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null, stdout: string, stderr: string) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    };
    if (opts) {
      execFile(cmd, args, opts, cb);
    } else {
      execFile(cmd, args, cb);
    }
  });
}

export interface GitCommitOptions {
  filePath: string;
  message: string;
  cwd: string;
}

export interface GitCommitResult {
  committed: boolean;
  skipped: boolean;
  reason?: string;
}

/**
 * Resolve operation-mode commit message template.
 * Supports: {operation}, {term}, {file}
 */
export function resolveCommitMessage(
  template: string,
  vars: { operation: string; term: string; file: string }
): string {
  return template
    .replace(/\{operation\}/g, vars.operation)
    .replace(/\{term\}/g, vars.term)
    .replace(/\{file\}/g, vars.file);
}

/**
 * Resolve batch-mode commit message template.
 * Supports: {count}, {terms}, {file}
 */
export function resolveBatchCommitMessage(
  template: string,
  vars: { count: number; terms: string[]; file: string }
): string {
  return template
    .replace(/\{count\}/g, String(vars.count))
    .replace(/\{terms\}/g, vars.terms.join(", "))
    .replace(/\{file\}/g, vars.file);
}

/**
 * Returns true if cwd is inside a git repository.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await exec("git", ["rev-parse", "--git-dir"], { cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true if the git binary is accessible.
 */
export async function isGitAvailable(): Promise<boolean> {
  try {
    await exec("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stage a single file and commit it.
 * Returns a result describing what happened. Never throws.
 */
export async function commitFile(opts: GitCommitOptions): Promise<GitCommitResult> {
  const { filePath, message, cwd } = opts;

  try {
    if (!await isGitAvailable()) {
      return { committed: false, skipped: true, reason: "git binary not found" };
    }

    if (!await isGitRepo(cwd)) {
      return { committed: false, skipped: true, reason: "not a git repo" };
    }

    if (!existsSync(filePath)) {
      return { committed: false, skipped: true, reason: "file does not exist" };
    }

    // Stage the file
    await exec("git", ["add", filePath], { cwd });

    // Check if there is actually anything staged for this file
    const { stdout: staged } = await exec(
      "git",
      ["diff", "--cached", "--name-only", "--", filePath],
      { cwd }
    );

    if (!staged.trim()) {
      return { committed: false, skipped: true, reason: "no changes to commit" };
    }

    await exec("git", ["commit", "-m", message, "--no-verify"], { cwd });

    return { committed: true, skipped: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { committed: false, skipped: false, reason };
  }
}

/**
 * Derive the glossary file path associated with a cwd.
 * Used for constructing commit messages that reference the file.
 */
export function relativeFilePath(filePath: string, cwd: string): string {
  // Prefer a short relative path in commit messages
  if (filePath.startsWith(cwd)) {
    return filePath.slice(cwd.length).replace(/^[\\/]/, "");
  }
  return filePath;
}

// Resolve the target git root (used for staging from the repo root).
export async function gitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
