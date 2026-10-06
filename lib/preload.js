// Loaded by Bun before Claude Code's own code (bin/claude sets BUN_OPTIONS).
// It gives Claude's Up arrow a copy of history.jsonl holding only the
// sessions this process has run, and leaves every other read and write of
// that file alone. Any failure hands Claude the real file, so the worst case
// is Claude's usual shared history.
"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const core = require("./core.js");

const env = process.env;
const mailbox = env.CLAUDE_OWN_HISTORY_MAILBOX;
const originalBunOptions = env.CLAUDE_OWN_HISTORY_BUN_OPTIONS;

// Children (the Bash tool, MCP servers, a nested claude) inherit
// process.env: give them the caller's BUN_OPTIONS back and none of ours.
if (originalBunOptions) env.BUN_OPTIONS = originalBunOptions;
else delete env.BUN_OPTIONS;
delete env.CLAUDE_OWN_HISTORY_BUN_OPTIONS;
delete env.CLAUDE_OWN_HISTORY_MAILBOX;

// Only Claude's own entry point; any other Bun program is left untouched.
if (process.argv[1] === "/$bunfs/root/cli" && mailbox) install();

function install() {
  const stateDir = path.dirname(mailbox);
  const view = mailbox.replace(/\.events$/, ".view.jsonl");
  const debugLog = env.CLAUDE_OWN_HISTORY_DEBUG ? path.join(stateDir, "debug.log") : null;
  const configDir = (env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude")).normalize("NFC");
  const historyPath = path.resolve(configDir, "history.jsonl");
  const own = new Set(core.argvSessionIds(process.argv.slice(2)));
  let cachedKey = null;

  const log = (message) => {
    if (!debugLog) return;
    try {
      fs.appendFileSync(debugLog, `${new Date().toISOString()} ${process.pid} ${message}\n`, { mode: 0o600 });
    } catch {
      // Debug output must never break Claude.
    }
  };

  const isHistory = (p) => typeof p === "string" && path.resolve(p) === historyPath;

  function refreshFromMailbox() {
    let text;
    try {
      text = fs.readFileSync(mailbox, "utf8");
    } catch {
      return;
    }
    for (const id of core.mailboxSessionIds(text)) own.add(id);
  }

  // Writes the view of history.jsonl and returns its path, or null when no
  // own session is known yet: then Claude reads the real file.
  function buildView() {
    refreshFromMailbox();
    if (own.size === 0) return null;
    const stat = fs.statSync(historyPath);
    const key = `${stat.size}:${stat.mtimeMs}:${[...own].sort().join(",")}`;
    if (key === cachedKey && fs.existsSync(view)) return view;
    const text = fs.readFileSync(historyPath, "utf8");
    const tmp = `${view}.tmp`;
    fs.writeFileSync(tmp, core.ownLines(text, own), { mode: 0o600 });
    fs.renameSync(tmp, view);
    cachedKey = key;
    log(`view for ${[...own].join(",")}`);
    return view;
  }

  const realOpen = fsp.open;
  fsp.open = function open(p, flags, ...rest) {
    if (isHistory(p) && (flags === undefined || flags === "r")) {
      try {
        if (core.isUpArrowRead(new Error().stack)) {
          const target = buildView();
          if (target) return realOpen.call(this, target, flags, ...rest);
        }
      } catch (err) {
        log(`falling back to the real history: ${err && err.stack}`);
      }
    }
    return realOpen.call(this, p, flags, ...rest);
  };

  // A new session (after /clear, or before the hook has reported) becomes
  // known at its first prompt, which Claude appends here.
  const realAppendFile = fsp.appendFile;
  fsp.appendFile = function appendFile(p, data, ...rest) {
    if (isHistory(p)) {
      try {
        for (const id of core.appendedSessionIds(data)) own.add(id);
      } catch (err) {
        log(`could not read an append: ${err && err.stack}`);
      }
    }
    return realAppendFile.call(this, p, data, ...rest);
  };

  process.on("exit", () => {
    for (const file of [mailbox, view]) {
      try {
        fs.unlinkSync(file);
      } catch {
        // Already gone.
      }
    }
  });
  log(`installed, history ${historyPath}, argv ids ${[...own].join(",") || "none"}`);
}
