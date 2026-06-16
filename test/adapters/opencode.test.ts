import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import openAgentGlossaryOpenCodePlugin, {
  extractPromptText,
} from "../../src/adapters/opencode/index.js";

function makeTempProject(entries: Array<{ term: string; definition: string; aliases?: string[] }>): string {
  const root = mkdtempSync(join(tmpdir(), "oag-opencode-"));
  const glossaryDir = join(root, ".open-agent-glossary");
  mkdirSync(glossaryDir, { recursive: true });
  writeFileSync(join(glossaryDir, "glossary.json"), JSON.stringify(entries, null, 2));
  return root;
}

describe("opencode adapter", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length) {
      const dir = dirs.pop()!;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("extracts prompt text from mixed parts", () => {
    const text = extractPromptText([
      { type: "text", text: "Use BFF" },
      { type: "file", path: "README.md" },
      { type: "input_text", content: "for the mobile app" },
      { unknown: true },
    ]);

    expect(text).toContain("Use BFF");
    expect(text).toContain("for the mobile app");
  });

  it("injects once and dedupes repeated term mentions in same session", async () => {
    const cwd = makeTempProject([{ term: "BFF", definition: "Backend For Frontend" }]);
    dirs.push(cwd);

    const hooks = await openAgentGlossaryOpenCodePlugin({ directory: cwd });
    expect(hooks["chat.message"]).toBeTruthy();
    expect(hooks["experimental.chat.system.transform"]).toBeTruthy();

    await hooks["chat.message"]!({ sessionID: "s-1" }, { parts: [{ type: "text", text: "Use BFF" }] });

    const firstOut = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!({ sessionID: "s-1" }, firstOut);
    expect(firstOut.system).toHaveLength(1);
    expect(firstOut.system[0]).toContain("**BFF**: Backend For Frontend");

    await hooks["chat.message"]!({ sessionID: "s-1" }, { parts: [{ type: "text", text: "Still BFF" }] });
    const secondOut = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!({ sessionID: "s-1" }, secondOut);
    expect(secondOut.system).toHaveLength(0);
  });

  it("consumes pending injection state after transform", async () => {
    const cwd = makeTempProject([{ term: "DRY", definition: "Do not repeat" }]);
    dirs.push(cwd);

    const hooks = await openAgentGlossaryOpenCodePlugin({ directory: cwd });
    await hooks["chat.message"]!({ sessionID: "s-2" }, { parts: [{ type: "text", text: "Keep DRY" }] });

    const out = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!({ sessionID: "s-2" }, out);
    await hooks["experimental.chat.system.transform"]!({ sessionID: "s-2" }, out);

    expect(out.system).toHaveLength(1);
  });

  it("cleans session state on session.deleted", async () => {
    const cwd = makeTempProject([{ term: "API", definition: "Application Programming Interface" }]);
    dirs.push(cwd);

    const hooks = await openAgentGlossaryOpenCodePlugin({ directory: cwd });

    await hooks["chat.message"]!({ sessionID: "s-3" }, { parts: [{ type: "text", text: "API" }] });
    const firstOut = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!({ sessionID: "s-3" }, firstOut);
    expect(firstOut.system).toHaveLength(1);

    await hooks.event!({ event: { type: "session.deleted", sessionID: "s-3" } });

    await hooks["chat.message"]!({ sessionID: "s-3" }, { parts: [{ type: "text", text: "API" }] });
    const secondOut = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!({ sessionID: "s-3" }, secondOut);
    expect(secondOut.system).toHaveLength(1);
  });

  it("exposes glossary_lookup tool", async () => {
    const cwd = makeTempProject([
      { term: "DDD", definition: "Domain-Driven Design", aliases: ["domain driven design"] },
    ]);
    dirs.push(cwd);

    const hooks = await openAgentGlossaryOpenCodePlugin({ directory: cwd });
    expect(hooks.tool?.glossary_lookup).toBeTruthy();

    const text = await hooks.tool!.glossary_lookup.execute(
      { term: "DDD" },
      { sessionID: "s-4", directory: cwd }
    );

    expect(text).toContain("### `DDD`");
    expect(text).toContain("Domain-Driven Design");

    const notFound = await hooks.tool!.glossary_lookup.execute(
      { term: "unknown" },
      { sessionID: "s-4", directory: cwd }
    );
    expect(notFound).toContain("not found");
  });
});
