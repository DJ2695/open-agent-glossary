import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { GlossaryConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

/**
 * Config resolution: first found wins (project-level beats global).
 *
 * Search order (highest priority first):
 *   Project-level:
 *     .open-agent-glossary/config.json
 *     .agents/open-agent-glossary/config.json
 *     .pi/open-agent-glossary/config.json
 *   Global user-level:
 *     ~/.open-agent-glossary/config.json
 *     ~/.agents/open-agent-glossary/config.json
 *     ~/.config/open-agent-glossary/config.json      (XDG standard)
 *     ~/.pi/agent/extensions/open-agent-glossary/config.json  (Pi global)
 */
export function configPaths(cwd?: string): string[] {
  const home = homedir();
  const projectDir = cwd ?? process.cwd();

  return [
    // Project-level (highest priority — checked first)
    join(projectDir, ".open-agent-glossary", "config.json"),
    join(projectDir, ".agents", "open-agent-glossary", "config.json"),
    join(projectDir, ".pi", "open-agent-glossary", "config.json"),
    // Global user-level (fallback)
    join(home, ".open-agent-glossary", "config.json"),
    join(home, ".agents", "open-agent-glossary", "config.json"),
    join(home, ".config", "open-agent-glossary", "config.json"),
    join(home, ".pi", "agent", "extensions", "open-agent-glossary", "config.json"),
  ];
}

/**
 * Load config from first found path, merged with defaults.
 */
export function loadConfig(cwd?: string): Required<GlossaryConfig> {
  const paths = configPaths(cwd);

  for (const configPath of paths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(content) as GlossaryConfig;
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          // ensure arrays are always arrays even if partially specified
          extraGlossaryPaths: parsed.extraGlossaryPaths ?? DEFAULT_CONFIG.extraGlossaryPaths,
          // deep-merge nested ui object so partial config keeps defaults
          ui: { ...DEFAULT_CONFIG.ui, ...(parsed.ui ?? {}) },
          // deep-merge nested git object so partial config keeps defaults
          git: { ...DEFAULT_CONFIG.git, ...(parsed.git ?? {}) },
        };
      } catch {
        // Invalid JSON — fall through to next path
        continue;
      }
    }
  }

  return { ...DEFAULT_CONFIG };
}

/**
 * Resolve extraGlossaryPaths relative to cwd.
 */
export function resolveExtraPaths(paths: string[], cwd?: string): string[] {
  const base = cwd ?? process.cwd();
  return paths.map((p) => (p.startsWith("/") ? p : resolve(base, p)));
}

export interface ConfigPathState {
  path: string;
  exists: boolean;
  used: boolean; // the first-found file that wins
  shadowed: boolean; // exists but a higher-priority file already won
}

export interface ConfigProvenance {
  config: Required<GlossaryConfig>;
  /** Per-top-level-field origin: the winning file path, or "default". */
  origins: Record<string, string>;
  /** Full candidate stack with found/shadowed/used flags (priority order). */
  stack: ConfigPathState[];
  /** The file the active config came from, or null when all defaults. */
  activeFile: string | null;
}

/**
 * Resolve config with provenance: which candidate files exist, which one wins,
 * and where each effective field value came from. Config resolution is
 * first-found-wins (whole file), so per-field origin is "winning file when the
 * key is present there, else default".
 */
export function resolveConfigWithProvenance(cwd?: string): ConfigProvenance {
  const paths = configPaths(cwd);
  let activeFile: string | null = null;
  let parsed: GlossaryConfig = {};

  const stack: ConfigPathState[] = paths.map((p) => ({
    path: p,
    exists: existsSync(p),
    used: false,
    shadowed: false,
  }));

  for (const entry of stack) {
    if (!entry.exists) continue;
    if (activeFile === null) {
      try {
        parsed = JSON.parse(readFileSync(entry.path, "utf-8")) as GlossaryConfig;
        entry.used = true;
        activeFile = entry.path;
      } catch {
        // Invalid JSON — treat as not usable, continue to next candidate.
      }
    } else {
      entry.shadowed = true;
    }
  }

  const config: Required<GlossaryConfig> = {
    ...DEFAULT_CONFIG,
    ...parsed,
    extraGlossaryPaths: parsed.extraGlossaryPaths ?? DEFAULT_CONFIG.extraGlossaryPaths,
    ui: { ...DEFAULT_CONFIG.ui, ...(parsed.ui ?? {}) },
    git: { ...DEFAULT_CONFIG.git, ...(parsed.git ?? {}) },
  };

  const origins: Record<string, string> = {};
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    origins[key] =
      activeFile && (parsed as Record<string, unknown>)[key] !== undefined
        ? activeFile
        : "default";
  }

  return { config, origins, stack, activeFile };
}

/**
 * Write config to an EXISTING config file only (never creates new files).
 * Validates basic coherence before writing. Returns the written path.
 */
export function writeConfigFile(
  filePath: string,
  next: GlossaryConfig
): string {
  if (!existsSync(filePath)) {
    throw new Error(
      `Config file does not exist: ${filePath}. Create it manually first.`
    );
  }
  if (next.glossaryMode === "pin" && !next.glossaryPin) {
    throw new Error("glossaryMode 'pin' requires a glossaryPin path.");
  }
  if (next.ui?.port !== undefined && (next.ui.port < 1 || next.ui.port > 65535)) {
    throw new Error("ui.port must be between 1 and 65535.");
  }
  writeFileSync(filePath, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return filePath;
}
