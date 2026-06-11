import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitBatcher } from "../../src/core/git-batcher.js";

// Mock git.js and child_process so no real git runs
vi.mock("../../src/core/git.js", () => ({
  isGitAvailable: vi.fn().mockResolvedValue(true),
  isGitRepo: vi.fn().mockResolvedValue(true),
  resolveBatchCommitMessage: (
    template: string,
    vars: { count: number; terms: string[]; file: string }
  ) =>
    template
      .replace(/\{count\}/g, String(vars.count))
      .replace(/\{terms\}/g, vars.terms.join(", "))
      .replace(/\{file\}/g, vars.file),
  relativeFilePath: () => "glossary.json",
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      args: string[],
      _optsOrCb: unknown,
      maybeCb?: Function
    ) => {
      const cb = (maybeCb ?? _optsOrCb) as Function;
      // Simulate git diff --cached returning a file name (so commit proceeds)
      if (Array.isArray(args) && args.includes("--name-only")) {
        cb(null, "glossary.json\n", "");
      } else {
        cb(null, "", "");
      }
    }
  ),
}));

describe("GitBatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("records pending changes", () => {
    const batcher = new GitBatcher({
      cwd: "/tmp/repo",
      idleSeconds: 300,
      batchCommitMessage: "chore(glossary): update {count} glossary term(s)",
    });

    batcher.record({ operation: "add", term: "BFF", file: "/tmp/repo/.agents/glossary.json" });
    batcher.record({ operation: "edit", term: "DRY", file: "/tmp/repo/.agents/glossary.json" });

    expect(batcher.pendingCount).toBe(2);
    batcher.dispose();
  });

  it("resets the timer on each record, not firing prematurely", () => {
    const onCommit = vi.fn();
    const batcher = new GitBatcher({
      cwd: "/tmp/repo",
      idleSeconds: 5,
      batchCommitMessage: "chore(glossary): update {count} glossary term(s)",
      onCommit,
    });

    batcher.record({ operation: "add", term: "BFF", file: "/tmp/repo/glossary.json" });
    vi.advanceTimersByTime(3000); // not yet
    batcher.record({ operation: "add", term: "DRY", file: "/tmp/repo/glossary.json" });
    vi.advanceTimersByTime(3000); // still not — timer was reset

    expect(batcher.pendingCount).toBe(2); // not flushed yet
    batcher.dispose();
  });

  it("flush() commits all pending changes and clears the list", async () => {
    const onCommit = vi.fn();
    const batcher = new GitBatcher({
      cwd: "/tmp/repo",
      idleSeconds: 300,
      batchCommitMessage: "chore(glossary): update {count} glossary term(s)",
      onCommit,
    });

    batcher.record({ operation: "add", term: "BFF", file: "/tmp/repo/.agents/glossary.json" });
    batcher.record({ operation: "remove", term: "DRY", file: "/tmp/repo/.agents/glossary.json" });

    const result = await batcher.flush();

    expect(result.committed).toBe(true);
    expect(batcher.pendingCount).toBe(0);
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ committed: true }),
      expect.arrayContaining(["BFF", "DRY"])
    );
    batcher.dispose();
  });

  it("flush() is idempotent when nothing is pending", async () => {
    const batcher = new GitBatcher({
      cwd: "/tmp/repo",
      idleSeconds: 300,
      batchCommitMessage: "chore(glossary): update {count} glossary term(s)",
    });

    const result = await batcher.flush();

    expect(result.committed).toBe(false);
    expect(result.skipped).toBe(true);
    batcher.dispose();
  });

  it("dispose() cancels timer and discards pending changes", () => {
    const onCommit = vi.fn();
    const batcher = new GitBatcher({
      cwd: "/tmp/repo",
      idleSeconds: 5,
      batchCommitMessage: "chore(glossary): update {count} glossary term(s)",
      onCommit,
    });

    batcher.record({ operation: "add", term: "API", file: "/tmp/repo/glossary.json" });
    batcher.dispose();

    vi.runAllTimers();
    expect(onCommit).not.toHaveBeenCalled();
    expect(batcher.pendingCount).toBe(0);
  });
});
