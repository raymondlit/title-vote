import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function JudgeReauthDialog({ open, onOpenChange, userId, email, onReady }: {
  open: boolean; onOpenChange: (open: boolean) => void; userId: string;
  email: string | null | undefined; onReady: () => void;
}) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Dialog open={open} onOpenChange={value => { if (!busy) { setPassword(""); setError(""); onOpenChange(value); } }}>
    <DialogContent className="max-w-sm">
      <DialogTitle>确认评委登录</DialogTitle>
      <DialogDescription>登录已失效，请输入原账号密码。当前选择与暂存选票均已保留，不会重复投票。</DialogDescription>
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault();
        if (busy || !email || !password) return;
        setBusy(true); setError("");
        try {
          const result = await supabase.auth.signInWithPassword({ email, password });
          if (result.error) { setError(result.error.status === 400 ? "密码不正确，请重新输入" : "暂时无法登录，请检查网络后重试"); return; }
          if (result.data.user?.id !== userId) { setError("登录账号不一致，未提交暂存选票"); return; }
          setPassword(""); onOpenChange(false); onReady();
        } catch { setError("网络不稳定，选票仍保留，请稍后重试"); }
        finally { setBusy(false); }
      }}>
        <label htmlFor="judge-renew-password" className="text-sm">原评委账号密码</label>
        <div className="relative">
          <Input id="judge-renew-password" type={visible ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" disabled={busy} className="pr-12" />
          <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" aria-label={visible ? "隐藏密码" : "显示密码"} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff /> : <Eye />}</Button>
        </div>
        {!email && <p className="text-sm text-destructive">无法读取原账号，请重新登录；暂存选票仍保留在本机。</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || !email || !password} className="w-full">{busy && <Loader2 className="animate-spin" />} {busy ? "正在确认登录" : "确认登录并继续"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}