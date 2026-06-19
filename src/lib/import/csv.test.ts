import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/import/csv";

describe("parseCsv", () => {
  it("parses a simple header + rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n4,5,6")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted fields with embedded commas", () => {
    expect(parseCsv('x,y\n"Washing machine Nov, Dec, Jan",1400')).toEqual([
      ["x", "y"],
      ["Washing machine Nov, Dec, Jan", "1400"],
    ]);
  });

  it("handles escaped quotes inside a quoted field", () => {
    expect(parseCsv('a\n"She said ""hi"""')).toEqual([
      ["a"],
      ['She said "hi"'],
    ]);
  });

  it("handles newlines inside quoted fields", () => {
    expect(parseCsv('a,b\n"line1\nline2",2')).toEqual([
      ["a", "b"],
      ["line1\nline2", "2"],
    ]);
  });

  it("handles CRLF line endings and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a leading BOM", () => {
    expect(parseCsv("﻿a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserves empty trailing cells", () => {
    expect(parseCsv("a,b,c\n1,,")).toEqual([
      ["a", "b", "c"],
      ["1", "", ""],
    ]);
  });

  it("returns [] for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
