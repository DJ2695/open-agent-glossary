import { removeTerm } from "../core/store.js";
import { loadConfig } from "../core/config.js";
import { buildStoreCommitOptions } from "../core/store-git-options.js";

interface RemoveOptions {
  scope?: string;
  cwd?: string;
}

export async function removeCommand(term: string, options: RemoveOptions): Promise<void> {
  try {
    const scope = (options.scope ?? "project") as "global" | "project";
    const cwd = options.cwd ?? process.cwd();

    const config = loadConfig(cwd);
    const gitOptions = buildStoreCommitOptions(config, cwd);
    await removeTerm(scope, term, cwd, gitOptions);
    console.log(`Removed '${term}' from ${scope} glossary.`);
  } catch (err) {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
}
