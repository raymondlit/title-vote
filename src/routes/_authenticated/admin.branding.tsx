import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, PageTitle, Panel } from "@/components/Shell";
import { ADMIN_NAV } from "@/components/adminNav";
import { useSession, useSchool } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/branding")({
  head: () => ({
    meta: [
      { title: "界面配置 — 职称评审推荐投票平台" },
      { name: "description", content: "设置学校名称、校徽与强调色，登录页与评委端同步生效。" },
      { property: "og:title", content: "界面配置 — 职称评审推荐投票平台" },
      {
        property: "og:description",
        content: "设置学校名称、校徽与强调色，登录页与评委端同步生效。",
      },
    ],
  }),
  component: BrandingPage,
});

function BrandingPage() {
  const { data: session } = useSession();
  const { data: school } = useSchool(session?.schoolId);
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [accent, setAccent] = useState("#3f4a52");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!school) return;
    setName(school.name);
    setSubtitle(school.subtitle ?? "");
    setAccent(school.accent_color);
    setLogoUrl(school.logo_url);
  }, [school]);

  async function uploadLogo(file: File) {
    if (!school) return;
    const path = `${school.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "")}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    if (error) {
      toast.error("上传失败：" + error.message);
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
    toast.success("校徽已上传，别忘了保存");
  }

  async function save() {
    if (!school) return;
    setSaving(true);
    const { error } = await supabase
      .from("schools")
      .update({
        name: name.trim(),
        subtitle: subtitle.trim() || null,
        accent_color: accent,
        logo_url: logoUrl,
      })
      .eq("id", school.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已保存");
    queryClient.invalidateQueries({ queryKey: ["school"] });
  }

  return (
    <Shell nav={ADMIN_NAV}>
      <PageTitle
        title="界面配置"
        description="这里的设置会同步应用到本校的登录页与评委投票端。"
      />

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <Panel>
          <div className="space-y-8">
            <div className="space-y-2">
              <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">学校名称</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">副标题</Label>
              <Input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="如：2026 年度职称评审推荐投票"
                className="rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">强调色</Label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-9 w-14 border bg-transparent"
                />
                <span className="text-[12px] tracking-[0.1em] text-muted-foreground">{accent}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">校徽</Label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadLogo(file);
                }}
                className="block text-[12px] text-muted-foreground"
              />
            </div>
            <Button
              onClick={save}
              disabled={saving}
              className="h-10 rounded-none px-8 text-[12px] tracking-[0.2em]"
            >
              保存
            </Button>
            {school ? (
              <p className="text-[11px] tracking-[0.14em] text-muted-foreground">
                本校登录页地址：/school/{school.slug}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel className="h-fit">
          <div className="mb-6 text-[11px] tracking-[0.2em] text-muted-foreground">登录页预览</div>
          <div className="flex flex-col items-center border bg-background px-6 py-14 text-center">
            {logoUrl ? (
              <img src={logoUrl} alt="校徽预览" className="mb-6 h-12 w-auto object-contain" />
            ) : (
              <div className="mb-6 h-px w-8" style={{ backgroundColor: accent }} />
            )}
            <div className="text-[13px] tracking-[0.2em]">{name || "学校名称"}</div>
            {subtitle ? (
              <div className="mt-2 text-[11px] tracking-[0.18em] text-muted-foreground">
                {subtitle}
              </div>
            ) : null}
            <div className="mt-10 w-full space-y-4">
              <div className="hairline-b h-7" />
              <div className="hairline-b h-7" />
              <div
                className="h-9 w-full"
                style={{ backgroundColor: accent }}
                aria-hidden="true"
              />
            </div>
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
