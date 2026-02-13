import { describe, expect, it } from "vitest";

import { parsePaletteCommand } from "../src/commandParser.js";

describe("command parser", () => {
  it("parses clear command", () => {
    expect(parsePaletteCommand("clear")).toEqual({ kind: "clear" });
  });

  it("parses copy and delete commands with indexes", () => {
    expect(parsePaletteCommand("copy 11")).toEqual({ kind: "copy", index: 11 });
    expect(parsePaletteCommand("delete 2")).toEqual({ kind: "delete", index: 2 });
  });

  it("parses add command with unquoted and quoted text", () => {
    expect(parsePaletteCommand("add hello world")).toEqual({
      kind: "add",
      text: "hello world"
    });
    expect(parsePaletteCommand('add "hello world"')).toEqual({
      kind: "add",
      text: "hello world"
    });
    expect(parsePaletteCommand("add 'hello   world'")).toEqual({
      kind: "add",
      text: "hello   world"
    });
  });

  it("supports escaped quotes inside quoted strings", () => {
    expect(parsePaletteCommand('add "say \\"hi\\""')).toEqual({
      kind: "add",
      text: 'say "hi"'
    });
  });

  it("returns invalid command details for malformed input", () => {
    const emptyResult = parsePaletteCommand("   ");
    const unknownResult = parsePaletteCommand("noop 1");
    const unterminatedResult = parsePaletteCommand('add "missing');
    const badCopyResult = parsePaletteCommand("copy zero");

    expect(emptyResult.kind).toBe("invalid");
    expect(unknownResult.kind).toBe("invalid");
    expect(unterminatedResult.kind).toBe("invalid");
    expect(badCopyResult.kind).toBe("invalid");
  });
});
