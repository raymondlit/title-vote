import { describe, expect, it } from "vitest";
import { paginateLines, type ListLine } from "./judgeListPdf";

const row = (no: number): ListLine => ({ kind: "row", no, name: "张", unit: "", title: "", votes: "" });

describe("paginateLines", () => {
  it("所有人都在且顺序不变", () => {
    const lines = Array.from({ length: 80 }, (_, i) => row(i + 1));
    const pages = paginateLines(lines);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat()).toEqual(lines);
  });

  it("组标题不会落在页末", () => {
    const lines: ListLine[] = [];
    let no = 1;
    for (let g = 0; g < 6; g++) {
      lines.push({ kind: "group", label: `组${g}` });
      for (let k = 0; k < 7; k++) lines.push(row(no++));
    }
    for (const page of paginateLines(lines)) {
      expect(page[page.length - 1]?.kind).toBe("row");
    }
  });
});
