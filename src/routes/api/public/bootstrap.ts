import { createFileRoute } from "@tanstack/react-router";

const SUPER_EMAIL = "icelm@sina.com";
const SUPER_PASSWORD = "65928088Lit";

async function ensureSuperadmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "superadmin")
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: true, created: false };
  }

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: SUPER_EMAIL,
    password: SUPER_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "超级管理员" },
  });

  let userId = created?.user?.id;
  if (error || !userId) {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    userId = list?.users.find((u) => u.email === SUPER_EMAIL)?.id;
    if (!userId) return { ok: false, error: error?.message ?? "无法创建超级用户" };
  }

  await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, full_name: "超级管理员", username: "icelm", school_id: null });
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "superadmin" }, { onConflict: "user_id,role" });

  return { ok: true, created: true };
}

export const Route = createFileRoute("/api/public/bootstrap")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(await ensureSuperadmin()), {
          headers: { "content-type": "application/json" },
        }),
      POST: async () =>
        new Response(JSON.stringify(await ensureSuperadmin()), {
          headers: { "content-type": "application/json" },
        }),
    },
  },
});
