import { z } from "zod";

const accountSnapshotSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  username: z.string().nullable(),
  schoolId: z.string().uuid().nullable(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});

/** The snapshot is server-read, never reconstructed from editable user metadata. */
export function parseAccountSnapshot(raw: unknown, user: { id: string; email?: string | null }) {
  const snapshot = accountSnapshotSchema.parse(raw);
  if (snapshot.userId !== user.id) throw new Error("登录账号已变化，请重新登录");
  return {
    ...snapshot,
    email: user.email ?? null,
    isSuper: snapshot.roles.includes("superadmin"),
    isAdmin: snapshot.roles.includes("admin"),
    isJudge: snapshot.roles.includes("judge"),
  };
}