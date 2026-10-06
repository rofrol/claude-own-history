# Filter history reads with a Bun preload

## Context

Claude Code (checked in 2.1.291) keeps every prompt in one
`~/.claude/history.jsonl`. Its Up-arrow reader (`readForProject`) takes the
100 newest records of the project from all sessions and lists the current
session's first, then the others, without a marker between them. Upstream
issue anthropics/claude-code#15631 has been open since 2025-12. Claude Code
is a codesigned Bun single-file executable with the hardened runtime, so
`DYLD_INSERT_LIBRARIES` is refused, and there is no setting or env var for
the history path.

## Decision

A `claude` wrapper earlier in `PATH` starts the real binary with
`BUN_OPTIONS=--preload lib/preload.js`, which the binary honours. The preload
wraps `fs/promises.open` and, only when the call stack shows the Up-arrow
reader, opens a copy of the file filtered to this process's sessions. The
session ids come from argv, a `SessionStart` hook added through `--settings`
(its command names a per-process mailbox), and the records the process
appends.

## Alternatives

- A per-process `CLAUDE_CONFIG_DIR` of symlinks with its own history file:
  Claude's atomic writes (temporary file and rename) turn a symlink into a
  private copy (`settings.local.json` on every "always allow",
  `~/.claude.json`), each directory gets its own daemon and lock, and the
  keychain entry name changes unless `CLAUDE_SECURESTORAGE_CONFIG_DIR` is set.
- A keystroke proxy (a multiplexer swallows Up and types the prompt itself):
  depends on recognising an empty prompt box from the screen and on Claude's
  menus, dialogs and multi-line editing; works only inside that multiplexer.
- Patching the minified JS in the binary: breaks the signature, must be
  redone on every auto-update, and Bun may run embedded bytecode instead.
- Rewriting `project` in the shared file: one file cannot show different
  contents to different processes.
- Guessing the `--continue` session from the newest transcript: the newest
  may belong to another terminal in the same project.

## Consequences

- No change to Claude's binary or settings files; removing `bin/` from
  `PATH` restores stock behaviour.
- The filter depends on undocumented internals: `BUN_OPTIONS` being honoured,
  `open(path, "r")` from `fs/promises`, and the method names
  `readForProject`/`countForProject`. A release that changes them silently
  restores the shared history; it cannot crash Claude, since every error
  falls back to the real file.
- Sessions are owned per process and accumulate (a `/clear` keeps the
  earlier prompts recallable). Two processes resuming one session id share
  its history.
