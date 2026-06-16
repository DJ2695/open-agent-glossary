import { addTerm } from "../core/store.js";
import { loadConfig } from "../core/config.js";
import { buildStoreCommitOptions } from "../core/store-git-options.js";
import type { GlossaryEntry } from "../core/types.js";

interface AddOptions {
  scope?: string;
  aliases?: string;
  cwd?: string;
}

export async function addCommand(
  term: string,
  definition: string,
  options: AddOptions
): Promise<void> {
  try {
    const scope = (options.scope ?? "project") as "global" | "project";
    const cwd = options.cwd ?? process.cwd();

    const entry: GlossaryEntry = { term, definition };
    if (options.aliases) {
      entry.aliases = options.aliases.split(",").map((a) => a.trim());
    }

    const config = loadConfig(cwd);
    const gitOptions = buildStoreCommitOptions(config, cwd);
    await addTerm(scope, entry, cwd, gitOptions);
    console.log(`Added '${term}' to ${scope} glossary.`);
  } catch (err) {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
}
