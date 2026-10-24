import { useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 删除投票记录前的密码核验弹窗：须输入当前管理员本人登录密码，
 * 并提示优先使用「归档」等可恢复的方式。
 */
export function PasswordConfirmDialog({
  open,
  onOpenChange,
  title,
  subject,
  children,
  archiveHint,
  archiveAction,
  confirmLabel = "核验密码并删除",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subject?: string | undefined;
  children?: ReactNode;
  /** 提示管理员可以改用归档管理 */
  archiveHint: ReactNode;
  /** 可选：直接改为归档 */
  archiveAction?: { label: string; onClick: () => void } | undefined;
  confirmLabel?: string;
  /** 核验失败时抛出错误，错误信息显示在密码框下方 */
  onConfirm: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPassword("");
      setShow(false);
      setError("");
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    if (busy) return;
    if (!password) {
      setError("请输入您的登录密码");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onConfirm(password);
      setPassword("");
    } catch (err) {
      setError((err as Error).message || "删除失败，请重试");
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && busy) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="rounded-none sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[14px] font-normal tracking-[0.16em]">{title}</DialogTitle>
          {subject ? (
            <DialogDescription className="text-[12px] leading-loose tracking-[0.1em]">
              「{subject}」
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="space-y-3 text-[12px] leading-loose tracking-[0.1em]">
          {children}
          <div className="hairline-t pt-3 text-muted-foreground">
            <span className="mr-2 text-foreground">建议</span>
            {archiveHint}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-2"
        >
          <Label htmlFor="pwd-confirm" className="text-[11px] tracking-[0.2em] text-muted-foreground">
            请输入您的管理员登录密码以确认删除
          </Label>
          <div className="relative">
            <Input
              id="pwd-confirm"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              aria-invalid={!!error}
              className="rounded-none pr-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "隐藏密码" : "显示密码"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-[11px] tracking-[0.1em] text-destructive">
              {error}
            </p>
          ) : null}
        </form>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="rounded-none text-[12px] tracking-[0.16em]"
          >
            取消
          </Button>
          {archiveAction ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={archiveAction.onClick}
              className="rounded-none text-[12px] tracking-[0.16em]"
            >
              {archiveAction.label}
            </Button>
          ) : null}
          <Button
            variant="destructive"
            disabled={busy || !password}
            onClick={() => void submit()}
            className="rounded-none text-[12px] tracking-[0.16em]"
          >
            {busy ? "核验中…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
