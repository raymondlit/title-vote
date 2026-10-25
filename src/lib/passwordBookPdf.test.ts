import { describe, expect, it } from "vitest";
import { paginateSlips } from "./passwordBookPdf";

describe("paginateSlips", () => {
  it("每位评委只出现一次，且顺序不变", () => {
    const list = Array.from({ length: 23 }, (_, i) => i);
    expect(paginateSlips(list).flat()).toEqual(list);
  });

  it("首页留出标题区，比后续页少放纸条", () => {
    const pages = paginateSlips(Array.from({ length: 40 }, (_, i) => i));
    expect(pages[0].length).toBe(7);
    expect(pages[1].length).toBe(8);
  });

  it("10 人分 2 页", () => {
    expect(paginateSlips(Array.from({ length: 10 }, (_, i) => i)).length).toBe(2);
  });
});
