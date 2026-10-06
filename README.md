# claude-own-history

Claude Code's Up arrow recalls prompts from every Claude session in the same
project, so with several Claude instances in one checkout you get another
instance's prompts (upstream: anthropics/claude-code#15631). This tool makes
the Up arrow of each running Claude recall only its own sessions' prompts.
Ctrl+R search still searches everything.

It needs no change to Claude Code, its binary or your settings files, and no
terminal multiplexer.

## Install

Put `bin/` before Claude's own launcher (`~/.local/bin/claude`) in `PATH`:

```sh
export PATH="$HOME/personal_projects/claude-own-history/bin:$PATH"
```

Add it in `.zshrc` (or `.bashrc`) after anything that rewrites `PATH`, such
as `mise activate`; check with `which -a claude` in a new terminal. Shells
started before that keep running Claude untouched.

The wrapper finds the next `claude` in `PATH`; set `CLAUDE_OWN_HISTORY_REAL`
to the real binary if it finds the wrong one. The install path must not
contain a space. Uninstall by removing it from `PATH`.

## How it works

- `bin/claude` runs the real Claude with `BUN_OPTIONS=--preload
  lib/preload.js`. Claude Code is a Bun single-file executable, and Bun loads
  the preload before Claude's own code.
- The preload wraps `open` from `fs/promises`. When Claude's Up-arrow code
  (`readForProject`, and `countForProject` for the `History N/M` counter)
  opens `~/.claude/history.jsonl`, it opens a copy holding only this
  process's sessions instead. Every other reader and every writer gets the
  real file.
- The process's sessions are: the id named by `--resume <id>` or
  `--session-id <id>`; every id a `SessionStart` hook reports (startup,
  `--continue`, the resume picker, `/resume`, `/clear`, fork), through a hook
  the wrapper adds with `--settings`; and the session of every prompt the
  process appends. Prompts from before a `/clear` in the same terminal stay
  recallable, as in a shell.
- The preload restores `BUN_OPTIONS` at once, so the Bash tool, MCP servers
  and a nested `claude` do not inherit it.

When the wrapper sees print mode (`-p`), a subcommand (`mcp`, `update`, ...),
`--help`, `--version`, your own `--settings`, or no terminal, it runs Claude
untouched.

## Failure behaviour

Any error in the preload, or no known session yet, hands Claude the real
file: you get Claude's usual shared history, never a crash. If a Claude
release reads the file another way or renames the reader methods, the filter
silently stops and the shared history returns. Run with
`CLAUDE_OWN_HISTORY_DEBUG=1` to log to
`~/.local/state/claude-own-history/debug.log`.

Known limits: two terminals resuming the same session id share its history.

## Files

- `bin/claude`: the wrapper (POSIX sh). Decides whether to intervene, makes
  the per-process mailbox, adds the hook, sets `BUN_OPTIONS`, execs Claude.
- `lib/preload.js`: runs inside Claude; the only code that touches Claude's
  file reads.
- `lib/core.js`: pure rules (which ids, which lines, which caller), tested by
  `test/core.test.js`.
- State: `${XDG_STATE_HOME:-~/.local/state}/claude-own-history/`, mode 0700:
  `<pid>-<token>.events` (hook mailbox) and `<pid>-<token>.view.jsonl` (the
  filtered copy), both 0600 and removed when Claude exits; the wrapper
  removes those of dead processes.

## Verify

```sh
bun test
```

Live check (last done with Claude Code 2.1.291): in an empty directory, run
two sessions through the wrapper with one prompt each, then `claude
--continue`; Up shows only the continued session's prompt, while a plain
`claude` there shows both.

## Platforms

- macOS: tested end to end (Claude Code 2.1.291).
- Linux: the native build behaves the same as far as this tool depends on
  it. Checked in `ubuntu:24.04` with Claude Code 2.1.291: the binary honours
  `BUN_OPTIONS=--preload`, the preload sees `/$bunfs/root/cli`, the history
  reader opens the file with `fs/promises` `open(path, "r")`, the
  `readForProject`/`countForProject`/`readTimestamped` methods exist, and the
  preload's `open` is installed. The interactive Up arrow itself was not
  tried there (that needs a login).
- An npm-installed Claude that runs on Node ignores `BUN_OPTIONS`, so it runs
  untouched and keeps the shared history.
- Windows is not supported (the wrapper is a POSIX shell script).

## License

Apache-2.0, see `LICENSE`.
