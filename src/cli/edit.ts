import { editTerm } from "../core/store.js";
import { loadConfig } from "../core/config.js";
import { buildStoreCommitOptions } from "../core/store-git-options.js";

interface EditOptions {
  definition?: string;
  aliases?: string;
  scope?: string;
  cwd?: string;
}

export async function editCommand(term: string, options: EditOptions): Promise<void> {
  try {
    const scope = (options.scope ?? "project") as "global" | "project";
    const cwd = options.cwd ?? process.cwd();
    const updates: Record<string, unknown> = {};

    if (options.definition) updates.definition = options.definition;
    if (options.aliases) {
      updates.aliases = options.aliases.split(",").map((a) => a.trim());
    }

    if (Object.keys(updates).length === 0) {
      process.stderr.write("No updates specified.\n");
      process.exit(1);
    }

    const config = loadConfig(cwd);
    const gitOptions = buildStoreCommitOptions(config, cwd);
    await editTerm(scope, term, updates, cwd, gitOptions);
    console.log(`Updated '${term}' in ${scope} glossary.`);
  } catch (err) {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
}
