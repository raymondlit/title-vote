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
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fontScalePercent, SchoolAppearance } from "@/components/SchoolAppearance";

const OPTIONS = {
  fontFamily: [
    ["noto", "思源黑体"],
    ["system", "系统黑体"],
    ["serif", "宋体"],
    ["source-serif", "思源宋体"],
    ["kai", "楷体"],
    ["fangsong", "仿宋"],
    ["heiti", "黑体"],
    ["rounded", "圆体"],
    ["elegant", "雅致宋黑"],
    ["mono", "等宽字体"],
  ],
  colorScheme: [
    ["minimal", "墨灰"],
    ["ocean", "深海蓝"],
    ["forest", "松柏绿"],
    ["burgundy", "绛红"],
    ["jade", "青玉"],
    ["sky", "晴空蓝"],
    ["amber", "琥珀"],
    ["rose", "山茶红"],
    ["plum", "梅紫"],
    ["indigo", "靛青"],
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    if (!school) return;
    setName(school.name);
    setSubtitle(school.subtitle ?? "");
    setAccent(school.accent_color);
    setLogoUrl(school.logo_url);
    setFontFamily(school.font_family);
    setFontScale(String(fontScalePercent(school.font_scale)));
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

      <div className="space-y-10">
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
                <AppearanceSelect label="配色方案" value={colorScheme} options={OPTIONS.colorScheme} onChange={setColorScheme} />
                <AppearanceSelect label="显示模式" value={displayMode} options={OPTIONS.displayMode} onChange={setDisplayMode} />
                <AppearanceSelect label="布局密度" value={layoutDensity} options={OPTIONS.layoutDensity} onChange={setLayoutDensity} />
              </div>
              <div className="mt-7 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] tracking-[0.2em] text-muted-foreground">字号</Label>
                  <span className="min-w-12 text-right text-[12px] tabular-nums text-foreground">{fontScale}%</span>
                </div>
                <Slider
                  aria-label="字号比例"
                  min={75}
                  max={300}
                  step={1}
                  value={[fontScalePercent(fontScale)]}
                  onValueChange={(values) => setFontScale(String(values[0] ?? 100))}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>75%</span><span>100% 标准</span><span>300%</span>
                </div>
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
              <div className="rounded-none border border-border/60 bg-muted/40 px-4 py-3">
                <p className="text-[11px] tracking-[0.14em] text-muted-foreground">
                  本校登录页地址：
                  {origin ? (
                    <span className="font-medium text-foreground">{origin}/school/{school.slug}</span>
                  ) : (
                    <span className="font-medium text-foreground">/school/{school.slug}</span>
                  )}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  请将此地址告知全体评委，评委请从该登录页进入，使用分配的账号与密码登录后开展评审投票。
                </p>
              </div>
            ) : null}
          </div>
        </Panel>

        <SchoolAppearance
          preview
          settings={{ accent_color: accent, color_scheme: colorScheme, display_mode: displayMode, font_family: fontFamily, font_scale: fontScale, layout_density: layoutDensity }}
          className="min-h-0"
        >
        <Panel>
          <div className="mb-8 flex items-end justify-between border-b pb-5">
            <div>
              <div className="text-[16px] tracking-[0.12em]">{name || "学校名称"}</div>
              <div className="mt-2 text-[11px] text-muted-foreground">{subtitle || "职称评审推荐投票"}</div>
            </div>
            {logoUrl ? <img src={logoUrl} alt="校徽预览" className="h-10 w-auto object-contain" /> : null}
          </div>
          <div className="grid gap-8 md:grid-cols-[1fr_0.8fr]">
            <div>
              <div className="text-[11px] tracking-[0.2em] text-muted-foreground">调整后预览</div>
              <h2 className="mt-5 text-[17px]">2026 年度职称评审</h2>
              <p className="mt-3 max-w-xl text-[12px] leading-loose text-muted-foreground">
                请核对评审对象信息，并在规定时间内完成推荐投票。当前区域会实时呈现字体、字号、配色、显示模式与布局密度。
              </p>
              <div className="mt-7 overflow-hidden border">
                {["张文华 · 教授", "李明远 · 副教授", "王静 · 讲师"].map((person, index) => (
                  <div key={person} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0">
                    <span className="text-[12px]">{person}</span>
                    <span className={index === 0 ? "text-[11px] text-primary" : "text-[11px] text-muted-foreground"}>
                      {index === 0 ? "已推荐" : "待选择"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border bg-background p-6">
              <Label className="text-[11px] tracking-[0.16em] text-muted-foreground">评审意见</Label>
              <Input className="mt-3 rounded-none border-0 border-b bg-transparent px-0 shadow-none" placeholder="请输入意见" />
              <div className="mt-7 flex items-center gap-3">
                <Button className="rounded-none text-[12px]">确认提交</Button>
                <Button variant="outline" className="rounded-none text-[12px]">暂存</Button>
              </div>
            </div>
          </div>
        </Panel>
        </SchoolAppearance>
      </div>
    </Shell>
  );
}
