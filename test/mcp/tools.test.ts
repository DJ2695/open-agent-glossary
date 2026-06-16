import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadGlossary } from "../../src/core/loader.js";
import { addTerm, editTerm, removeTerm } from "../../src/core/store.js";

/**
 * Integration tests for MCP tool logic.
 * Tests the core functions that back each MCP tool, rather than
 * spinning up a full stdio server (which requires MCP client scaffolding).
 */

const TEST_DIR = join(tmpdir(), "oag-test-mcp-" + Date.now());

beforeEach(() => {
  mkdirSync(join(TEST_DIR, ".agents"), { recursive: true });
  writeFileSync(
    join(TEST_DIR, ".agents", "glossary.json"),
    JSON.stringify([
      { term: "DRY", definition: "Don't Repeat Yourself" },
      { term: "KISS", definition: "Keep It Simple" },
    ])
  );
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("MCP tools (integration)", () => {
  describe("glossary_lookup", () => {
    it("finds existing term", () => {
      const glossary = loadGlossary(TEST_DIR);
      const entry = glossary.entries.find(
        (e) => e.term.toLowerCase() === "dry"
      );
      expect(entry).toBeDefined();
      expect(entry!.definition).toBe("Don't Repeat Yourself");
    });

    it("returns undefined for missing term", () => {
      const glossary = loadGlossary(TEST_DIR);
      const entry = glossary.entries.find(
        (e) => e.term.toLowerCase() === "nope"
      );
      expect(entry).toBeUndefined();
    });
  });

  describe("glossary_list", () => {
    it("lists all entries", () => {
      const glossary = loadGlossary(TEST_DIR);
      expect(glossary.entries.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("glossary_add", () => {
    it("adds a new term", async () => {
      await addTerm("project", { term: "YAGNI", definition: "You Aren't Gonna Need It" }, TEST_DIR);
      const glossary = loadGlossary(TEST_DIR);
      const entry = glossary.entries.find((e) => e.term === "YAGNI");
      expect(entry).toBeDefined();
      expect(entry!.definition).toBe("You Aren't Gonna Need It");
    });

    it("rejects duplicate", async () => {
      await expect(
        addTerm("project", { term: "DRY", definition: "dup" }, TEST_DIR)
      ).rejects.toThrow("already exists");
    });

    it("supports aliases", async () => {
      await addTerm(
        "project",
        { term: "API", definition: "Application Programming Interface", aliases: ["rest", "endpoint"] },
        TEST_DIR
      );
      const content = JSON.parse(
        readFileSync(join(TEST_DIR, ".agents", "glossary.json"), "utf-8")
      );
      const entry = content.find((e: any) => e.term === "API");
      expect(entry.aliases).toEqual(["rest", "endpoint"]);
    });
  });

  describe("glossary_edit", () => {
    it("updates definition", async () => {
      await editTerm("project", "DRY", { definition: "Updated definition" }, TEST_DIR);
      const content = JSON.parse(
        readFileSync(join(TEST_DIR, ".agents", "glossary.json"), "utf-8")
      );
      expect(content[0].definition).toBe("Updated definition");
    });

    it("updates aliases", async () => {
      await editTerm("project", "DRY", { aliases: ["no-repeat"] }, TEST_DIR);
      const content = JSON.parse(
        readFileSync(join(TEST_DIR, ".agents", "glossary.json"), "utf-8")
      );
      expect(content[0].aliases).toEqual(["no-repeat"]);
    });

    it("rejects non-existent term", async () => {
      await expect(
        editTerm("project", "GHOST", { definition: "x" }, TEST_DIR)
      ).rejects.toThrow("not found");
    });
  });

  describe("glossary_remove", () => {
    it("removes existing term", async () => {
      await removeTerm("project", "KISS", TEST_DIR);
      const content = JSON.parse(
        readFileSync(join(TEST_DIR, ".agents", "glossary.json"), "utf-8")
      );
      expect(content).toHaveLength(1);
      expect(content[0].term).toBe("DRY");
    });

    it("rejects non-existent term", async () => {
      await expect(
        removeTerm("project", "GHOST", TEST_DIR)
      ).rejects.toThrow("not found");
    });
  });
});
