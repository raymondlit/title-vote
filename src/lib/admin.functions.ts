import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ACCOUNT_EMAIL_DOMAIN } from "./account";

const PASSWORD_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomPassword(len = 8) {
  let out = "";
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += PASSWORD_CHARS[bytes[i]! % PASSWORD_CHARS.length];
  return out;
}

function randomSuffix(len = 4) {
  return randomPassword(len).toLowerCase();
}

async function assertSuperadmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "superadmin",
  });
  if (!data) throw new Error("没有权限执行该操作");
  return true;
}

/** 返回调用者可管理的学校 id（超级用户需显式传入 schoolId） */
async function resolveSchool(context: { supabase: any; userId: string }, schoolId?: string) {
  const { data: isSuper } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "superadmin",
  });
  if (isSuper && schoolId) return schoolId;
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("school_id")
    .eq("id", context.userId)
    .maybeSingle();
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin || !profile?.school_id) throw new Error("没有权限执行该操作");
  return profile.school_id as string;
}

export const createSchoolAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        schoolId: z.string().uuid(),
        fullName: z.string().trim().min(1).max(50),
        permissions: z.array(z.string()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: school, error: schoolErr } = await supabaseAdmin
      .from("schools")
      .select("id, slug")
      .eq("id", data.schoolId)
      .single();
    if (schoolErr || !school) throw new Error("学校不存在");

    const username = `${school.slug}_${randomSuffix(4)}`;
    const password = randomPassword(10);
    const email = `${username}@${ACCOUNT_EMAIL_DOMAIN}`;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, username },
    });
    if (error || !created.user) throw new Error(error?.message ?? "创建账号失败");
    const uid = created.user.id;

    await supabaseAdmin
      .from("profiles")
      .insert({ id: uid, school_id: school.id, full_name: data.fullName, username });
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "admin" });
    if (data.permissions.length) {
      await supabaseAdmin
        .from("admin_permissions")
        .insert(data.permissions.map((p) => ({ user_id: uid, permission: p as never })));
    }

    return { userId: uid, username, password };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "superadmin",
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!isSuper) {
      // 管理员只能重置本校用户
      const schoolId = await resolveSchool(context);
      const { data: target } = await supabaseAdmin
        .from("profiles")
        .select("school_id")
        .eq("id", data.userId)
        .maybeSingle();
      if (!target || target.school_id !== schoolId) throw new Error("没有权限执行该操作");
    }

    const password = randomPassword(10);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password });
    if (error) throw new Error(error.message);
    return { password };
  });

export const setAdminPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), permissions: z.array(z.string()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_permissions").delete().eq("user_id", data.userId);
    if (data.permissions.length) {
      await supabaseAdmin
        .from("admin_permissions")
        .insert(data.permissions.map((p) => ({ user_id: data.userId, permission: p as never })));
    }
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), isActive: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ is_active: data.isActive }).eq("id", data.userId);
    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.isActive ? "none" : "876000h",
    });
    return { ok: true };
  });

const judgeRow = z.object({
  full_name: z.string().trim().min(1).max(50),
  staff_no: z.string().trim().max(50).optional().nullable(),
  unit: z.string().trim().max(100).optional().nullable(),
  title: z.string().trim().max(50).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
});

export const importJudges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        schoolId: z.string().uuid().optional(),
        rows: z.array(judgeRow).min(1).max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const schoolId = await resolveSchool(context, data.schoolId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: school } = await supabaseAdmin
      .from("schools")
      .select("slug")
      .eq("id", schoolId)
      .single();
    const slug = school?.slug ?? "school";

    const accounts: { full_name: string; username: string; password: string }[] = [];

    for (const row of data.rows) {
      const username = `${slug}_p${randomSuffix(5)}`;
      const password = randomPassword(8);
      const email = `${username}@${ACCOUNT_EMAIL_DOMAIN}`;
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: row.full_name, username },
      });
      if (error || !created.user) continue;
      const uid = created.user.id;
      await supabaseAdmin
        .from("profiles")
        .insert({ id: uid, school_id: schoolId, full_name: row.full_name, username });
      await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "judge" });
      await supabaseAdmin.from("judges").insert({
        school_id: schoolId,
        profile_id: uid,
        full_name: row.full_name,
        staff_no: row.staff_no ?? null,
        unit: row.unit ?? null,
        title: row.title ?? null,
        phone: row.phone ?? null,
        username,
      });
      accounts.push({ full_name: row.full_name, username, password });
    }

    return { accounts, imported: accounts.length };
  });

export const deleteJudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ judgeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const schoolId = await resolveSchool(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: judge } = await supabaseAdmin
      .from("judges")
      .select("id, school_id, profile_id")
      .eq("id", data.judgeId)
      .maybeSingle();
    if (!judge || judge.school_id !== schoolId) throw new Error("没有权限执行该操作");
    await supabaseAdmin.from("judges").delete().eq("id", judge.id);
    if (judge.profile_id) {
      await supabaseAdmin.from("profiles").delete().eq("id", judge.profile_id);
      await supabaseAdmin.auth.admin.deleteUser(judge.profile_id);
    }
    return { ok: true };
  });
