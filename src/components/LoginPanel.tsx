import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { accountToEmail, normalizeAccount } from "@/lib/account";
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

type Stage = "idle" | "verifying" | "retrying" | "entering";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "登 录",
  verifying: "正在验证身份",
  retrying: "登录人数较多，正在重试",
  entering: "验证通过，正在进入",
};

function isBusyError(error: { status?: number | undefined; message?: string | undefined }) {
  return error.status === 429 || /rate limit/i.test(error.message ?? "");
}

export function LoginPanel({ title, subtitle, logoUrl, accent, hint, appearance }: Props) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [fieldError, setFieldError] = useState<{ field: "account" | "password"; text: string } | null>(
    null,
  );
  const accountRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const loading = stage !== "idle";

  // 进入登录页即在后台预加载后台与投票页代码，点击登录后无需再等待下载
  useEffect(() => {
    const t = window.setTimeout(() => {
      void router.preloadRoute({ to: "/admin" }).catch(() => {});
      void router.preloadRoute({ to: "/vote" }).catch(() => {});
    }, 300);
    return () => window.clearTimeout(t);
  }, [router]);

  function failOnPassword(text: string) {
    setStage("idle");
    setFieldError({ field: "password", text });
    // 方便直接重新输入：聚焦并全选密码
    requestAnimationFrame(() => {
      passwordRef.current?.focus();
      passwordRef.current?.select();
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const cleanAccount = normalizeAccount(account);
    if (cleanAccount !== account) setAccount(cleanAccount);
    if (!cleanAccount) {
      setFieldError({ field: "account", text: "请输入账号" });
      accountRef.current?.focus();
      return;
    }
    if (!password) {
      setFieldError({ field: "password", text: "请输入密码" });
      passwordRef.current?.focus();
      return;
    }
    setFieldError(null);
    setStage("verifying");

    // 直接登录：新会话会覆盖本机旧会话，不再先注销（省去一次网络往返）。
    // 多人同时登录时可能被登录频次限制挡下，自动错峰重试。
    const email = accountToEmail(cleanAccount);
    let result: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>> | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      result = await supabase.auth.signInWithPassword({ email, password });
      if (!result.error || !isBusyError(result.error)) break;
      setStage("retrying");
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1) + Math.random() * 600));
    }

    const error = result?.error ?? null;
    const user = result?.data.user ?? null;
    if (error || !user) {
      if (error && isBusyError(error)) {
        setStage("idle");
        toast.error("当前登录人数过多，请稍等十几秒后重试");
      } else if (error && /network|fetch/i.test(error.message ?? "")) {
        setStage("idle");
        toast.error("网络连接异常，请检查网络后重试");
      } else {
        failOnPassword("账号或密码不正确，请核对后重新输入");
      }
      return;
    }

    setStage("entering");
    // 切换账号：清空上一个账号留下的缓存，避免数据串号
    await queryClient.cancelQueries();
    queryClient.clear();
    // 复用登录返回的用户，直接并行读取角色与权限
    const session = await fetchSession(user).catch(() => null);
    queryClient.setQueryData(["session"], session);
    if (session?.isSuper) navigate({ to: "/super" });
    else if (session?.isAdmin) navigate({ to: "/admin" });
    else if (session?.isJudge) navigate({ to: "/vote" });
    else {
      setStage("idle");
      toast.error(session ? "该账号尚未分配权限，请联系管理员" : "读取账号信息失败，请重试");
    }
  }

  const underline = (field: "account" | "password") =>
    `pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left transition-transform duration-300 ease-out ${
      fieldError?.field === field
        ? "scale-x-100 bg-destructive"
        : "scale-x-0 bg-foreground group-focus-within:scale-x-100"
    }`;

  const labelClass =
    "text-[11px] tracking-[0.2em] text-muted-foreground transition-colors duration-300 group-focus-within:text-foreground";

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

        <form onSubmit={handleSubmit} className="space-y-8" noValidate>
          <div className="group space-y-2">
            <Label htmlFor="account" className={labelClass}>
              账号
            </Label>
            <div className="relative">
              <Input
                id="account"
                ref={accountRef}
                value={account}
                autoFocus
                disabled={loading}
                onChange={(e) => {
                  setAccount(normalizeAccount(e.target.value));
                  if (fieldError?.field === "account") setFieldError(null);
                }}
                onKeyDown={(e) => {
                  // 账号输完按回车直接跳到密码框
                  if (e.key === "Enter" && !password) {
                    e.preventDefault();
                    passwordRef.current?.focus();
                  }
                }}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="用户名或邮箱"
                aria-invalid={fieldError?.field === "account"}
                className="h-11 rounded-none border-0 border-b bg-transparent px-0 text-[14px] tracking-[0.06em] shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
              />
              <span aria-hidden className={underline("account")} />
            </div>
            {fieldError?.field === "account" ? (
              <p role="alert" className="text-[11px] tracking-[0.1em] text-destructive">
                {fieldError.text}
              </p>
            ) : null}
          </div>

          <div className="group space-y-2">
            <Label htmlFor="password" className={labelClass}>
              密码
            </Label>
            <div className="relative">
              <Input
                id="password"
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                value={password}
                disabled={loading}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldError?.field === "password") setFieldError(null);
                }}
                onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                onBlur={() => setCapsLock(false)}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={fieldError?.field === "password"}
                className="h-11 rounded-none border-0 border-b bg-transparent px-0 pr-9 text-[14px] tracking-[0.06em] shadow-none focus-visible:ring-0"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setShowPassword((v) => !v);
                  passwordRef.current?.focus();
                }}
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                title={showPassword ? "隐藏密码" : "显示密码"}
                className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" strokeWidth={1.4} />
                ) : (
                  <Eye className="h-4 w-4" strokeWidth={1.4} />
                )}
              </button>
              <span aria-hidden className={underline("password")} />
            </div>
            {fieldError?.field === "password" ? (
              <p role="alert" className="text-[11px] tracking-[0.1em] text-destructive">
                {fieldError.text}
              </p>
            ) : capsLock ? (
              <p className="text-[11px] tracking-[0.1em] text-muted-foreground">
                大写锁定已开启
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="h-11 w-full rounded-none text-[12px] tracking-[0.3em] disabled:opacity-90"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.6} /> : null}
            <span>{STAGE_LABEL[stage]}</span>
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
