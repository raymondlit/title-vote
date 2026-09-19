import type { ReactNode } from "react";

/** 统一的加载骨架 */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="hairline-t flex gap-6 py-3">
          <span className="h-3 w-24 animate-pulse bg-muted" />
          <span className="h-3 w-32 animate-pulse bg-muted" />
          <span className="h-3 w-20 animate-pulse bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** 统一的空状态 */
export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="py-10 text-center text-[12px] leading-loose tracking-[0.12em] text-muted-foreground">
      <div>{text}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** 统一的错误态 */
export function ErrorState({ text, onRetry }: { text?: string; onRetry?: () => void }) {
  return (
    <div className="py-10 text-center text-[12px] leading-loose tracking-[0.12em]">
      <div className="text-destructive">{text ?? "数据加载失败，请稍后重试。"}</div>
      {onRetry ? (
        <button className="mt-4 text-[11px] tracking-[0.2em] underline" onClick={onRetry}>
          重新加载
        </button>
      ) : null}
    </div>
  );
}

/** 按加载 / 错误 / 空 / 正常 四态渲染列表区域 */
export function DataState({
  isLoading,
  isError,
  isEmpty,
  emptyText,
  onRetry,
  skeletonRows,
  children,
}: {
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  skeletonRows?: number;
  children: ReactNode;
}) {
  if (isLoading) return <ListSkeleton rows={skeletonRows} />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (isEmpty) return <EmptyState text={emptyText ?? "暂无数据"} />;
  return <>{children}</>;
}
