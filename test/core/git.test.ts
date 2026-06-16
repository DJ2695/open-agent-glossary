import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveCommitMessage,
  resolveBatchCommitMessage,
  commitFile,
  isGitRepo,
  isGitAvailable,
} from "../../src/core/git.js";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const d = dirs.pop()!;
    rmSync(d, { recursive: true, force: true });
  }
});

function makeGitRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "oag-git-test-"));
  dirs.push(root);

  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root, stdio: "ignore" });
  // Create an initial commit so we have a valid HEAD
  writeFileSync(join(root, ".gitkeep"), "");
  execFileSync("git", ["add", ".gitkeep"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init", "--no-verify"], { cwd: root, stdio: "ignore" });

  return root;
}

// ── Pure template functions ─────────────────────────────────────────────────

describe("resolveCommitMessage", () => {
  it("replaces all template variables", () => {
    const msg = resolveCommitMessage(
      "chore(glossary): {operation} term '{term}' in {file}",
      { operation: "add", term: "BFF", file: ".agents/glossary.json" }
    );
    expect(msg).toBe("chore(glossary): add term 'BFF' in .agents/glossary.json");
  });

  it("handles multiple occurrences", () => {
    const msg = resolveCommitMessage(
      "{operation}: {term} ({operation})",
      { operation: "remove", term: "DRY", file: "f.json" }
    );
    expect(msg).toBe("remove: DRY (remove)");
  });
});

describe("resolveBatchCommitMessage", () => {
  it("replaces count, terms, and file", () => {
    const msg = resolveBatchCommitMessage(
      "chore(glossary): update {count} glossary term(s) ({terms}) in {file}",
      { count: 3, terms: ["BFF", "DRY", "KISS"], file: ".agents/glossary.json" }
    );
    expect(msg).toBe(
      "chore(glossary): update 3 glossary term(s) (BFF, DRY, KISS) in .agents/glossary.json"
    );
  });

  it("handles single term", () => {
    const msg = resolveBatchCommitMessage(
      "chore(glossary): update {count} term(s)",
      { count: 1, terms: ["API"], file: "g.json" }
    );
    expect(msg).toBe("chore(glossary): update 1 term(s)");
  });
});

// ── Real git integration ────────────────────────────────────────────────────

describe("isGitAvailable", () => {
  it("returns true in test env (git is installed)", async () => {
    expect(await isGitAvailable()).toBe(true);
  });
});

describe("isGitRepo", () => {
  it("returns true inside a real git repo", async () => {
    const root = makeGitRepo();
    expect(await isGitRepo(root)).toBe(true);
  });

  it("returns false in a plain temp dir", async () => {
    const plain = mkdtempSync(join(tmpdir(), "oag-notgit-"));
    dirs.push(plain);
    expect(await isGitRepo(plain)).toBe(false);
  });
});

describe("commitFile", () => {
  it("commits a changed file in a git repo", async () => {
    const root = makeGitRepo();
    const filePath = join(root, "glossary.json");
    writeFileSync(filePath, JSON.stringify([{ term: "BFF", definition: "Backend For Frontend" }]));

    const result = await commitFile({
      filePath,
      message: "chore(glossary): add term 'BFF'",
      cwd: root,
    });

    expect(result.committed).toBe(true);
    expect(result.skipped).toBe(false);

    // Verify the commit actually exists
    const log = execFileSync("git", ["log", "--oneline"], { cwd: root, encoding: "utf-8" });
    expect(log).toContain("add term 'BFF'");
  });

  it("skips when there are no changes", async () => {
    const root = makeGitRepo();
    const filePath = join(root, "glossary.json");
    // Write + commit the file first so it's clean
    writeFileSync(filePath, "[]");
    execFileSync("git", ["add", filePath], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "initial glossary", "--no-verify"], { cwd: root, stdio: "ignore" });

    // Call commitFile without changing the file
    const result = await commitFile({
      filePath,
      message: "should skip",
      cwd: root,
    });

    expect(result.committed).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it("returns committed:false with reason when not in a git repo", async () => {
    const plain = mkdtempSync(join(tmpdir(), "oag-notgit-"));
    dirs.push(plain);
    const filePath = join(plain, "glossary.json");
    writeFileSync(filePath, "[]");

    const result = await commitFile({
      filePath,
      message: "should skip",
      cwd: plain,
    });

    expect(result.committed).toBe(false);
    expect(result.reason).toContain("not a git repo");
  });
});
