import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { accountToEmail } from "@/lib/account";
import { fetchSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  title: string;
  subtitle?: string | null;
  logoUrl?: string | null;
  accent?: string | null;
  hint?: string;
};

export function LoginPanel({ title, subtitle, logoUrl, accent, hint }: Props) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account.trim() || !password) {
      toast.error("请输入账号与密码");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: accountToEmail(account),
      password,
    });
    if (error) {
      setLoading(false);
      toast.error("账号或密码不正确");
      return;
    }
    const session = await fetchSession();
    await queryClient.invalidateQueries({ queryKey: ["session"] });
    setLoading(false);
    if (session?.isSuper) navigate({ to: "/super" });
    else if (session?.isAdmin) navigate({ to: "/admin" });
    else {
      toast.info("评委投票端将在下一阶段开放");
      navigate({ to: "/admin" });
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
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
    </div>
  );
}
