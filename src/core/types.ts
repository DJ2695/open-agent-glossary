/**
 * Core types for open-agent-glossary
 * Schema-compatible with pi-glossary (ruliana/pi-glossary)
 */

export interface GlossaryEntry {
  term: string;
  definition: string;
  aliases?: string[];
  pattern?: string;
  flags?: string;
  enabled?: boolean;
  /** External reference / source-of-truth (e.g. wiki URL). Single string. */
  source?: string;
  /** Semantic scope: projects/teams/bounded-contexts this term applies to. */
  tags?: string[];
}

export type GlossaryMode = "merge" | "first" | "pin";

export interface GlossaryConfig {
  /** Session dedup TTL in minutes. Default: 30. */
  sessionTtlMinutes?: number;

  /**
   * How glossary files are resolved:
   * - "merge" (default): all tiers loaded and merged, later tiers win on collision
   * - "first": stop at the first file found across all tiers
   * - "pin": only load the file at `glossaryPin`, skip all discovery
   */
  glossaryMode?: GlossaryMode;

  /**
   * Path to a single glossary file to use exclusively.
   * Absolute or relative to cwd. Only used when glossaryMode is "pin".
   */
  glossaryPin?: string;

  /**
   * Additional glossary file paths appended after all built-in tiers.
   * These always win over the built-in tiers (highest priority in merge mode).
   * Absolute or relative to cwd.
   */
  extraGlossaryPaths?: string[];

  /**
   * Skip global user-level glossary tiers (~/.pi/agent, ~/.agents, ~/.open-agent-glossary).
   * Useful in CI environments where personal global terms should not bleed in.
   */
  disableGlobalGlossary?: boolean;

  /**
   * Skip project-level glossary tiers (.pi/, .agents/, .open-agent-glossary/).
   * Unusual but valid when you want only global + extraGlossaryPaths.
   */
  disableProjectGlossary?: boolean;

  /** Local UI / control server settings. */
  ui?: UiConfig;

  /** Git auto-commit settings. */
  git?: GitConfig;
}

export type GitCommitMode = "manual" | "operation" | "batch";

export interface GitConfig {
  /** Auto-commit mode. Default: "manual" (disabled). */
  autoCommit?: GitCommitMode;
  /**
   * Commit message template for operation mode.
   * Supports: {operation} (add|edit|remove), {term}, {file}
   */
  commitMessage?: string;
  /**
   * Commit message template for batch mode.
   * Supports: {count}, {terms} (comma-separated list), {file}
   */
  batchCommitMessage?: string;
  /**
   * Seconds of inactivity before a batch commit fires.
   * Only used when autoCommit is "batch". Default: 300 (5 minutes).
   */
  batchIdleSeconds?: number;
}

export interface UiConfig {
  /** Start the control server + UI automatically when a session starts. */
  autostart?: boolean;
  /** Control server port. Default: 7337. */
  port?: number;
  /** Open the browser when the UI starts. Default: true. */
  open?: boolean;
}

export interface SessionState {
  sessionId: string;
  loadedTerms: string[];
  lastUpdated: number;
  cwd: string;
}

export interface LoadedGlossary {
  entries: GlossaryEntry[];
  sources: string[];
}

export interface GlossaryFile {
  path: string;
  entries: GlossaryEntry[];
  hash: string;
}

export interface InjectionResult {
  text: string;
  matchedTerms: string[];
  newTerms: string[];
}

export interface MatchResult {
  entry: GlossaryEntry;
  matchedOn: string; // The term/alias/pattern that matched
}

export const DEFAULT_CONFIG: Required<GlossaryConfig> = {
  sessionTtlMinutes: 30,
  glossaryMode: "merge",
  glossaryPin: "",
  extraGlossaryPaths: [],
  disableGlobalGlossary: false,
  disableProjectGlossary: false,
  ui: {
    autostart: false,
    port: 7337,
    open: true,
  },
  git: {
    autoCommit: "manual",
    commitMessage: "chore(glossary): {operation} term '{term}'",
    batchCommitMessage: "chore(glossary): update {count} glossary term(s)",
    batchIdleSeconds: 300,
  },
};
