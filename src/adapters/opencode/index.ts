import { z } from "zod";
import { buildInjection } from "../../core/injector.js";
import { loadGlossary } from "../../core/loader.js";
import { matchEntries } from "../../core/matcher.js";
import { expandDefinition } from "../../core/expander.js";
import type { GlossaryEntry, MatchResult } from "../../core/types.js";

export interface OpenCodePluginInput {
  client?: {
    app?: {
      log?: (level: string, message: string, data?: Record<string, unknown>) => void;
    };
  };
  directory?: string;
}

export interface OpenCodePluginOptions {
  cwd?: string;
  enableLookupTool?: boolean;
}

type ChatMessageInput = { sessionID: string };
type ChatMessageOutput = {
  message?: { parts?: unknown[] };
  parts?: unknown[];
};

type SystemTransformInput = { sessionID?: string };
type SystemTransformOutput = { system: string[] };

type EventInput = {
  event: {
    type?: string;
    sessionID?: string;
    properties?: Record<string, unknown>;
    info?: Record<string, unknown>;
  };
};

type ToolContext = { sessionID?: string; directory?: string };

type PluginHooks = {
  event?: (input: EventInput) => Promise<void>;
  tool?: Record<string, {
    description: string;
    args: Record<string, unknown>;
    execute: (args: { term: string }, context: ToolContext) => Promise<string>;
  }>;
  "chat.message"?: (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void>;
  "experimental.chat.system.transform"?: (
    input: SystemTransformInput,
    output: SystemTransformOutput
  ) => Promise<void>;
};

function toTextPart(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const record = part as Record<string, unknown>;
  const directText = record.text;
  if (typeof directText === "string") return directText;

  const content = record.content;
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    const joined = content
      .map((item) => (typeof item === "string" ? item : null))
      .filter((item): item is string => Boolean(item))
      .join("\n")
      .trim();
    return joined || null;
  }

  return null;
}

export function extractPromptText(parts: unknown[]): string {
  return parts
    .map((part) => toTextPart(part))
    .filter((part): part is string => Boolean(part && part.trim()))
    .join("\n")
    .trim();
}

function formatEntry(entry: GlossaryEntry, cwd: string): string {
  const expanded = expandDefinition(entry.definition, cwd);
  const aliases = entry.aliases?.length ? `Aliases: ${entry.aliases.join(", ")}\n` : "";
  const source = entry.source ? `Source: ${entry.source}\n` : "";
  return `### \`${entry.term}\`\n${aliases}${source}${expanded.trim()}`.trim();
}

function resolveSessionIDFromEvent(event: EventInput["event"]): string | null {
  if (!event) return null;
  if (typeof event.sessionID === "string" && event.sessionID) return event.sessionID;

  const fromProps = event.properties?.sessionID;
  if (typeof fromProps === "string" && fromProps) return fromProps;

  const fromInfo = event.info?.sessionID;
  if (typeof fromInfo === "string" && fromInfo) return fromInfo;

  return null;
}

function shouldCleanupFromEventType(type: string | undefined): boolean {
  if (!type) return false;
  return (
    type === "session.deleted" ||
    type === "session.compacted" ||
    type === "session.idle" ||
    type === "session.error"
  );
}

export default async function openAgentGlossaryOpenCodePlugin(
  input: OpenCodePluginInput,
  options?: OpenCodePluginOptions
): Promise<PluginHooks> {
  const cwd = options?.cwd ?? input.directory ?? process.cwd();
  const enableLookupTool = options?.enableLookupTool !== false;

  const injectedTermsBySession = new Map<string, Set<string>>();
  const pendingMatchesBySession = new Map<string, MatchResult[]>();

  const log = (level: "debug" | "info" | "warn", message: string, data?: Record<string, unknown>) => {
    try {
      input.client?.app?.log?.(level, message, data);
    } catch {
      // best-effort
    }
  };

  const hooks: PluginHooks = {
    event: async ({ event }) => {
      if (!shouldCleanupFromEventType(event.type)) return;
      const sessionID = resolveSessionIDFromEvent(event);
      if (!sessionID) return;

      pendingMatchesBySession.delete(sessionID);
      injectedTermsBySession.delete(sessionID);
      log("debug", "open-agent-glossary: cleaned session state", { sessionID, type: event.type });
    },

    "chat.message": async ({ sessionID }, output) => {
      const parts = output.parts ?? output.message?.parts ?? [];
      const prompt = extractPromptText(parts);
      if (!prompt) {
        pendingMatchesBySession.delete(sessionID);
        return;
      }

      let entries: GlossaryEntry[] = [];
      try {
        const glossary = loadGlossary(cwd);
        entries = glossary.entries;
      } catch (error) {
        pendingMatchesBySession.delete(sessionID);
        log("warn", "open-agent-glossary: glossary load failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      const matches = matchEntries(prompt, entries);
      if (matches.length === 0) {
        pendingMatchesBySession.delete(sessionID);
        return;
      }

      const injectedSet = injectedTermsBySession.get(sessionID) ?? new Set<string>();
      const newMatches = matches.filter(
        (match) => !injectedSet.has(match.entry.term.toLowerCase())
      );

      if (newMatches.length === 0) {
        pendingMatchesBySession.delete(sessionID);
        log("debug", "open-agent-glossary: all matched terms already injected", {
          sessionID,
          matchedTerms: matches.map((m) => m.entry.term),
        });
        return;
      }

      pendingMatchesBySession.set(sessionID, newMatches);
      log("info", "open-agent-glossary: queued glossary matches", {
        sessionID,
        terms: newMatches.map((m) => m.entry.term),
      });
    },

    "experimental.chat.system.transform": async ({ sessionID }, output) => {
      if (!sessionID) return;

      const pendingMatches = pendingMatchesBySession.get(sessionID);
      if (!pendingMatches || pendingMatches.length === 0) return;

      const injectedSet = injectedTermsBySession.get(sessionID) ?? new Set<string>();
      const sessionState = {
        sessionId: sessionID,
        loadedTerms: [...injectedSet],
        lastUpdated: Date.now(),
        cwd,
      };

      const injection = buildInjection(pendingMatches, sessionState, cwd);
      pendingMatchesBySession.delete(sessionID);
      if (!injection.text) return;

      output.system.push(injection.text);

      const nextInjected = injectedTermsBySession.get(sessionID) ?? new Set<string>();
      for (const term of injection.newTerms) {
        nextInjected.add(term.toLowerCase());
      }
      injectedTermsBySession.set(sessionID, nextInjected);

      log("info", "open-agent-glossary: injected glossary terms", {
        sessionID,
        injectedTerms: injection.newTerms,
      });
    },
  };

  if (enableLookupTool) {
    hooks.tool = {
      glossary_lookup: {
        description:
          "Look up a glossary term by name and get its definition. Use when a loaded definition contains a [[term-name]] cross-reference relevant to the task.",
        args: {
          term: z.string().describe("The term name to look up (case-insensitive)"),
        },
        execute: async ({ term }, context) => {
          const activeCwd = context.directory ?? cwd;
          const glossary = loadGlossary(activeCwd);
          const entry = glossary.entries.find(
            (candidate) => candidate.term.toLowerCase() === term.trim().toLowerCase()
          );

          if (!entry) {
            return `Glossary term not found: "${term}"`;
          }

          const sessionID = context.sessionID;
          if (sessionID) {
            const injectedSet = injectedTermsBySession.get(sessionID) ?? new Set<string>();
            injectedSet.add(entry.term.toLowerCase());
            injectedTermsBySession.set(sessionID, injectedSet);
          }

          return formatEntry(entry, activeCwd);
        },
      },
    };
  }

  return hooks;
}
