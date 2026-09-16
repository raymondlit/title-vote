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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SchoolAppearance } from "@/components/SchoolAppearance";

const OPTIONS = {
  fontFamily: [
    ["noto", "思源黑体"],
    ["system", "系统黑体"],
    ["serif", "宋体"],
  ],
  fontScale: [
    ["small", "小"],
    ["standard", "标准"],
    ["large", "大"],
  ],
  colorScheme: [
    ["minimal", "墨灰"],
    ["ocean", "深海蓝"],
    ["forest", "松柏绿"],
    ["burgundy", "绛红"],
    ["custom", "自定义"],
  ],
  displayMode: [
    ["light", "浅色"],
    ["dark", "深色"],
    ["system", "跟随系统"],
  ],
  layoutDensity: [
    ["compact", "紧凑"],
    ["standard", "标准"],
    ["spacious", "宽松"],
  ],
} as const;

function AppearanceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-none border-0 border-b bg-transparent px-0 shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

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
  const [fontFamily, setFontFamily] = useState("noto");
  const [fontScale, setFontScale] = useState("standard");
  const [colorScheme, setColorScheme] = useState("minimal");
  const [displayMode, setDisplayMode] = useState("light");
  const [layoutDensity, setLayoutDensity] = useState("standard");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!school) return;
    setName(school.name);
    setSubtitle(school.subtitle ?? "");
    setAccent(school.accent_color);
    setLogoUrl(school.logo_url);
    setFontFamily(school.font_family);
    setFontScale(school.font_scale);
    setColorScheme(school.color_scheme);
    setDisplayMode(school.display_mode);
    setLayoutDensity(school.layout_density);
  }, [school]);

  async function uploadLogo(file: File) {
    if (file.size > 300 * 1024) {
      toast.error("图片请控制在 300KB 以内");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoUrl(String(reader.result));
      toast.success("校徽已载入，别忘了保存");
    };
    reader.readAsDataURL(file);
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
        font_family: fontFamily,
        font_scale: fontScale,
        color_scheme: colorScheme,
        display_mode: displayMode,
        layout_density: layoutDensity,
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

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
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
            <div className="hairline-t pt-8">
              <div className="mb-6 text-[11px] tracking-[0.2em] text-muted-foreground">显示设置</div>
              <div className="grid gap-7 sm:grid-cols-2">
                <AppearanceSelect label="系统字体" value={fontFamily} options={OPTIONS.fontFamily} onChange={setFontFamily} />
                <AppearanceSelect label="字号" value={fontScale} options={OPTIONS.fontScale} onChange={setFontScale} />
                <AppearanceSelect label="配色方案" value={colorScheme} options={OPTIONS.colorScheme} onChange={setColorScheme} />
                <AppearanceSelect label="显示模式" value={displayMode} options={OPTIONS.displayMode} onChange={setDisplayMode} />
                <AppearanceSelect label="布局密度" value={layoutDensity} options={OPTIONS.layoutDensity} onChange={setLayoutDensity} />
              </div>
              {colorScheme === "custom" ? (
                <div className="mt-7 space-y-2">
                  <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">自定义强调色</Label>
                  <div className="flex items-center gap-4">
                    <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-14 border bg-transparent" />
                    <span className="text-[12px] tracking-[0.1em] text-muted-foreground">{accent}</span>
                  </div>
                </div>
              ) : null}
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

        <SchoolAppearance
          preview
          settings={{ accent_color: accent, color_scheme: colorScheme, display_mode: displayMode, font_family: fontFamily, font_scale: fontScale, layout_density: layoutDensity }}
          className="h-fit"
        >
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
              <div className="h-9 w-full bg-primary" aria-hidden="true" />
            </div>
          </div>
        </Panel>
        </SchoolAppearance>
      </div>
    </Shell>
  );
}
