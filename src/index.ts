// Public API
export type {
  GlossaryEntry,
  GlossaryConfig,
  GitConfig,
  GitCommitMode,
  SessionState,
  LoadedGlossary,
  GlossaryFile,
  InjectionResult,
  MatchResult,
} from "./core/types.js";
export { DEFAULT_CONFIG } from "./core/types.js";

export { loadGlossary, loadGlossaryByScope } from "./core/loader.js";
export { matchEntries, buildEntryRegex, testPattern } from "./core/matcher.js";
export type { PatternTestResult } from "./core/matcher.js";
export { buildInjection } from "./core/injector.js";
export { addTerm, editTerm, removeTerm } from "./core/store.js";
export { loadSession, saveSession, markTermsLoaded, resetSession } from "./core/session.js";
export { loadConfig } from "./core/config.js";
export {
  resolveConfigWithProvenance,
  writeConfigFile,
} from "./core/config.js";
export type { ConfigProvenance, ConfigPathState } from "./core/config.js";
export { expandTemplates, expandCrossRefs, expandDefinition } from "./core/expander.js";
export {
  readUsage,
  recordUsage,
  getSessionUsage,
  getTopTerms,
  getRecentEvents,
  resetUsage,
  flushUsage,
} from "./core/usage.js";
export type {
  UsageStore,
  SessionUsage,
  TermUsage,
  UsageKind,
  UsageEvent,
} from "./core/usage.js";
export {
  discoverGlossaries,
  registerProject,
  readProjectRegistry,
} from "./core/discovery.js";
export type {
  DiscoveredFile,
  ProjectGlossaries,
  DiscoveryResult,
  ProjectRegistry,
} from "./core/discovery.js";
export { suggestForTerm, deriveAliases } from "./core/suggest.js";
export type { SuggestResult } from "./core/suggest.js";
export {
  startControlServer,
  createControlApp,
  resolveUiDist,
} from "./server/control.js";
export type { ControlServerOptions, ControlServerHandle } from "./server/control.js";
