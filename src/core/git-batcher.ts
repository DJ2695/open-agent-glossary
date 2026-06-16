import { execFile } from "node:child_process";
import {
  resolveBatchCommitMessage,
  relativeFilePath,
  isGitAvailable,
  isGitRepo,
  type GitCommitResult,
} from "./git.js";

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

export interface PendingChange {
  operation: "add" | "edit" | "remove";
  term: string;
  file: string;
}

export interface GitBatcherOptions {
  cwd: string;
  idleSeconds: number;
  batchCommitMessage: string;
  /** Called after each batch commit attempt (for logging). */
  onCommit?: (result: GitCommitResult, terms: string[]) => void;
  onError?: (error: unknown) => void;
}

/**
 * Accumulates glossary write operations and commits them as a single git
 * commit after a configurable idle window.
 *
 * Designed for long-running processes (i.e. the control server).
 * In one-shot CLI processes, fall back to operation mode instead.
 */
export class GitBatcher {
  private readonly cwd: string;
  private readonly idleMs: number;
  private readonly messageTemplate: string;
  private readonly onCommit: (result: GitCommitResult, terms: string[]) => void;
  private readonly onError: (error: unknown) => void;

  private pending: PendingChange[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: GitBatcherOptions) {
    this.cwd = opts.cwd;
    this.idleMs = opts.idleSeconds * 1000;
    this.messageTemplate = opts.batchCommitMessage;
    this.onCommit = opts.onCommit ?? (() => {});
    this.onError = opts.onError ?? (() => {});
  }

  /**
   * Record a write operation. Resets the idle timer.
   */
  record(change: PendingChange): void {
    this.pending.push(change);
    this.resetTimer();
  }

  /**
   * Immediately flush pending changes as a single commit.
   * Clears pending list and cancels the timer.
   * Safe to call multiple times (idempotent if nothing is pending).
   */
  async flush(): Promise<GitCommitResult> {
    this.cancelTimer();

    if (this.pending.length === 0) {
      return { committed: false, skipped: true, reason: "nothing pending" };
    }

    const snapshot = [...this.pending];
    this.pending = [];

    // Dedupe files — all pending changes may touch the same file
    const files = [...new Set(snapshot.map((c) => c.file))];
    const terms = [...new Set(snapshot.map((c) => c.term))];
    const primaryFile = files[0]!;

    const message = resolveBatchCommitMessage(this.messageTemplate, {
      count: terms.length,
      terms,
      file: relativeFilePath(primaryFile, this.cwd),
    });

    // Stage all touched files
    let result: GitCommitResult = { committed: false, skipped: false };
    try {
      if (!await isGitAvailable()) {
        result = { committed: false, skipped: true, reason: "git binary not found" };
        this.onCommit(result, terms);
        return result;
      }
      if (!await isGitRepo(this.cwd)) {
        result = { committed: false, skipped: true, reason: "not a git repo" };
        this.onCommit(result, terms);
        return result;
      }

      // Stage all changed files
      for (const f of files) {
        await exec("git", ["add", f], { cwd: this.cwd });
      }

      const { stdout: staged } = await exec(
        "git",
        ["diff", "--cached", "--name-only"],
        { cwd: this.cwd }
      );

      if (!staged.trim()) {
        result = { committed: false, skipped: true, reason: "no changes to commit" };
        this.onCommit(result, terms);
        return result;
      }

      await exec("git", ["commit", "-m", message, "--no-verify"], { cwd: this.cwd });
      result = { committed: true, skipped: false };
      this.onCommit(result, terms);
      return result;
    } catch (error) {
      this.onError(error);
      result = {
        committed: false,
        skipped: false,
        reason: error instanceof Error ? error.message : String(error),
      };
      this.onCommit(result, terms);
      return result;
    }
  }

  /**
   * Cancel any pending timer and discard pending changes.
   * Call on server shutdown if flush() was already called.
   */
  dispose(): void {
    this.cancelTimer();
    this.pending = [];
  }

  /** Returns the number of currently pending (uncommitted) changes. */
  get pendingCount(): number {
    return this.pending.length;
  }

  private resetTimer(): void {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.flush().catch(this.onError);
    }, this.idleMs);
    // Don't hold the process open just for the timer
    if (this.timer.unref) this.timer.unref();
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
