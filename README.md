# open-agent-glossary

Tool-agnostic glossary management for coding agents.

## Quick start

### Install

```bash
npm install -g open-agent-glossary
# or use directly with
npx open-agent-glossary --help
```

### Initialize and open the UI

```bash
open-agent-glossary init
open-agent-glossary ui
```

By default the UI runs at:

```text
http://127.0.0.1:7337
```

### Add a term

```bash
open-agent-glossary add "BFF" "Backend For Frontend" --scope project --cwd .
```

Or edit the generated file directly:

```text
.open-agent-glossary/glossary.json
```

### Connect an agent

#### Pi

```bash
pi install npm:open-agent-glossary
```

#### Claude Code

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPrompt": [
      {
        "matcher": ".*",
        "command": "npx open-agent-glossary inject --prompt \"$USER_PROMPT\" --cwd \"$CWD\""
      }
    ]
  }
}
```

#### OpenCode

Add to `.opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["open-agent-glossary/opencode"]
}
```

#### MCP (GitHub Copilot, Cursor, any MCP client)

Add to your MCP config:

```json
{
  "mcpServers": {
    "glossary": {
      "command": "npx",
      "args": ["open-agent-glossary", "mcp-serve"]
    }
  }
}
```

If you just want to try it locally, `init` + `ui` is enough.

## Local UI

The UI is the fastest way to understand merge order, inspect loaded terms, and edit entries without hand-editing JSON.

![open-agent-glossary UI overview](https://raw.githubusercontent.com/davidjadczyk/open-agent-glossary/main/assets/ui-overview.png)

### What the UI gives you

- **Overview**
  - glossary file discovery
  - merge order / precedence visualization
  - current session state
  - top-level lookup and injection metrics

- **Glossary**
  - searchable entries browser
  - list / split / cards layouts
  - inline add / edit / delete
  - alias and tag chip editors
  - live regex / pattern tester against sample text
  - provenance for where a term came from

- **Usage**
  - all-time vs current-session analytics
  - activity timeline
  - top terms by lookups or injections
  - detection of “looked up often, rarely injected” terms

- **Config**
  - config resolution stack
  - effective values with origin tracking
  - inline edits written back to the active config file

### UI commands

```bash
open-agent-glossary ui --port 4319
open-agent-glossary ui --no-open
open-agent-glossary mcp-serve --open   # UI starts by default
open-agent-glossary mcp-serve --no-ui  # disable UI auto-start
```

---

## What it is

`open-agent-glossary` gives your agents a shared, authoritative vocabulary.
You define project terms once in a glossary file, and the package makes those
terms available across:

- **Pi** via extension — lazy-loads definitions into the system prompt when terms are mentioned
- **OpenCode** via plugin — lazy system-prompt injection + per-session dedupe
- **Claude Code** via hooks — injects matching definitions on every prompt
- **Any MCP-capable agent** via stdio MCP server — explicit lookup, add, edit, remove tools
- **CLI scripts** directly

## Why it exists

Project acronyms and domain language drift fast. Agents either guess, ask again,
or use the wrong meaning. `open-agent-glossary` fixes that by loading glossary
terms from local files and making them available automatically or on demand,
without bloating every turn's prompt.

**Definitions are only injected when the current prompt references a matching glossary handle.**

The goal is **fast setup**, **one shared source of truth**, and a **great local UI**
for understanding what the glossary is doing.

## Background

This project is built on top of the schema and concepts from [pi-glossary](https://github.com/ruliana/pi-glossary) by [@ruliana](https://github.com/ruliana) — an excellent Pi extension for glossary injection.

The goal here is to take the same idea further and make it **tool-agnostic**: one shared glossary file that works seamlessly across Pi, Claude Code, GitHub Copilot, and any MCP-capable agent. Your team maintains a single `.agents/glossary.jsonl` in the repo, and every agent — regardless of which tool a developer uses — picks it up automatically.

Existing `glossary.json` files from `pi-glossary` are **100% schema-compatible** and can be dropped in without changes.

---

## 60-second setup

### 1) Initialize the project

The fastest way to get started is now:

```bash
open-agent-glossary init
```

This scaffolds:

```text
.open-agent-glossary/
  config.json
  glossary.json
```

- `config.json` contains sensible defaults
- `glossary.json` starts as an empty glossary ready to edit in the UI or via CLI

You can also initialize globally:

```bash
open-agent-glossary init --global
```

And overwrite existing files if needed:

```bash
open-agent-glossary init --force
```

### 2) Add glossary terms

You can now either:

- edit `.open-agent-glossary/glossary.json` directly
- use the local UI: `open-agent-glossary ui`
- or use the CLI:

```bash
open-agent-glossary add "BFF" "Backend For Frontend" --scope project --cwd .
```

You can still place glossaries in any supported path:

- `.agents/glossary.json` / `.agents/glossary.jsonl` ← recommended for shared team glossaries
- `.pi/glossary.json` / `.pi/glossary.jsonl` ← Pi-only
- `.open-agent-glossary/glossary.json` ← package-scoped project glossary created by `init`

Example:

```json
[
  {
    "term": "BFF",
    "definition": "Backend For Frontend — a dedicated backend service tailored to a specific frontend application.",
    "aliases": ["backend for frontend", "bff-pattern"]
  },
  {
    "term": "DRY",
    "definition": "Don't Repeat Yourself — reduce repetition of information across a codebase.",
    "aliases": ["dont repeat yourself"]
  }
]
```

Or JSONL (preferred for team repos — easier diffs, fewer merge conflicts):

```jsonl
{"term":"BFF","definition":"Backend For Frontend — a dedicated backend service tailored to a specific frontend application.","aliases":["backend for frontend"]}
{"term":"DRY","definition":"Don't Repeat Yourself — reduce repetition of information across a codebase.","aliases":["dont repeat yourself"]}
```

### 3) Pick your integration

#### Pi

```bash
pi install npm:open-agent-glossary
```

#### Claude Code hook

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPrompt": [
      {
        "matcher": ".*",
        "command": "npx open-agent-glossary inject --prompt \"$USER_PROMPT\" --cwd \"$CWD\""
      }
    ]
  }
}
```

#### OpenCode plugin

Add to `.opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["open-agent-glossary/opencode"]
}
```

#### MCP (GitHub Copilot, Cursor, any MCP client)

Add to your MCP config:

```json
{
  "mcpServers": {
    "glossary": {
      "command": "npx",
      "args": ["open-agent-glossary", "mcp-serve"]
    }
  }
}
```

That is enough to start.

---

## Pi — Extension Details

Pi offers the closest to a native glossary experience because it runs as a **Pi Extension** bundled inside this package.

### Install

```bash
pi install npm:open-agent-glossary
```

### How It Works

1. On session start, the extension loads `~/.agents/glossary.json(.l)`, `~/.pi/agent/glossary.json(.l)`, `.agents/glossary.json(.l)`, and `.pi/glossary.json(.l)` from the current project.
2. Project entries override global entries when they share the same `term`.
3. Before each agent turn, the extension scans the user's prompt for matching glossary terms, aliases, or explicit regex patterns.
4. If terms match, **only terms not already loaded in the current session** are injected into the system prompt.
5. Loaded glossary handles stay visible in the footer status for the rest of the session as `Glossary: term, term`.

### What You Get

- Automatic lazy injection — definitions only appear when the prompt references a matching handle
- Term highlighting while typing
- Footer status showing loaded glossary handles
- `glossary_lookup` tool the LLM can call explicitly
- `/glossary` — show glossary load status
- `/glossary reload` — reload glossary files without restarting Pi

### When Glossary Files Change

Pi keeps glossary entries in memory for the session. Run `/glossary reload` after editing, or start a new session.

---

## OpenCode Plugin

The OpenCode adapter uses a two-step hook flow aligned with the Pi adapter:

1. `chat.message` matches glossary terms from the incoming user text
2. `experimental.chat.system.transform` injects only new terms into system context

It dedupes terms per OpenCode `sessionID`, so repeated mentions in the same session are not re-injected.

### Install modes

#### npm plugin

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["open-agent-glossary/opencode"]
}
```

#### local plugin file

Copy `examples/opencode/plugins/open-agent-glossary.ts` into `.opencode/plugins/` and reference it in your OpenCode config.

### Tool

The plugin exposes `glossary_lookup` for explicit lookups and `[[cross-ref]]` follow-ups.

---

## Claude Code Hooks

On every prompt:
1. Glossary files are loaded from disk.
2. Terms are matched against the prompt.
3. Matching definitions are returned to the agent as context.

Changes to shared project glossaries are picked up automatically on the **next prompt** — no reload needed.

---

## MCP

Use MCP when your agent supports MCP but not prompt hooks, or when you want explicit tools for lookup/edit/list.

### Tools

| Tool | Description |
|---|---|
| `glossary_lookup` | Look up a term |
| `glossary_list` | List all terms |
| `glossary_add` | Add an entry |
| `glossary_edit` | Edit an entry |
| `glossary_remove` | Remove an entry |

The MCP server re-reads glossary files on every tool call — no reload needed.

---

## GitHub Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "glossary": {
      "command": "npx",
      "args": ["open-agent-glossary", "mcp-serve"]
    }
  }
}
```

Add `.github/copilot-instructions.md` to make Copilot use it proactively:

```markdown
## Glossary

This project uses a shared glossary for domain-specific terms.
When the user mentions an unfamiliar project term or acronym,
use the `glossary_lookup` tool to get its authoritative definition.
At the start of a conversation, use `glossary_list` to see all available terms.
```

See `hooks/github-copilot.md` for full hook and CLI setup.

---

## Shared Project Glossaries

This is a first-class use case. Put the team glossary at:

```text
.agents/glossary.jsonl
```

Why `.jsonl` for shared files?
- Easier line-based diffs
- Fewer merge conflicts when multiple people add entries
- Easy to append entries
- Works with every integration (not just Pi)

### Reload Behavior by Integration

| Integration | Reload behavior |
|---|---|
| Pi | Loaded at session start; `/glossary reload` after changes |
| OpenCode plugin | Re-read on each user turn; deduped per `sessionID` |
| Claude hook | Re-read on every prompt |
| MCP | Re-read on every tool call |
| CLI | Re-read on every command |

### Merge Order (later wins on same `term`)

1. `~/.pi/agent/glossary.json(.l)` — global Pi terms
2. `~/.agents/glossary.json(.l)` — global cross-tool terms
3. `.pi/glossary.json(.l)` — project Pi terms
4. `.agents/glossary.json(.l)` — project cross-tool terms ← recommended

---

## Glossary Entry Format

```json
{
  "term": "BFF",
  "definition": "Backend For Frontend ...",
  "aliases": ["backend for frontend"],
  "pattern": "BFF|backend.?for.?frontend",
  "flags": "iu",
  "enabled": true,
  "source": "project-glossary"
}
```

| Field | Required | Description |
|---|---|---|
| `term` | yes | canonical handle |
| `definition` | yes | authoritative definition |
| `aliases` | no | extra plain-text triggers |
| `pattern` | no | explicit regex — overrides default matcher |
| `flags` | no | regex flags, default `iu` |
| `enabled` | no | set `false` to disable |
| `source` | no | provenance label |

---

## Release / publish

Run the release script:

```bash
npm run release -- patch
# or: minor / major
```

This script will:

1. verify clean git state
2. run tests/typecheck/build
3. bump versions in root + `ui/`
4. create commit + git tag (`vX.Y.Z`)
5. push commit + tags
6. create GitHub release notes (`gh release create --generate-notes`)

Package publishing is handled by GitHub Actions Trusted Publishing (OIDC) on tag push via `.github/workflows/publish.yml`.

Requirements:

- npm Trusted Publisher configured for this repo/workflow
- `gh` CLI installed and authenticated (for automatic GitHub release creation)

## Branching and release flow

Current recommended flow for solo maintainers + contributors:

1. Create changes in `feat/*` branches.
2. Open PR `feat/*` -> `develop`.
3. After reviews/validation, merge into `develop`.
4. When ready to release, open one PR `develop` -> `main`.
5. Run `npm run release -- <patch|minor|major>` on `develop` (or after merging).
   This tags `vX.Y.Z`, which automatically triggers publishing via tag push.

Notes:

- `develop` is the collaboration/integration branch.
- `main` is the release branch.
- PRs to `main` are normally used only for grouped, release-ready changes.

## CLI Quick Reference

```bash
open-agent-glossary init --cwd .
open-agent-glossary init --global
open-agent-glossary inject --prompt "what is BFF" --cwd .
open-agent-glossary lookup BFF --cwd .
open-agent-glossary list --cwd .
open-agent-glossary add "BFF" "Backend For Frontend" --scope project --cwd .
open-agent-glossary edit BFF --definition "Updated definition" --scope project --cwd .
open-agent-glossary remove BFF --scope project --cwd .
open-agent-glossary reset-session
open-agent-glossary mcp-serve
open-agent-glossary mcp-serve --port 7337 --open
open-agent-glossary mcp-serve --no-ui
open-agent-glossary ui --port 7337
```

---

## Local UI — technical details

The UI is served by a lightweight [hono](https://hono.dev) control server embedded
in the core package, binds to **`127.0.0.1` only**, and never transmits data
anywhere.

### How it works

- `open-agent-glossary ui` starts the control server and serves the UI assets
- the browser talks to the local JSON API under `/api`
- the UI uses the same glossary/config/session/usage logic as the CLI and MCP server
- everything is local-only and file-backed

### Autostart

Enable autostart so the UI boots with every agent session:

```json
{
  "ui": { "autostart": true, "port": 7337, "open": true }
}
```

### Packaging note

The UI is shipped as a prebuilt package (`open-agent-glossary-ui`) via
`optionalDependencies` — nothing is compiled on the user's machine. If it is
not installed, the control server still serves the JSON API under `/api` and
shows an install hint at `/`.

### Global storage

Per-user state lives under `~/.open-agent-glossary/`:

| File | Purpose |
|---|---|
| `usages.json` | Usage tracking (per-term / per-session / global totals) |
| `projects.json` | Registry of project roots seen by the tool (powers discovery) |
| `config.json` | Optional package-scoped global config |
| `glossary.json` | Optional package-scoped global glossary |

The registry grows organically — every time the control server starts in a repo,
that root is recorded so the “glossaries on this computer” view stays current.
No full-disk scanning is ever performed.

---

## Config

Config uses **first-found wins**.

### Project-level (highest priority)

- `.open-agent-glossary/config.json`
- `.agents/open-agent-glossary/config.json`
- `.pi/open-agent-glossary/config.json`

### Global user-level (fallback)

- `~/.open-agent-glossary/config.json`
- `~/.agents/open-agent-glossary/config.json`
- `~/.config/open-agent-glossary/config.json`
- `~/.pi/agent/extensions/open-agent-glossary/config.json`

Example:

```json
{
  "sessionTtlMinutes": 30,
  "glossaryMode": "merge",
  "glossaryPin": "",
  "extraGlossaryPaths": [],
  "disableGlobalGlossary": false,
  "disableProjectGlossary": false,
  "ui": {
    "autostart": false,
    "port": 7337,
    "open": true
  }
}
```

---

## Compatibility

Schema-compatible with [`pi-glossary`](https://github.com/ruliana/pi-glossary). Existing `glossary.json` files drop in without changes.

---

## License

MIT
