// Run with `bun test`.
const { describe, expect, test } = require("bun:test");
const core = require("../lib/core.js");

const A = "5aff2029-a649-4944-8d06-fb2c3be6754d";
const B = "202b8122-a72c-4e86-8f23-45d0b9558f45";
const C = "94f8b1d4-8dc7-402b-8d00-12ed7bd6e624";
const record = (sessionId, display) =>
  JSON.stringify({ display, pastedContents: {}, timestamp: 1, project: "/p", sessionId });

describe("argvSessionIds", () => {
  test("takes ids from every resume and session-id spelling", () => {
    expect(core.argvSessionIds(["--resume", A])).toEqual([A]);
    expect(core.argvSessionIds(["-r", A])).toEqual([A]);
    expect(core.argvSessionIds([`--resume=${A}`])).toEqual([A]);
    expect(core.argvSessionIds(["--session-id", B, "--model", "opus"])).toEqual([B]);
  });

  test("names no id for a resume by name, the picker or --continue", () => {
    expect(core.argvSessionIds(["--resume", "my session"])).toEqual([]);
    expect(core.argvSessionIds(["--resume"])).toEqual([]);
    expect(core.argvSessionIds(["--continue"])).toEqual([]);
    expect(core.argvSessionIds([A])).toEqual([]);
  });
});

describe("mailboxSessionIds", () => {
  test("reads every hook record, including a torn last one", () => {
    const text = `{"session_id":"${A}","source":"startup"}\n\n{"session_id": "${B}","source":"clear"}\n{"session_id":"${C}`;
    expect(core.mailboxSessionIds(text)).toEqual([A, B]);
  });
});

describe("appendedSessionIds", () => {
  test("reads the session of each whole appended record", () => {
    expect(core.appendedSessionIds(`${record(A, "x")}\n${record(B, "y")}\n`)).toEqual([A, B]);
    expect(core.appendedSessionIds("")).toEqual([]);
    expect(core.appendedSessionIds('{"display":"no session"}\n{torn')).toEqual([]);
  });
});

describe("ownLines", () => {
  const file = [record(A, "mine 1"), record(C, "theirs"), "{torn", record(B, "mine after /clear"), ""].join("\n");

  test("keeps exactly the own sessions' records, in file order, whole lines", () => {
    const view = core.ownLines(file, new Set([A, B]));
    expect(view).toBe(`${record(A, "mine 1")}\n${record(B, "mine after /clear")}\n`);
  });

  test("never lets another session's record through", () => {
    for (const own of [new Set([A]), new Set([B]), new Set([A, B]), new Set()]) {
      const ids = core.appendedSessionIds(core.ownLines(file, own));
      for (const id of ids) expect(own.has(id)).toBe(true);
    }
  });

  test("an empty own set yields an empty view", () => {
    expect(core.ownLines(file, new Set())).toBe("");
  });
});

describe("isUpArrowRead", () => {
  test("filters the Up list and its counter, not Ctrl+R search", () => {
    expect(core.isUpArrowRead("at bqe\nat readLogEntries\nat readForProject")).toBe(true);
    expect(core.isUpArrowRead("at readLogEntries\nat countForProject")).toBe(true);
    expect(core.isUpArrowRead("at readLogEntries\nat readTimestamped")).toBe(false);
    expect(core.isUpArrowRead(undefined)).toBe(false);
  });
});
