import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageTitle, Panel } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession, useSchool } from "@/lib/session";
import { changeMyPassword } from "@/lib/judge.functions";

export const Route = createFileRoute("/_authenticated/vote/password")({
  head: () => ({
    meta: [
      { title: "修改密码 — 职称评审推荐投票平台" },
      { name: "description", content: "评委自助修改登录密码。" },
      { property: "og:title", content: "修改密码 — 职称评审推荐投票平台" },
      { property: "og:description", content: "评委自助修改登录密码。" },
    ],
  }),
  component: PasswordPage,
});

function PasswordPage() {
  const session = useSession();
  const school = useSchool(session.data?.schoolId);
  const changeFn = useServerFn(changeMyPassword);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [busy, setBusy] = useState(false);

  const allowed = !!school.data?.allow_judge_password_change;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 6) {
      toast.error("密码至少 6 位");
      return;
    }
    if (pwd !== pwd2) {
      toast.error("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      await changeFn({ data: { newPassword: pwd } });
      setPwd("");
      setPwd2("");
      toast.success("密码已修改");
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-10">
      <PageTitle title="修改密码" subtitle="更换本人登录密码" />
      <Panel>
        {!allowed ? (
          <p className="text-[12px] tracking-[0.12em] text-muted-foreground">
            管理员未开放自助修改密码，如需更换请联系管理员。
          </p>
        ) : (
          <form onSubmit={submit} className="max-w-[320px] space-y-8">
            <div className="space-y-2">
              <Label htmlFor="pwd" className="text-[11px] tracking-[0.2em] text-muted-foreground">
                新密码
              </Label>
              <Input
                id="pwd"
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className="rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pwd2" className="text-[11px] tracking-[0.2em] text-muted-foreground">
                确认新密码
              </Label>
              <Input
                id="pwd2"
                type="password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                className="rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="h-10 rounded-none px-8 text-[12px] tracking-[0.3em]"
            >
              {busy ? "保存中" : "保 存"}
            </Button>
          </form>
        )}
      </Panel>
    </div>
  );
}
