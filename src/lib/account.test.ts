import { describe, expect, it } from "vitest";
import { accountToEmail, normalizeAccount } from "./account";

describe("normalizeAccount", () => {
  it("removes leading, trailing and full-width spaces from pasted accounts", () => {
    expect(normalizeAccount("  lit_gk8z\u3000\n")).toBe("lit_gk8z");
  });

  it("converts full-width letters, digits and symbols to half-width", () => {
    expect(normalizeAccount("ｌｉｔ＿ｇｋ８ｚ")).toBe("lit_gk8z");
    expect(normalizeAccount("icelm＠sina.com")).toBe("icelm@sina.com");
  });
});

describe("accountToEmail", () => {
  it("maps a username to the internal login address", () => {
    expect(accountToEmail(" LIT_gk8z ")).toBe("lit_gk8z@vote.local");
  });

  it("keeps an email account as a lowercase email", () => {
    expect(accountToEmail("Icelm@Sina.com")).toBe("icelm@sina.com");
  });
});
