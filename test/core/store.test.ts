import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addTerm, editTerm, removeTerm } from "../../src/core/store.js";

const TEST_DIR = join(tmpdir(), "oag-test-store-" + Date.now());

beforeEach(() => {
  mkdirSync(join(TEST_DIR, ".agents"), { recursive: true });
  writeFileSync(
    join(TEST_DIR, ".agents", "glossary.json"),
    JSON.stringify([{ term: "Existing", definition: "Already here" }])
  );
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("store", () => {
  it("adds a term", async () => {
    await addTerm("project", { term: "New", definition: "New term" }, TEST_DIR);
    const content = JSON.parse(
      readFileSync(join(TEST_DIR, ".agents", "glossary.json"), "utf-8")
    );
    expect(content).toHaveLength(2);
    expect(content[1].term).toBe("New");
  });

  it("rejects duplicate term", async () => {
    await expect(
      addTerm("project", { term: "Existing", definition: "Dup" }, TEST_DIR)
    ).rejects.toThrow("already exists");
  });

  it("edits a term", async () => {
    await editTerm("project", "Existing", { definition: "Updated" }, TEST_DIR);
    const content = JSON.parse(
      readFileSync(join(TEST_DIR, ".agents", "glossary.json"), "utf-8")
    );
    expect(content[0].definition).toBe("Updated");
  });

  it("removes a term", async () => {
    await removeTerm("project", "Existing", TEST_DIR);
    const content = JSON.parse(
      readFileSync(join(TEST_DIR, ".agents", "glossary.json"), "utf-8")
    );
    expect(content).toHaveLength(0);
  });

  it("throws on edit of non-existent term", async () => {
    await expect(
      editTerm("project", "Ghost", { definition: "nope" }, TEST_DIR)
    ).rejects.toThrow("not found");
  });

  it("throws on remove of non-existent term", async () => {
    await expect(
      removeTerm("project", "Ghost", TEST_DIR)
    ).rejects.toThrow("not found");
  });
});
