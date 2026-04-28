# What changed

## New poses: `guide` and `blast`

Two new pose images live in `src/character/assets/`:

- `eurelyas_guide.png` — wings spread wide, staff raised. The "offering counsel" stance.
- `eurelyas_blast.png` — combat stance with magic circle. The "decisive action" stance.

The sprite system already auto-discovers any file matching `eurelyas_*.png`, so these become available simply by being in the folder.

### State → pose binding

`SpriteCharacterWindow.jsx` now maps states to poses automatically:

| State      | Pose    | Why |
|------------|---------|-----|
| THINKING   | `blast` | Eurelyas is working — combat circle, focused energy |
| SPEAKING   | `guide` | Eurelyas is delivering counsel — wings open, staff raised |
| everything else | `idle` | Default floating pose |

An explicit `<action pose="..."/>` tag from Claude (see below) overrides this for its duration, then auto-reverts.

### Tag Eurelyas can emit

The system prompt now teaches Claude two tag families:

```
<mood glow="warm|cool|crimson|serene|intense|default"/>
<action pose="guide|blast|spread|staff_down"/>
```

Tags are stripped from the visible text. The main process broadcasts `{ event: 'mood', glow }` or `{ event: 'action', pose, glow }` to the character window. Action poses come with `ACTION_DURATIONS` (5–8s) before reverting to idle.

## MCP connectors

Eurelyas can now talk to remote MCP servers via Anthropic's MCP connector feature — no separate MCP client process, the Messages API hands tool calls off to the configured servers and returns the result inline.

### Setup

1. **First run** of the updated build copies `electron/mcp-servers.example.json` to:
   - **Windows:** `%APPDATA%\Eurelyas\mcp-servers.json`
   - **macOS:** `~/Library/Application Support/Eurelyas/mcp-servers.json`
   - **Linux:** `~/.config/Eurelyas/mcp-servers.json`

2. **Edit that file.** Set `enabled: true` for each connector, fill in the URL and auth token. Tokens written as `$ENV_VAR` are read from `.env` so you don't commit secrets.

3. **Restart Eurelyas.** The console logs which servers loaded.

### Example

```json
{
  "servers": [
    {
      "enabled": true,
      "name": "google-calendar",
      "url": "https://your-calendar-mcp-host/sse",
      "authorization_token": "$CALENDAR_MCP_TOKEN"
    }
  ]
}
```

`.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
CALENDAR_MCP_TOKEN=...
```

When at least one server is enabled, the chat handler switches to `anthropic.beta.messages.create` with the `anthropic-beta: mcp-client-2025-04-04` header. Anthropic resolves the tool calls server-side; we receive the assistant's final text plus `mcp_tool_use`/`mcp_tool_result` blocks (we surface only the text in the chat panel).

### Note on the SDK version

The current `@anthropic-ai/sdk@^0.30.0` in this project supports passing `mcp_servers` as an extra parameter via `beta.messages.create`. The newer beta header `mcp-client-2025-11-20` (which moves tool config into the `tools` array) requires SDK 0.90+ — bump `package.json` if you want to migrate. Until then, the deprecated-but-functional `mcp-client-2025-04-04` works fine.

### What changed in `electron/main.js`

- Loads `mcp-servers.json` on each chat call (so edits take effect at the next message, no restart needed for config-only changes).
- Resolves `$ENV_VAR` tokens from process env.
- Calls `anthropic.beta.messages.create` with `mcp_servers` when any server is enabled, plain `anthropic.messages.create` otherwise. Both code paths are exercised on every restart.
- Extracts assistant text from the multi-block response (text blocks only — `mcp_tool_use` and `mcp_tool_result` blocks are ignored for display).
- New IPC handlers: `mcp:list` (so the chat panel can show connected servers) and `mcp:openConfig` (reveals the JSON file in Explorer/Finder).

## Updated system prompt

The `EURELYAS_SYSTEM_PROMPT` now includes the POSE block teaching Claude when to use `<action pose="..."/>`, and a TOOLS paragraph that sets the right tone for connector use ("Read before you write. Confirm destructive actions before executing. Surface what you found, not how you found it.").
