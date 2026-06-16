# OpenCode adapter

This adapter exposes `open-agent-glossary` as an OpenCode plugin.

## Install via npm plugin config

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["open-agent-glossary/opencode"]
}
```

## Behavior

- matches glossary terms from user text in `chat.message`
- injects only newly matched terms in `experimental.chat.system.transform`
- dedupes per OpenCode `sessionID`
- exposes `glossary_lookup` tool
