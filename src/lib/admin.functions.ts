import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ACCOUNT_EMAIL_DOMAIN } from "./account";

const PASSWORD_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const CHARSETS: Record<string, string> = {
  digits: "23456789",
  letters: "abcdefghijkmnpqrstuvwxyz",
  letters_mixed: "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ",
  alnum: "abcdefghijkmnpqrstuvwxyz23456789",
  alnum_mixed: PASSWORD_CHARS,
  full: PASSWORD_CHARS + "!@#$%*?",
};

function pick(chars: string, len: number) {
  let out = "";
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += chars[bytes[i]! % chars.length];
  return out;
}

function randomPassword(len = 8) {
  return pick(PASSWORD_CHARS, len);
}

type PasswordPolicy = { length: number; charset: string };

async function getPasswordPolicy(admin: any, schoolId: string): Promise<PasswordPolicy> {
  const { data } = await admin
    .from("schools")
    .select("judge_password_length, judge_password_charset")
    .eq("id", schoolId)
    .maybeSingle();
  const length = Math.min(32, Math.max(4, Number(data?.judge_password_length ?? 8)));
  const charset = CHARSETS[data?.judge_password_charset as string] ? data.judge_password_charset : "alnum_mixed";
  return { length, charset };
}

function policyPassword(policy: PasswordPolicy) {
  return pick(CHARSETS[policy.charset] ?? PASSWORD_CHARS, policy.length);
}

function randomSuffix(len = 4) {
  return randomPassword(len).toLowerCase();
}


async function assertSuperadmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", context.userId)
    .eq("role", "superadmin")
    .maybeSingle();
  if (!data) throw new Error("没有权限执行该操作");
  return true;
}

/** 返回调用者可管理的学校 id（超级用户需显式传入 schoolId） */
async function resolveSchool(context: { supabase: any; userId: string }, schoolId?: string) {
  const { data: superRole } = await context.supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", context.userId)
    .eq("role", "superadmin")
    .maybeSingle();
  if (superRole && schoolId) return schoolId;
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("school_id")
    .eq("id", context.userId)
    .maybeSingle();
  const { data: adminRole } = await context.supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!adminRole || !profile?.school_id) throw new Error("没有权限执行该操作");
  return profile.school_id as string;
}

export const deleteSchoolAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    if (data.userId === context.userId) throw new Error("不能删除自己的账号");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, school_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (!profile || !profile.school_id) throw new Error("该账号不存在或不是高校管理员");

    const { data: judge } = await supabaseAdmin
      .from("judges")
      .select("id")
      .eq("profile_id", data.userId)
      .maybeSingle();
    if (judge) throw new Error("该账号为评委账号，请在评委管理页删除");

    await supabaseAdmin.from("admin_credentials").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("admin_permissions").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

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
    await supabaseAdmin.from("admin_credentials").insert({ user_id: uid, current_password: password });
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
    const { data: superRole } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("user_id", context.userId)
      .eq("role", "superadmin")
      .maybeSingle();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!superRole) {
      // 管理员只能重置本校用户
      const schoolId = await resolveSchool(context);
      const { data: target } = await supabaseAdmin
        .from("profiles")
        .select("school_id")
        .eq("id", data.userId)
        .maybeSingle();
      if (!target || target.school_id !== schoolId) throw new Error("没有权限执行该操作");
    }

    const { data: judge } = await supabaseAdmin
      .from("judges")
      .select("id, school_id")
      .eq("profile_id", data.userId)
      .maybeSingle();
    const password = judge
      ? policyPassword(await getPasswordPolicy(supabaseAdmin, judge.school_id))
      : randomPassword(10);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password });
    if (error) throw new Error(error.message);
    if (judge) {
      const { error: credentialError } = await supabaseAdmin
        .from("judge_credentials")
        .upsert({ judge_id: judge.id, current_password: password, updated_at: new Date().toISOString() });
      if (credentialError) throw new Error("保存新密码失败");
    } else {
      await supabaseAdmin
        .from("admin_credentials")
        .upsert({ user_id: data.userId, current_password: password, updated_at: new Date().toISOString() });
    }

    return { password };
  });

export const getAdminPasswords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("admin_credentials").select("user_id, current_password");
    return {
      entries: (data ?? []).map((r) => ({ user_id: r.user_id, password: r.current_password })),
    };
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
    const policy = await getPasswordPolicy(supabaseAdmin, schoolId);

    for (const row of data.rows) {
      const username = `${slug}_p${randomSuffix(5)}`;
      const password = policyPassword(policy);

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
      const { data: judge, error: judgeError } = await supabaseAdmin.from("judges").insert({
        school_id: schoolId,
        profile_id: uid,
        full_name: row.full_name,
        staff_no: row.staff_no ?? null,
        unit: row.unit ?? null,
        title: row.title ?? null,
        phone: row.phone ?? null,
        username,
      }).select("id").single();
      if (judgeError || !judge) {
        await supabaseAdmin.auth.admin.deleteUser(uid);
        continue;
      }
      const { error: credentialError } = await supabaseAdmin.from("judge_credentials").insert({
        judge_id: judge.id,
        current_password: password,
      });
      if (credentialError) {
        await supabaseAdmin.from("judges").delete().eq("id", judge.id);
        await supabaseAdmin.auth.admin.deleteUser(uid);
        continue;
      }
      accounts.push({ full_name: row.full_name, username, password });
    }

    return { accounts, imported: accounts.length };
  });

export const createJudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        schoolId: z.string().uuid().optional(),
        full_name: z.string().trim().min(1).max(50),
        staff_no: z.string().trim().max(50).optional().nullable(),
        unit: z.string().trim().max(100).optional().nullable(),
        title: z.string().trim().max(50).optional().nullable(),
        phone: z.string().trim().max(30).optional().nullable(),
        group_id: z.string().uuid().optional().nullable(),
        committee_role: z.enum(["chair", "vice_chair", "member"]).default("member"),
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

    const username = `${slug}_p${randomSuffix(5)}`;
    const password = policyPassword(await getPasswordPolicy(supabaseAdmin, schoolId));
    const email = `${username}@${ACCOUNT_EMAIL_DOMAIN}`;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, username },
    });
    if (error || !created.user) throw new Error(error?.message ?? "创建账号失败");
    const uid = created.user.id;
    await supabaseAdmin
      .from("profiles")
      .insert({ id: uid, school_id: schoolId, full_name: data.full_name, username });
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "judge" });
    const { data: judge, error: judgeError } = await supabaseAdmin.from("judges").insert({
      school_id: schoolId,
      profile_id: uid,
      full_name: data.full_name,
      staff_no: data.staff_no ?? null,
      unit: data.unit ?? null,
      title: data.title ?? null,
      phone: data.phone ?? null,
      username,
      group_id: data.group_id ?? null,
      committee_role: data.committee_role,
    }).select("id").single();
    if (judgeError || !judge) throw new Error(judgeError?.message ?? "创建评委失败");
    const { error: credentialError } = await supabaseAdmin.from("judge_credentials").insert({
      judge_id: judge.id,
      current_password: password,
    });
    if (credentialError) throw new Error("保存评委凭证失败");
    return { username, password, full_name: data.full_name };
  });

export const deleteSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ schoolId: z.string().uuid(), force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const checks: [string, string][] = [
      ["judges", "评委"],
      ["candidates", "评审对象"],
      ["vote_sessions", "投票场次"],
      ["subject_groups", "学科小组"],
      ["review_categories", "评审类别"],
    ];
    if (!data.force) {
      const blocking: string[] = [];
      for (const [table, label] of checks) {
        const { count } = await supabaseAdmin
          .from(table as never)
          .select("id", { count: "exact", head: true })
          .eq("school_id", data.schoolId);
        if ((count ?? 0) > 0) blocking.push(label);
      }
      if (blocking.length > 0) return { ok: false as const, blocking };
    } else {
      // 先删依赖数据（投票记录 → 场次 → 其他）
      const { data: sessions } = await supabaseAdmin
        .from("vote_sessions")
        .select("id")
        .eq("school_id", data.schoolId);
      for (const s of sessions ?? []) {
        const { data: ballots } = await supabaseAdmin
          .from("ballots")
          .select("id")
          .eq("session_id", s.id);
        for (const b of ballots ?? []) {
          await supabaseAdmin.from("ballot_items").delete().eq("ballot_id", b.id);
        }
        await supabaseAdmin.from("ballots").delete().eq("session_id", s.id);
      }
      await supabaseAdmin.from("vote_sessions").delete().eq("school_id", data.schoolId);
      await supabaseAdmin.from("candidates").delete().eq("school_id", data.schoolId);
      await supabaseAdmin.from("voting_rules").delete().eq("school_id", data.schoolId);

      const { data: judges } = await supabaseAdmin
        .from("judges")
        .select("id, profile_id")
        .eq("school_id", data.schoolId);
      await supabaseAdmin.from("judges").delete().eq("school_id", data.schoolId);
      for (const j of judges ?? []) {
        if (!j.profile_id) continue;
        await supabaseAdmin.from("user_roles").delete().eq("user_id", j.profile_id);
        await supabaseAdmin.from("profiles").delete().eq("id", j.profile_id);
        await supabaseAdmin.auth.admin.deleteUser(j.profile_id);
      }
      await supabaseAdmin.from("subject_groups").delete().eq("school_id", data.schoolId);
      await supabaseAdmin.from("review_categories").delete().eq("school_id", data.schoolId);
    }

    // 删除该校管理员账号
    const { data: admins } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("school_id", data.schoolId);
    for (const a of admins ?? []) {
      await supabaseAdmin.from("admin_permissions").delete().eq("user_id", a.id);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", a.id);
      await supabaseAdmin.from("profiles").delete().eq("id", a.id);
      await supabaseAdmin.auth.admin.deleteUser(a.id);
    }

    const { error } = await supabaseAdmin.from("schools").delete().eq("id", data.schoolId);
    if (error) throw new Error(error.message);
    return { ok: true as const, blocking: [] as string[] };
  });


export const getJudgePasswordBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ judgeIds: z.array(z.string().uuid()).min(1).max(300) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const schoolId = await resolveSchool(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("judges")
      .select("id, full_name, username")
      .eq("school_id", schoolId)
      .in("id", data.judgeIds)
      .order("created_at");
    if (error) throw new Error(error.message);
    const { data: credentials, error: credentialError } = await supabaseAdmin
      .from("judge_credentials")
      .select("judge_id, current_password")
      .in("judge_id", (rows ?? []).map((row) => row.id));
    if (credentialError) throw new Error("读取评委凭证失败");
    const passwords = new Map((credentials ?? []).map((row) => [row.judge_id, row.current_password]));
    return {
      entries: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        full_name: r.full_name as string,
        username: r.username as string,
        password: passwords.get(r.id) ?? null,
      })),
    };
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

/** 删除投票场次：须本校管理员输入本人登录密码，服务端核验后连同全部选票一并删除 */
export const deleteVoteSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        password: z.string().min(1, "请输入登录密码").max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: vs } = await supabaseAdmin
      .from("vote_sessions")
      .select("id, school_id, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!vs) throw new Error("投票场次不存在或已删除");
    const schoolId = await resolveSchool(context, vs.school_id);
    if (schoolId !== vs.school_id) throw new Error("没有权限执行该操作");
    if (vs.status === "open") throw new Error("投票进行中，请先结束投票再删除");

    // 核验本人登录密码
    const { data: me } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = me?.user?.email;
    if (!email) throw new Error("无法核验当前账号");
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const { createClient } = await import("@supabase/supabase-js");
    const verifier = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: signIn, error: signInError } = await verifier.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (signInError || signIn.user?.id !== context.userId) {
      throw new Error("密码不正确，未删除");
    }
    await verifier.auth.signOut({ scope: "local" });

    const { count } = await supabaseAdmin
      .from("ballots")
      .select("id", { count: "exact", head: true })
      .eq("session_id", vs.id);

    // 选票及选票明细随场次级联删除
    const { error } = await supabaseAdmin
      .from("vote_sessions")
      .delete()
      .eq("id", vs.id)
      .eq("school_id", vs.school_id);
    if (error) throw new Error(error.message);
    return { ok: true as const, ballots: count ?? 0 };
  });
