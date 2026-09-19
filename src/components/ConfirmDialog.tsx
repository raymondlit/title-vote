import { useCallback, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/**
 * 统一确认弹窗：替代浏览器原生 confirm。
 * const { confirm, dialog } = useConfirm();
 * if (await confirm({ title: "确定删除？" })) { ... }
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const dialog = (
    <AlertDialog open={open} onOpenChange={(next) => (next ? setOpen(true) : settle(false))}>
      <AlertDialogContent className="rounded-none">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[14px] font-normal tracking-[0.16em]">
            {options?.title ?? "请确认"}
          </AlertDialogTitle>
          {options?.description ? (
            <AlertDialogDescription className="text-[12px] leading-loose tracking-[0.1em]">
              {options.description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="rounded-none text-[12px] tracking-[0.16em]"
            onClick={() => settle(false)}
          >
            {options?.cancelLabel ?? "取消"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={`rounded-none text-[12px] tracking-[0.16em] ${
              options?.destructive ? "bg-destructive text-destructive-foreground" : ""
            }`}
            onClick={() => settle(true)}
          >
            {options?.confirmLabel ?? "确定"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}
