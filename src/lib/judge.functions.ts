import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** 评委自助修改密码：需所在学校允许，且同步留档供管理员查看 */
export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ newPassword: z.string().min(6).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: judge } = await supabaseAdmin
      .from("judges")
      .select("id, school_id")
      .eq("profile_id", context.userId)
      .maybeSingle();
    if (!judge) throw new Error("没有权限执行该操作");

    const { data: school } = await supabaseAdmin
      .from("schools")
      .select("allow_judge_password_change")
      .eq("id", judge.school_id)
      .maybeSingle();
    if (!school?.allow_judge_password_change) throw new Error("管理员未开放自助修改密码");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("judges")
      .update({ initial_password: data.newPassword })
      .eq("id", judge.id);

    return { ok: true };
  });
