import { describe, expect, it } from "vitest";
import { paginateSlips } from "./passwordBookPdf";

describe("paginateSlips", () => {
  it("每位评委只出现一次，且顺序不变", () => {
    const list = Array.from({ length: 23 }, (_, i) => i);
    expect(paginateSlips(list).flat()).toEqual(list);
  });

  it("A4 每页放 8 张纸条，10 人分 2 页（8 + 2）", () => {
    const pages = paginateSlips(Array.from({ length: 10 }, (_, i) => i));
    expect(pages.map((p) => p.length)).toEqual([8, 2]);
  });
});
