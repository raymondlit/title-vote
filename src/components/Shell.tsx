import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useSchool } from "@/lib/session";

export type NavItem = { to: string; label: string; permission?: string };

export function Shell({ nav, children }: { nav: NavItem[]; children: ReactNode }) {
  const { data: session } = useSession();
  const { data: school } = useSchool(session?.schoolId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const visible = nav.filter(
    (item) =>
      !item.permission ||
      session?.isSuper ||
      (session?.permissions ?? []).includes(item.permission),
  );

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="hairline-b bg-card">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-8 py-6">
          <div className="flex items-center gap-4">
            {school?.logo_url ? (
              <img src={school.logo_url} alt="校徽" className="h-8 w-auto object-contain" />
            ) : null}
            <div>
              <div className="text-[14px] tracking-[0.16em] text-foreground">
                {school?.name ?? "职称评审推荐投票平台"}
              </div>
              <div className="mt-1 text-[11px] tracking-[0.18em] text-muted-foreground">
                {session?.isJudge && !session.isAdmin && !session.isSuper
                  ? "评审投票"
                  : (school?.subtitle ?? "管理后台")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-[11px] tracking-[0.16em] text-muted-foreground">
            <span>{session?.fullName}</span>
            <button onClick={signOut} className="hover:text-foreground">
              退出
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1180px] gap-12 px-8 py-12">
        <nav className="w-40 shrink-0 space-y-1">
          {visible.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to.split("/").length <= 2 }}
              activeProps={{ className: "text-foreground border-foreground" }}
              className="block border-l border-transparent py-2 pl-4 text-[12px] tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-10">
      <h1 className="text-[16px] tracking-[0.2em] text-foreground">{title}</h1>
      {description ? (
        <p className="mt-3 text-[12px] leading-loose tracking-[0.1em] text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border bg-card p-8 ${className}`}>{children}</section>;
}
