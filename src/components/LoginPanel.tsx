import { useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { accountToEmail } from "@/lib/account";
import { fetchSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SchoolAppearance, type SchoolAppearanceSettings } from "@/components/SchoolAppearance";

type Props = {
  title: string;
  subtitle?: string | null;
  logoUrl?: string | null;
  accent?: string | null;
  hint?: string;
  appearance?: SchoolAppearanceSettings | null | undefined;
};

export function LoginPanel({ title, subtitle, logoUrl, accent, hint, appearance }: Props) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account.trim() || !password) {
      toast.error("请输入账号与密码");
      return;
    }
    setLoading(true);
    // 登录期间并行预加载后台与投票页面代码，登录完成即可瞬间进入
    void router.preloadRoute({ to: "/admin" }).catch(() => {});
    void router.preloadRoute({ to: "/vote" }).catch(() => {});
    // 切换账号：先彻底清空上一个账号的会话与缓存，避免数据串号
    await queryClient.cancelQueries();
    queryClient.clear();
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // 忽略
      }
    }
    // 多人同时登录时可能被登录频次限制挡下，自动错峰重试，避免评委反复手动点击
    const email = accountToEmail(account);
    let error: { status?: number | undefined; message?: string | undefined } | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await supabase.auth.signInWithPassword({ email, password });
      error = res.error;
      if (!error) break;
      const busy = error.status === 429 || /rate limit/i.test(error.message ?? "");
      if (!busy) break;
      if (attempt === 0) toast.info("同时登录人数较多，正在为你重试…");
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 1200));
    }
    if (error) {
      setLoading(false);
      const busy = error.status === 429 || /rate limit/i.test(error.message ?? "");
      toast.error(busy ? "当前登录人数过多，请稍等十几秒后重试" : "账号或密码不正确");
      return;
    }
    const session = await fetchSession();
    // 直接写入缓存，避免登录后重复拉取一次会话
    queryClient.setQueryData(["session"], session);
    if (session?.isSuper) navigate({ to: "/super" });
    else if (session?.isAdmin) navigate({ to: "/admin" });
    else if (session?.isJudge) navigate({ to: "/vote" });
    else {
      setLoading(false);
      toast.error("该账号尚未分配权限，请联系管理员");
    }
  }

  return (
    <SchoolAppearance
      settings={appearance}
      className="flex flex-col items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-[380px]">
        <div className="mb-14 flex flex-col items-center text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={`${title} 标识`} className="mb-7 h-14 w-auto object-contain" />
          ) : (
            <div
              className="mb-7 h-px w-10"
              style={{ backgroundColor: accent ?? "var(--color-foreground)" }}
            />
          )}
          <h1 className="text-[17px] leading-relaxed tracking-[0.2em] text-foreground">{title}</h1>
          {subtitle ? (
            <p className="mt-3 text-[12px] tracking-[0.18em] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-2">
            <Label htmlFor="account" className="text-[11px] tracking-[0.2em] text-muted-foreground">
              账号
            </Label>
            <Input
              id="account"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
              className="rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="password"
              className="text-[11px] tracking-[0.2em] text-muted-foreground"
            >
              密码
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-none text-[12px] tracking-[0.3em]"
          >
            {loading ? "登录中" : "登 录"}
          </Button>
        </form>

        {hint ? (
          <p className="mt-12 text-center text-[11px] leading-loose tracking-[0.12em] text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </SchoolAppearance>
  );
}
