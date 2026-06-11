import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { createRequire } from "node:module";
import type { GlossaryEntry, GlossaryConfig } from "../core/types.js";
import { loadGlossary, loadGlossaryByScope } from "../core/loader.js";
import { addTerm, editTerm, removeTerm } from "../core/store.js";
import { loadSession } from "../core/session.js";
import { discoverGlossaries, registerProject } from "../core/discovery.js";
import {
  readUsage,
  getSessionUsage,
  getTopTerms,
  getRecentEvents,
} from "../core/usage.js";
import { suggestForTerm } from "../core/suggest.js";
import { testPattern } from "../core/matcher.js";
import {
  resolveConfigWithProvenance,
  writeConfigFile,
  loadConfig,
} from "../core/config.js";
import { GitBatcher } from "../core/git-batcher.js";
import { buildStoreCommitOptions } from "../core/store-git-options.js";
import { homedir } from "node:os";

export interface ControlServerOptions {
  port?: number; // default 7337
  cwd?: string; // project root for project-scoped ops
  serveUi?: boolean; // serve static UI assets if available
  open?: boolean; // launch browser
}

export interface ControlServerHandle {
  url: string;
  close: () => Promise<void>;
  /** Flush any pending batch git commits immediately. No-op if not in batch mode. */
  flushGit: () => Promise<void>;
}

const DEFAULT_PORT = 7337;

type AnnotatedEntry = GlossaryEntry & {
  scope: "global" | "project";
  sourcePath: string | null;
  /** Provenance: which file/tier this entry was loaded from. */
  definedIn: { path: string; tier: string; location: "global" | "project" } | null;
  /** Higher-priority files that shadow this same term (merged view). */
  overriddenBy: string[];
};

function tierLabel(p: string | null): string {
  if (!p) return "";
  const home = homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

/** Annotate entries with their scope, provenance, and override info. */
function annotatedEntries(
  scope: "merged" | "global" | "project",
  cwd: string
): AnnotatedEntry[] {
  const tag = (s: "global" | "project"): AnnotatedEntry[] => {
    const g = loadGlossaryByScope(s, cwd);
    const src = g.sources[0] ?? null;
    return g.entries.map((e) => ({
      ...e,
      scope: s,
      sourcePath: src,
      definedIn: src
        ? { path: src, tier: tierLabel(src), location: s }
        : null,
      overriddenBy: [] as string[],
    }));
  };

  if (scope === "global") return tag("global");
  if (scope === "project") return tag("project");

  // merged: project wins on term collision; record what shadows what.
  const globals = tag("global");
  const projects = tag("project");
  const projectTerms = new Map(projects.map((e) => [e.term.toLowerCase(), e]));

  const byTerm = new Map<string, AnnotatedEntry>();
  for (const e of globals) {
    const winner = projectTerms.get(e.term.toLowerCase());
    if (winner) {
      // global entry is shadowed by the project file
      e.overriddenBy = [winner.sourcePath ?? "project"];
    }
    byTerm.set(e.term.toLowerCase(), e);
  }
  for (const e of projects) byTerm.set(e.term.toLowerCase(), e);
  return Array.from(byTerm.values());
}

/** Resolve the installed UI package's static dist directory, if present. */
export function resolveUiDist(): string | null {
  const require = createRequire(import.meta.url);
  try {
    const pkgJson = require.resolve("open-agent-glossary-ui/package.json");
    const dist = join(dirname(pkgJson), "dist");
    return existsSync(join(dist, "index.html")) ? dist : null;
  } catch {
    return null;
  }
}

function uiNotInstalledHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>open-agent-glossary</title>
<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1rem;color:#222}
code{background:#f4f4f5;padding:.15rem .35rem;border-radius:.25rem}</style></head>
<body><h1>UI not installed</h1>
<p>The <code>open-agent-glossary-ui</code> package is not available. Install it with:</p>
<pre><code>npm i -g open-agent-glossary-ui</code></pre>
<p>Or run the UI on demand:</p>
<pre><code>npx open-agent-glossary-ui</code></pre>
<p>The JSON API is available under <code>/api</code>.</p></body></html>`;
}

/**
 * Build the Hono app. Exposed separately so tests can use `app.request()`
 * without binding a socket.
 */
export function createControlApp(opts: ControlServerOptions = {}): Hono {
  const cwd = opts.cwd ?? process.cwd();
  const app = new Hono();

  // --- Git batcher (batch mode only) ---
  const config = loadConfig(cwd);
  let batcher: GitBatcher | undefined;
  if (config.git.autoCommit === "batch") {
    batcher = new GitBatcher({
      cwd,
      idleSeconds: config.git.batchIdleSeconds ?? 300,
      batchCommitMessage: config.git.batchCommitMessage ?? "chore(glossary): update {count} glossary term(s)",
      onError: (err) => {
        process.stderr.write(
          `[open-agent-glossary] git batch commit failed: ${
            err instanceof Error ? err.message : String(err)
          }\n`
        );
      },
    });
  }
  app.use(
    "/api/*",
    cors({
      origin: (origin) =>
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin ?? "")
          ? origin
          : "",
    })
  );

  const err = (c: any, message: string, status = 400) =>
    c.json({ error: message }, status);

  app.get("/api/health", (c) =>
    c.json({ ok: true, name: "open-agent-glossary", version: pkgVersion() })
  );

  app.get("/api/discovery", (c) => c.json(discoverGlossaries()));

  app.get("/api/session", (c) => {
    const session = loadSession(cwd);
    return c.json(session);
  });

  app.get("/api/entries", (c) => {
    const scope = (c.req.query("scope") ?? "merged") as
      | "merged"
      | "global"
      | "project";
    if (!["merged", "global", "project"].includes(scope)) {
      return err(c, `Invalid scope '${scope}'`);
    }
    return c.json({ entries: annotatedEntries(scope, cwd) });
  });

  app.post("/api/entries", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return err(c, "Invalid JSON body");
    }
    const scope = (body.scope ?? "project") as "global" | "project";
    if (!body.term || !body.definition) {
      return err(c, "term and definition are required");
    }
    try {
      const entry: GlossaryEntry = {
        term: body.term,
        definition: body.definition,
        aliases: body.aliases,
        pattern: body.pattern,
        flags: body.flags,
        enabled: body.enabled,
        source: body.source,
        tags: body.tags,
      };
      const gitOptions = buildStoreCommitOptions(loadConfig(cwd), cwd, batcher);
      await addTerm(scope, entry, cwd, gitOptions);
      return c.json({ ok: true }, 201);
    } catch (e) {
      return err(c, e instanceof Error ? e.message : String(e), 409);
    }
  });

  app.put("/api/entries/:term", async (c) => {
    const term = c.req.param("term");
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return err(c, "Invalid JSON body");
    }
    const scope = (body.scope ?? "project") as "global" | "project";
    const updates: Partial<Omit<GlossaryEntry, "term">> = {};
    for (const k of [
      "definition",
      "aliases",
      "pattern",
      "flags",
      "enabled",
      "source",
      "tags",
    ] as const) {
      if (body[k] !== undefined) (updates as any)[k] = body[k];
    }
    try {
      const gitOptions = buildStoreCommitOptions(loadConfig(cwd), cwd, batcher);
      await editTerm(scope, term, updates, cwd, gitOptions);
      return c.json({ ok: true });
    } catch (e) {
      return err(c, e instanceof Error ? e.message : String(e), 404);
    }
  });

  app.delete("/api/entries/:term", async (c) => {
    const term = c.req.param("term");
    const scope = (c.req.query("scope") ?? "project") as "global" | "project";
    try {
      const gitOptions = buildStoreCommitOptions(loadConfig(cwd), cwd, batcher);
      await removeTerm(scope, term, cwd, gitOptions);
      return c.json({ ok: true });
    } catch (e) {
      return err(c, e instanceof Error ? e.message : String(e), 404);
    }
  });

  app.get("/api/usage", (c) => c.json(readUsage()));

  app.get("/api/usage/session/:id", (c) => {
    const usage = getSessionUsage(c.req.param("id"));
    if (!usage) return err(c, "Session not found", 404);
    return c.json(usage);
  });

  app.get("/api/usage/top", (c) => {
    const limit = Number(c.req.query("limit") ?? "20");
    const kind = c.req.query("kind") as "lookup" | "injection" | undefined;
    return c.json({ terms: getTopTerms(Number.isFinite(limit) ? limit : 20, kind) });
  });

  app.get("/api/usage/timeline", (c) => {
    const limit = Number(c.req.query("limit") ?? "2000");
    return c.json({
      events: getRecentEvents(Number.isFinite(limit) ? limit : 2000),
    });
  });

  // Distinct tags across the merged glossary, with counts.
  app.get("/api/tags", (c) => {
    const counts: Record<string, number> = {};
    for (const e of annotatedEntries("merged", cwd)) {
      for (const t of e.tags ?? []) counts[t] = (counts[t] ?? 0) + 1;
    }
    const tags = Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    return c.json({ tags });
  });

  // Reusable regex tester (mirrors real injection matching).
  app.post("/api/pattern/test", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return err(c, "Invalid JSON body");
    }
    if (typeof body.sample !== "string") {
      return err(c, "sample (string) is required");
    }
    return c.json(
      testPattern({
        pattern: body.pattern,
        flags: body.flags,
        term: body.term,
        aliases: body.aliases,
        sample: body.sample,
      })
    );
  });

  // Config: resolved value + per-field origin + resolution stack.
  app.get("/api/config", (c) => c.json(resolveConfigWithProvenance(cwd)));

  app.get("/api/config/paths", (c) => {
    const { stack, activeFile } = resolveConfigWithProvenance(cwd);
    return c.json({ stack, activeFile });
  });

  app.put("/api/config", async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return err(c, "Invalid JSON body");
    }
    const file = body.file as string | undefined;
    const next = body.config as GlossaryConfig | undefined;
    if (!file || !next) {
      return err(c, "file and config are required");
    }
    try {
      const written = writeConfigFile(file, next);
      return c.json({ ok: true, file: written });
    } catch (e) {
      return err(c, e instanceof Error ? e.message : String(e), 400);
    }
  });

  app.get("/api/suggest", (c) => {
    const term = c.req.query("term");
    if (!term) return err(c, "term query param is required");
    return c.json(suggestForTerm(term, cwd));
  });

  // ── Static UI ──────────────────────────────────────────────────────────────
  if (opts.serveUi !== false) {
    const dist = resolveUiDist();
    if (dist) {
      const root = relative(process.cwd(), dist) || ".";
      app.use("/*", serveStatic({ root }));
      // SPA fallback
      app.get("*", serveStatic({ path: join(root, "index.html") }));
    } else {
      app.get("/", (c) => c.html(uiNotInstalledHtml()));
    }
  }

  return app;
}

function pkgVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    return require("../../package.json").version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Start the control server bound to 127.0.0.1 only.
 */
export async function startControlServer(
  opts: ControlServerOptions = {}
): Promise<ControlServerHandle> {
  const cwd = opts.cwd ?? process.cwd();
  const port = opts.port ?? (Number(process.env.OAG_UI_PORT) || DEFAULT_PORT);

  // Grow the "whole computer" view as the tool is used in more repos.
  try {
    registerProject(cwd);
  } catch {
    // best-effort
  }

  const app = createControlApp({ ...opts, cwd });

  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  const url = `http://127.0.0.1:${port}`;

  // Grab the batcher from the app context so we can flush on close.
  // We create a second config read here — lightweight since it's at startup.
  const cfg = loadConfig(cwd);
  let batcher: GitBatcher | undefined;
  if (cfg.git.autoCommit === "batch") {
    batcher = new GitBatcher({
      cwd,
      idleSeconds: cfg.git.batchIdleSeconds ?? 300,
      batchCommitMessage: cfg.git.batchCommitMessage ?? "chore(glossary): update {count} glossary term(s)",
    });
  }

  if (opts.open) {
    void openBrowser(url);
  }

  return {
    url,
    flushGit: async () => {
      if (batcher) await batcher.flush();
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (batcher) batcher.dispose();
        server.close((e?: Error) => (e ? reject(e) : resolve()));
      }),
  };
}

async function openBrowser(url: string): Promise<void> {
  const { spawn } = await import("node:child_process");
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // ignore — browser launch is best-effort
  }
}
