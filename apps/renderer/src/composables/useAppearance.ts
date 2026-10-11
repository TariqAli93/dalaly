import { computed, reactive, watch } from "vue";
import { useTheme } from "vuetify";
import {
  dalalyThemes,
  createTheme,
  type AppearanceColors,
} from "../plugins/theme";

const STORAGE_KEY = "dalaly.appearance.v1";
export const fontOptions = [
  "Cairo",
  "Tajawal",
  "Almarai",
  "IBM Plex Sans Arabic",
  "Segoe UI",
  "Tahoma",
];
export const fontSizes = [
  { title: "صغير", value: "small", scale: 0.9 },
  { title: "متوسط", value: "medium", scale: 1 },
  { title: "كبير", value: "large", scale: 1.125 },
  { title: "كبير جداً", value: "extraLarge", scale: 1.25 },
] as const;
export type AppearanceMode = "dalalyLight" | "dalalyDark";
type Preferences = {
  font: string;
  fontSize: string;
  fluid: boolean;
  maxWidth: number;
  colors: Record<AppearanceMode, AppearanceColors>;
};
export const colorFields: { key: keyof AppearanceColors; label: string }[] = [
  { key: "primary", label: "اللون الأساسي" },
  { key: "secondary", label: "اللون الثانوي" },
  { key: "accent", label: "لون التمييز" },
  { key: "background", label: "خلفية التطبيق" },
  { key: "surface", label: "البطاقات والأسطح" },
  { key: "sidebar", label: "الشريط الجانبي" },
];
function defaultColors(mode: AppearanceMode): AppearanceColors {
  return Object.fromEntries(
    colorFields.map(({ key }) => [key, dalalyThemes[mode]!.colors![key]]),
  ) as AppearanceColors;
}
function defaults(): Preferences {
  return {
    font: "Cairo",
    fontSize: "medium",
    fluid: true,
    maxWidth: 1440,
    colors: {
      dalalyLight: defaultColors("dalalyLight"),
      dalalyDark: defaultColors("dalalyDark"),
    },
  };
}
function readPreferences(): Preferences {
  const result = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return result;
    if (fontOptions.includes(saved.font)) result.font = saved.font;
    if (fontSizes.some((size) => size.value === saved.fontSize))
      result.fontSize = saved.fontSize;
    if (typeof saved.fluid === "boolean") result.fluid = saved.fluid;
    if (Number.isFinite(saved.maxWidth))
      result.maxWidth = Math.min(1920, Math.max(960, saved.maxWidth));
    for (const mode of ["dalalyLight", "dalalyDark"] as const) {
      for (const { key } of colorFields) {
        const value = saved.colors?.[mode]?.[key];
        if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
          result.colors[mode][key] = value;
      }
    }
  } catch {
    /* Invalid or unavailable storage uses the bundled defaults. */
  }
  return result;
}
export const appearance = reactive(readPreferences());
export function configuredThemes() {
  return {
    dalalyLight: createTheme(appearance.colors.dalalyLight, false),
    dalalyDark: createTheme(appearance.colors.dalalyDark, true),
  };
}
function applyTypography() {
  document.documentElement.style.setProperty(
    "--dalaly-font",
    `"${appearance.font}", "Segoe UI", Tahoma, sans-serif`,
  );
  const scale =
    fontSizes.find((size) => size.value === appearance.fontSize)?.scale ?? 1;
  document.documentElement.style.setProperty("--dal-font-scale", String(scale));
}
export function initializeAppearance() {
  applyTypography();
  watch(
    appearance,
    () => {
      applyTypography();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
      } catch {
        /* Live settings remain usable when storage is unavailable. */
      }
    },
    { deep: true },
  );
}
export function useAppearance() {
  const theme = useTheme();
  const activeMode = computed<AppearanceMode>(() =>
    theme.global.name.value === "dalalyDark" ? "dalalyDark" : "dalalyLight",
  );
  watch(
    () => appearance.colors,
    () => {
      const configured = configuredThemes();
      for (const mode of ["dalalyLight", "dalalyDark"] as const) {
        const target = theme.themes.value[mode];
        if (target) {
          Object.assign(target.colors, configured[mode].colors);
          Object.assign(target.variables, configured[mode].variables);
        }
      }
    },
    { deep: true, immediate: true },
  );
  function resetColors(mode: AppearanceMode) {
    appearance.colors[mode] = defaultColors(mode);
  }
  function resetAll() {
    Object.assign(appearance, defaults());
  }
  return { appearance, activeMode, resetColors, resetAll };
}
