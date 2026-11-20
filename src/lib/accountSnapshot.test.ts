import { describe, expect, it } from "vitest";
import { parseAccountSnapshot } from "./accountSnapshot";

const user = { id: "10000000-0000-4000-8000-000000000001", email: "test@vote.local" };
const raw = { userId: user.id, fullName: "测试管理员", username: "test", schoolId: "20000000-0000-4000-8000-000000000001", roles: ["admin"], permissions: ["judges"] };
describe("current account snapshot", () => {
  it("uses only server-returned roles and exact permissions", () => {
    expect(parseAccountSnapshot(raw, user)).toMatchObject({ isAdmin: true, isSuper: false, isJudge: false, permissions: ["judges"], schoolId: raw.schoolId });
  });
  it("rejects a snapshot belonging to another account", () => {
    expect(() => parseAccountSnapshot({ ...raw, userId: "10000000-0000-4000-8000-000000000002" }, user)).toThrow("登录账号已变化");
  });
  it("does not infer privileges for an unassigned account", () => {
    expect(parseAccountSnapshot({ ...raw, roles: [], permissions: [] }, user)).toMatchObject({ isAdmin: false, isSuper: false, isJudge: false, permissions: [] });
  });
  it("rejects malformed permission data instead of caching partial access", () => {
    expect(() => parseAccountSnapshot({ ...raw, permissions: null }, user)).toThrow();
  });
});