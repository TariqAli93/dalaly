import type { ThemeDefinition } from "vuetify";

export type AppearanceColors = Record<
  "primary" | "secondary" | "accent" | "background" | "surface" | "sidebar",
  string
>;

// Large neutral areas, white surfaces, and restrained brand accents.
export const dalalyThemes: Record<string, ThemeDefinition> = {
  dalalyLight: {
    dark: false,
    variables: { "medium-emphasis-opacity": 0.75 },
    colors: {
      primary: "#116466",
      secondary: "#E8EEF0",
      accent: "#C27C3A",
      // 60% canvas/navigation, 30% neutral surfaces, 10% primary accents.
      background: "#F3F5F6",
      workspace: "#F3F5F6",
      surface: "#FFFFFF",
      sidebar: "#193638",
      "on-sidebar": "#FFFFFF",
      "on-background": "#1B2B30",
      "on-workspace": "#1B2B30",
      "on-surface": "#1B2B30",
      "on-secondary": "#1B2B30",
      "on-primary": "#FFFFFF",
      "surface-variant": "#E6ECEE",
      "on-surface-variant": "#52646A",
      border: "#D9E2E5",
      error: "#b3261e",
      // بدون تعريف صريح ترجع Vuetify إلى ألوان Material الافتراضية
      // (كهرماني وأزرق) وهي خارج نظام التصميم. القيم أدناه من عائلة
      // الأوكر والسيج نفسها، وبتباين ≥4.5:1 على الأبيض.
      warning: "#8a5a1f",
      success: "#2f6d4f",
      info: "#5b6f62",
    },
  },
  dalalyDark: {
    dark: true,
    variables: { "medium-emphasis-opacity": 0.75 },
    colors: {
      primary: "#74C8C0",
      secondary: "#192C30",
      accent: "#E7AE77",
      background: "#1D3034",
      workspace: "#142428",
      surface: "#192C30",
      sidebar: "#193638",
      "on-sidebar": "#FFFFFF",
      "on-background": "#EDF5F5",
      "on-workspace": "#EDF5F5",
      "on-surface": "#EDF5F5",
      "on-secondary": "#EDF5F5",
      "on-primary": "#102729",
      "surface-variant": "#213B40",
      "on-surface-variant": "#A7B9BB",
      border: "#355057",
      error: "#ffb4ab",
      warning: "#d8a15f",
      success: "#7fc9a3",
      info: "#9db5a7",
    },
  },
};

function luminance(hex: string) {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
// Black or white guarantees legible text even when users choose custom colors.
export function contrastingText(color: string) {
  return luminance(color) > 0.179 ? "#000000" : "#FFFFFF";
}
function contrast(first: string, second: string) {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function mutedText(background: string) {
  const foreground = contrastingText(background);
  const mix = (alpha: number) =>
    "#" +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          parseInt(foreground.slice(offset, offset + 2), 16) * alpha +
            parseInt(background.slice(offset, offset + 2), 16) * (1 - alpha),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  let alpha = 0.72;
  while (alpha < 1 && contrast(mix(alpha), background) < 4.5)
    alpha = Math.min(1, alpha + 0.01);
  return { color: mix(alpha), alpha };
}
export function createTheme(
  colors: AppearanceColors,
  dark: boolean,
): ThemeDefinition {
  const base = dalalyThemes[dark ? "dalalyDark" : "dalalyLight"]!;
  const surfaceText = contrastingText(colors.surface);
  const muted = mutedText(colors.surface);
  return {
    ...base,
    variables: {
      ...base.variables,
      "high-emphasis-opacity": 1,
      "medium-emphasis-opacity": Math.max(
        ...Object.values(colors).map((color) => mutedText(color).alpha),
      ),
    },
    colors: {
      ...base.colors,
      ...colors,
      muted: muted.color,
      "primary-text":
        contrast(colors.primary, colors.surface) >= 4.5
          ? colors.primary
          : surfaceText,
      workspace: colors.background,
      "surface-variant": colors.secondary,
      "on-surface-variant": surfaceText,
      "on-background": contrastingText(colors.background),
      "on-workspace": contrastingText(colors.background),
      "on-surface": surfaceText,
      "on-primary": contrastingText(colors.primary),
      "on-secondary": contrastingText(colors.secondary),
      "on-accent": contrastingText(colors.accent),
      "on-sidebar": contrastingText(colors.sidebar),
      border: surfaceText === "#FFFFFF" ? "#52666B" : "#D5DEE1",
    },
  };
}
