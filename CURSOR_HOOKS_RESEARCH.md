# Cursor Hooks Research

Checked against the official [Cursor Hooks documentation](https://cursor.com/docs/hooks) and [Cursor Plugins documentation](https://cursor.com/docs/plugins) on 2026-09-12. This is research only; no Cursor integration is implemented here.

## 1. Hook list and blocking

**CORRECTED.** Cursor's current Agent hook list is:

`sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `subagentStart`, `subagentStop`, `beforeShellExecution`, `afterShellExecution`, `beforeMCPExecution`, `afterMCPExecution`, `beforeReadFile`, `afterFileEdit`, `beforeSubmitPrompt`, `preCompact`, `stop`, `afterAgentResponse`, and `afterAgentThought`.

The requested names are all present, but the list is incomplete. Cursor also has separate Tab hooks (`beforeTabFileRead`, `afterTabFileEdit`) and the app lifecycle hook `workspaceOpen`.

Blocking/action-control hooks:

| Hook | Can block or decide? |
| --- | --- |
| `preToolUse` | Yes: `allow` or `deny`; `ask` is accepted by the schema but is not enforced for this hook today. |
| `beforeShellExecution` | Yes: `allow`, `deny`, or `ask`. |
| `beforeMCPExecution` | Yes: `allow`, `deny`, or `ask`. |
| `beforeReadFile` | Yes: `allow` or `deny`. |
| `beforeTabFileRead` | Yes: `allow` or `deny`. |
| `beforeSubmitPrompt` | Yes, via `continue: true/false`. |
| `subagentStart` | Yes: `allow` or `deny`; `ask` is treated as deny. |
| `sessionStart`, `sessionEnd`, post-hooks, `preCompact`, `stop`, `afterAgentResponse`, `afterAgentThought`, `afterTabFileEdit`, `workspaceOpen` | No action blocking. They are observational, fire-and-forget, or have their own non-blocking output. |

## 2. Shell interception and ordering

**CONFIRMED, with UNKNOWN ordering.** `beforeShellExecution` is the shell-specific pre-execution hook and receives the command in `command`. It is the right hook for gating shell execution.

`preToolUse` is generic and fires for all tools; use `matcher: "Shell"` to target the Shell tool. The docs do not state whether both hooks fire for one shell command, nor do they specify an ordering between them. Do not depend on an order until verified experimentally in the target Cursor build. `beforeShellExecution` is the reliable hook for this primitive.

Source: [Hook events and matchers](https://cursor.com/docs/hooks#reference).

## 3. Permission response shape

**CONFIRMED for permission hooks.** For `beforeShellExecution`, `beforeMCPExecution`, and the other permission-returning hooks, stdout is JSON with this shape:

```json
{
  "permission": "allow" | "deny" | "ask",
  "user_message": "optional message shown in the client",
  "agent_message": "optional message sent to the agent"
}
```

The values are exactly `allow`, `deny`, and `ask`. Cursor's examples also include `"continue": true`, but the permission-hook reference describes `permission` plus the optional messages; the daemon should emit the documented permission fields and not Claude Code's `hookSpecificOutput` wrapper.

Source: [beforeShellExecution / beforeMCPExecution reference](https://cursor.com/docs/hooks#before-shell-execution--beforemcpexecution).

## 4. Input fields and shell example

**CONFIRMED, with additional fields.** Common input includes `conversation_id`, `generation_id`, `model`, optional `model_id` and `model_params`, `hook_event_name`, `cursor_version`, `workspace_roots`, `user_email`, and optional `transcript_path`. The supplied claim omits `model_id`, `model_params`, and `transcript_path`.

Pasteable representative `beforeShellExecution` stdin:

```json
{
  "conversation_id": "conv-123",
  "generation_id": "gen-456",
  "model": "claude-opus-4-7-thinking-max",
  "model_id": "claude-opus-4-7",
  "model_params": [{ "id": "effort", "value": "max" }],
  "hook_event_name": "beforeShellExecution",
  "cursor_version": "1.7.2",
  "workspace_roots": ["/project"],
  "user_email": null,
  "transcript_path": null,
  "command": "npm test",
  "cwd": "/project",
  "sandbox": false
}
```

## 5. Configuration location and syntax

**CORRECTED.** User config is `~/.cursor/hooks.json`. Project config is `<project-root>/.cursor/hooks.json`, not `/.cursor/hooks.json` (which would mean the filesystem root). Project hook commands run from the project root; user hook commands run from `~/.cursor/`.

Minimal project config that sends stdin to the existing HTTP endpoint is syntactically valid, but it is **not yet compatible with this repository** because the endpoint currently accepts Claude Code input and returns Claude Code output:

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      {
        "command": "curl -sS -X POST http://127.0.0.1:7777/hook/cursor -H \"Content-Type: application/json\" --data-binary @-",
        "timeout": 600,
        "failClosed": true
      }
    ]
  }
}
```

The eventual shim must translate Cursor JSON to the daemon's canonical input and translate the daemon decision back to Cursor's flat permission response. `curl` is only a transport; Cursor does not invoke HTTP hooks directly.

## 6. Transport and stdin/stdout contract

**CONFIRMED.** Hooks are spawned commands, not direct HTTP callbacks. Cursor writes one JSON object to the child process's stdin. The command must write the hook response as JSON to stdout; diagnostics belong on stderr. Exit code `0` uses the JSON output. Exit code `2` blocks the action. Other non-zero exit codes mean hook failure and, by default, the action proceeds.

## 7. Timeout and failure behavior

**CORRECTED / UNKNOWN numeric default.** A hook can set `timeout` in seconds per script. The official reference says the default is the platform default; it does not give a numeric value. On crash, timeout, or invalid JSON, the default is fail-open and the action proceeds. Set `"failClosed": true` to block on those failures. This is essential for the scheduler: a parked request needs a sufficiently large per-hook timeout and `failClosed` if timeout must not silently approve execution.

## 8. Distribution

**CORRECTED.** Hooks can ship in a Cursor Plugin. Cursor Plugins use `.cursor-plugin/plugin.json`; hooks are a supported component. Plugins install through **Customize** from a marketplace. The official Cursor Marketplace exists and reviews listed plugins, and Teams/Enterprise can use team marketplaces. The docs do not describe a public one-command CLI install flow for a plugin. Project hooks committed at `.cursor/hooks/hooks.json` are the simplest no-marketplace distribution path.

Sources: [Cursor Plugins](https://cursor.com/docs/plugins), [Marketplace](https://cursor.com/marketplace).

## Paste-ready stdout

For a parked/manual decision, the exact Cursor permission response is:

```json
{
  "permission": "ask",
  "user_message": "Command is waiting for human approval in Interrupt Scheduler.",
  "agent_message": "Approval is pending in the Interrupt Scheduler browser console."
}
```

For an automatic allow, emit `{ "permission": "allow" }`; for a deny, emit `{ "permission": "deny", "user_message": "Blocked by Interrupt Scheduler." }`.

## Cursor to Claude Code normalizer map

| Meaning | Cursor | Claude Code |
| --- | --- | --- |
| Session/conversation ID | `conversation_id` | `session_id` |
| Generation/tool invocation ID | `generation_id` / hook-specific `tool_use_id` where present | `tool_use_id` |
| Event name | `hook_event_name` | `hook_event_name` |
| Tool name | `tool_name` in `preToolUse`; shell is implied by `beforeShellExecution` | `tool_name` |
| Shell command | `command` | `tool_input.command` |
| Working directory | `cwd` | `cwd` |
| Workspace roots | `workspace_roots` | No direct equivalent in the current adapter |
| Model | `model` plus optional `model_id` | No direct equivalent in the current adapter |
| Decision output | `{ "permission": "allow"/"deny"/"ask" }` | `hookSpecificOutput.permissionDecision` (`allow`/`deny`/`ask`) |
| Decision explanation | `user_message`, `agent_message` | `hookSpecificOutput.permissionDecisionReason` |

Claude Code uses the nested `hookSpecificOutput` response; Cursor uses the flat permission response. The normalizer must preserve this distinction at the final adapter boundary.