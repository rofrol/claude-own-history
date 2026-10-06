// Pure rules of claude-own-history: which sessions a Claude process owns and
// which history lines its Up arrow may see. No I/O, so tests run anywhere.
"use strict";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Session ids named on Claude's command line (`--resume <id>`, `-r <id>`,
// `--resume=<id>`, `--session-id <id>`). A resume by name or path, or the
// interactive picker, names no id; the SessionStart hook reports those.
function argvSessionIds(argv) {
  const ids = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let value;
    const eq = arg.indexOf("=");
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (flag !== "--resume" && flag !== "-r" && flag !== "--session-id") continue;
    value = eq === -1 ? argv[i + 1] : arg.slice(eq + 1);
    if (typeof value === "string" && UUID.test(value)) ids.push(value.toLowerCase());
  }
  return ids;
}

// Session ids in the hook mailbox: each SessionStart hook appends its stdin
// JSON there. A regex instead of JSON.parse tolerates a torn last record.
function mailboxSessionIds(text) {
  const ids = [];
  const re = /"session_id"\s*:\s*"([0-9a-f-]{36})"/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (UUID.test(m[1])) ids.push(m[1].toLowerCase());
  }
  return ids;
}

// Session ids of the history records in text appended by this process.
function appendedSessionIds(text) {
  const ids = [];
  for (const line of String(text).split("\n")) {
    if (!line) continue;
    try {
      const id = JSON.parse(line).sessionId;
      if (typeof id === "string" && UUID.test(id)) ids.push(id.toLowerCase());
    } catch {
      // Not a whole record; Claude writes whole lines, so nothing is lost.
    }
  }
  return ids;
}

// The lines of history.jsonl that belong to one of the own sessions, in file
// order, each ending in a newline. A torn or foreign line is dropped.
function ownLines(text, own) {
  const kept = [];
  for (const line of text.split("\n")) {
    if (!line || !line.includes('"sessionId"')) continue;
    let id;
    try {
      id = JSON.parse(line).sessionId;
    } catch {
      continue;
    }
    if (typeof id === "string" && own.has(id.toLowerCase())) kept.push(line + "\n");
  }
  return kept.join("");
}

// Whether a stack trace comes from the Up arrow's reader (the list and its
// `History N/M` counter). Ctrl+R search (`readTimestamped`) is not one: it
// searches every session on purpose. Method names survive Claude's
// minification; if a release renames them, the filter turns off and Claude
// behaves as it does without this tool.
function isUpArrowRead(stack) {
  return /\b(readForProject|countForProject)\b/.test(String(stack));
}

module.exports = { argvSessionIds, mailboxSessionIds, appendedSessionIds, ownLines, isUpArrowRead };
