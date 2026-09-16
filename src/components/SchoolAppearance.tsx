import { useEffect, type CSSProperties, type ReactNode } from "react";

export type SchoolAppearanceSettings = {
  accent_color?: string | null;
  color_scheme?: string | null;
  display_mode?: string | null;
  font_family?: string | null;
  font_scale?: string | null;
  layout_density?: string | null;
};

export const APPEARANCE_DEFAULTS = {
  fontFamily: "noto",
  fontScale: "standard",
  colorScheme: "minimal",
  displayMode: "light",
  layoutDensity: "standard",
} as const;

export function appearanceAttributes(settings?: SchoolAppearanceSettings | null) {
  return {
    "data-color-scheme": settings?.color_scheme ?? APPEARANCE_DEFAULTS.colorScheme,
    "data-display-mode": settings?.display_mode ?? APPEARANCE_DEFAULTS.displayMode,
    "data-font-family": settings?.font_family ?? APPEARANCE_DEFAULTS.fontFamily,
    "data-font-scale": settings?.font_scale ?? APPEARANCE_DEFAULTS.fontScale,
    "data-layout-density": settings?.layout_density ?? APPEARANCE_DEFAULTS.layoutDensity,
  };
}

function appearanceStyle(settings?: SchoolAppearanceSettings | null): CSSProperties {
  if ((settings?.color_scheme ?? APPEARANCE_DEFAULTS.colorScheme) !== "custom") return {};
  return { "--school-accent": settings?.accent_color ?? "#3f4a52" } as CSSProperties;
}

export function SchoolAppearance({
  settings,
  children,
  preview = false,
  className = "",
}: {
  settings?: SchoolAppearanceSettings | null | undefined;
  children: ReactNode;
  preview?: boolean;
  className?: string;
}) {
  const attributes = appearanceAttributes(settings);

  useEffect(() => {
    if (preview) return;
    const root = document.documentElement;
    const previous = {
      colorScheme: root.dataset.colorScheme,
      displayMode: root.dataset.displayMode,
      fontFamily: root.dataset.fontFamily,
      fontScale: root.dataset.fontScale,
      layoutDensity: root.dataset.layoutDensity,
      accent: root.style.getPropertyValue("--school-accent"),
    };
    Object.entries(attributes).forEach(([key, value]) => root.setAttribute(key, value));
    const style = appearanceStyle(settings);
    if (style["--school-accent" as keyof CSSProperties]) {
      root.style.setProperty("--school-accent", settings?.accent_color ?? "#3f4a52");
    } else {
      root.style.removeProperty("--school-accent");
    }
    return () => {
      const restore = (key: string, value?: string) =>
        value ? root.setAttribute(key, value) : root.removeAttribute(key);
      restore("data-color-scheme", previous["colorScheme"]);
      restore("data-display-mode", previous["displayMode"]);
      restore("data-font-family", previous["fontFamily"]);
      restore("data-font-scale", previous["fontScale"]);
      restore("data-layout-density", previous["layoutDensity"]);
      if (previous["accent"]) root.style.setProperty("--school-accent", previous["accent"]);
      else root.style.removeProperty("--school-accent");
    };
  }, [settings, preview]);

  return (
    <div
      {...attributes}
      style={appearanceStyle(settings)}
      className={`school-theme min-h-screen bg-background text-foreground ${className}`}
    >
      {children}
    </div>
  );
}