import { describe, expect, it } from "vitest";
import { normalizePassword, isTransientLoginError } from "./loginInput";
import { directSessionId } from "./judgeSessions";

describe("登录输入兼容", () => {
  it("全角字母数字转半角并去掉首尾空格", () => {
    expect(normalizePassword(" ａｂ１２ｃｄ３４\u200B ")).toBe("ab12cd34");
  });
  it("网络瞬断可重试，密码错误不可重试", () => {
    expect(isTransientLoginError({ name: "AuthRetryableFetchError", message: "Failed to fetch" })).toBe(true);
    expect(isTransientLoginError({ status: 400, message: "Invalid login credentials" })).toBe(false);
  });
});

describe("评委登录直达", () => {
  it("仅一场进行中且未提交时直达", () => {
    expect(directSessionId([{ id: "a", status: "open" }, { id: "b", status: "closed" }], new Set())).toBe("a");
  });
  it("已提交或多场进行中时进入列表", () => {
    expect(directSessionId([{ id: "a", status: "open" }], new Set(["a"]))).toBeNull();
    expect(directSessionId([{ id: "a", status: "open" }, { id: "b", status: "open" }], new Set())).toBeNull();
  });
});
