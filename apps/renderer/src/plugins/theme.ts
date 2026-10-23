// import type { ThemeDefinition } from "vuetify";

// export type AppearanceColors = Record<
//   "primary" | "secondary" | "accent" | "background" | "surface" | "sidebar",
//   string
// >;

// // Large neutral areas, white surfaces, and restrained brand accents.
// export const dalalyThemes: Record<string, ThemeDefinition> = {
//   dalalyLight: {
//     dark: false,
//     variables: { "medium-emphasis-opacity": 0.75 },
//     colors: {
//       primary: "#116466",
//       secondary: "#E8EEF0",
//       accent: "#C27C3A",
//       // 60% canvas/navigation, 30% neutral surfaces, 10% primary accents.
//       background: "#F3F5F6",
//       workspace: "#F3F5F6",
//       surface: "#FFFFFF",
//       sidebar: "#193638",
//       "on-sidebar": "#FFFFFF",
//       "on-background": "#1B2B30",
//       "on-workspace": "#1B2B30",
//       "on-surface": "#1B2B30",
//       "on-secondary": "#1B2B30",
//       "on-primary": "#FFFFFF",
//       "surface-variant": "#E6ECEE",
//       "on-surface-variant": "#52646A",
//       border: "#D9E2E5",
//       error: "#b3261e",
//       // بدون تعريف صريح ترجع Vuetify إلى ألوان Material الافتراضية
//       // (كهرماني وأزرق) وهي خارج نظام التصميم. القيم أدناه من عائلة
//       // الأوكر والسيج نفسها، وبتباين ≥4.5:1 على الأبيض.
//       warning: "#8a5a1f",
//       success: "#2f6d4f",
//       info: "#5b6f62",
//     },
//   },
//   dalalyDark: {
//     dark: true,
//     variables: { "medium-emphasis-opacity": 0.75 },
//     colors: {
//       primary: "#74C8C0",
//       secondary: "#192C30",
//       accent: "#E7AE77",
//       background: "#1D3034",
//       workspace: "#142428",
//       surface: "#192C30",
//       sidebar: "#193638",
//       "on-sidebar": "#FFFFFF",
//       "on-background": "#EDF5F5",
//       "on-workspace": "#EDF5F5",
//       "on-surface": "#EDF5F5",
//       "on-secondary": "#EDF5F5",
//       "on-primary": "#102729",
//       "surface-variant": "#213B40",
//       "on-surface-variant": "#A7B9BB",
//       border: "#355057",
//       error: "#ffb4ab",
//       warning: "#d8a15f",
//       success: "#7fc9a3",
//       info: "#9db5a7",
//     },
//   },
// };

// function luminance(hex: string) {
//   const channels = [1, 3, 5]
//     .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
//     .map((value) =>
//       value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
//     );
//   return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
// }
// // Black or white guarantees legible text even when users choose custom colors.
// export function contrastingText(color: string) {
//   return luminance(color) > 0.179 ? "#000000" : "#FFFFFF";
// }
// function contrast(first: string, second: string) {
//   const a = luminance(first),
//     b = luminance(second);
//   return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
// }
// function mutedText(background: string) {
//   const foreground = contrastingText(background);
//   const mix = (alpha: number) =>
//     "#" +
//     [1, 3, 5]
//       .map((offset) =>
//         Math.round(
//           parseInt(foreground.slice(offset, offset + 2), 16) * alpha +
//             parseInt(background.slice(offset, offset + 2), 16) * (1 - alpha),
//         )
//           .toString(16)
//           .padStart(2, "0"),
//       )
//       .join("");
//   let alpha = 0.72;
//   while (alpha < 1 && contrast(mix(alpha), background) < 4.5)
//     alpha = Math.min(1, alpha + 0.01);
//   return { color: mix(alpha), alpha };
// }
// export function createTheme(
//   colors: AppearanceColors,
//   dark: boolean,
// ): ThemeDefinition {
//   const base = dalalyThemes[dark ? "dalalyDark" : "dalalyLight"]!;
//   const surfaceText = contrastingText(colors.surface);
//   const muted = mutedText(colors.surface);
//   return {
//     ...base,
//     variables: {
//       ...base.variables,
//       "high-emphasis-opacity": 1,
//       "medium-emphasis-opacity": Math.max(
//         ...Object.values(colors).map((color) => mutedText(color).alpha),
//       ),
//     },
//     colors: {
//       ...base.colors,
//       ...colors,
//       muted: muted.color,
//       "primary-text":
//         contrast(colors.primary, colors.surface) >= 4.5
//           ? colors.primary
//           : surfaceText,
//       workspace: colors.background,
//       "surface-variant": colors.secondary,
//       "on-surface-variant": surfaceText,
//       "on-background": contrastingText(colors.background),
//       "on-workspace": contrastingText(colors.background),
//       "on-surface": surfaceText,
//       "on-primary": contrastingText(colors.primary),
//       "on-secondary": contrastingText(colors.secondary),
//       "on-accent": contrastingText(colors.accent),
//       "on-sidebar": contrastingText(colors.sidebar),
//       border: surfaceText === "#FFFFFF" ? "#52666B" : "#D5DEE1",
//     },
//   };
// }

import type { ThemeDefinition } from "vuetify";

const APPEARANCE_KEYS = [
  "primary",
  "secondary",
  "accent",
  "background",
  "surface",
  "sidebar",
] as const;

export type AppearanceColors = Record<(typeof APPEARANCE_KEYS)[number], string>;

type Colors = Record<string, string>;
type RGB = [number, number, number];

// ─── أدوات اللون ─────────────────────────────────────────────────────

/**
 * يحوّل أي صيغة hex شائعة إلى ‎#RRGGBB: ‏‎#RGB و‎#RGBA و‎#RRGGBB
 * و‎#RRGGBBAA، بـ # أو بدونها، ويُرجع null لغير ذلك. الشفافية تُهمل كما
 * يفعل Vuetify نفسه عند توليد متغيرات الثيم.
 */
export function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#/, "");
  if (!/^([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(hex)) return null;
  const rgb =
    hex.length <= 4
      ? Array.from(hex.slice(0, 3), (digit) => digit + digit).join("")
      : hex.slice(0, 6);
  return `#${rgb.toUpperCase()}`;
}

const toRgb = (hex: string) =>
  [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as RGB;

const toHex = (rgb: RGB) =>
  "#" +
  rgb
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as RGB;
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function contrast(first: string, second: string) {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** لون fg فوق bg بنسبة alpha — ما تراه العين فعلاً لنص شبه شفاف. */
function mix(fg: string, bg: string, alpha: number) {
  const [front, back] = [toRgb(fg), toRgb(bg)];
  return toHex(
    front.map((channel, i) => channel * alpha + back[i]! * (1 - alpha)) as RGB,
  );
}

// Black or white guarantees legible text even when users choose custom colors.
// ‏0.179 هي الإضاءة التي يتساوى عندها تباين الأسود والأبيض.
export function contrastingText(color: string) {
  const hex = normalizeHex(color) ?? "#FFFFFF";
  return luminance(hex) > 0.179 ? "#000000" : "#FFFFFF";
}

// حبر النص في الثيم المخصّص: درجتا النص في الثيمين الأساسيين بدل الأسود
// والأبيض الخالصين، فيبقى الثيم من عائلة دلالي نفسها. نشترط 7:1 (AAA) لا
// 4.5 لأن النص الثانوي يُشتق منه بالشفافية ويحتاج هامشاً؛ وإلا فالخالص.
const INK = { dark: "#1B2B30", light: "#EDF5F5" };

function ink(background: string) {
  const pure = contrastingText(background);
  const tinted = pure === "#000000" ? INK.dark : INK.light;
  return contrast(tinted, background) >= 7 ? tinted : pure;
}

/**
 * أقل شفافية لـ text فوق background تبلغ 4.5:1، ولا تنزل عن floor كي يبقى
 * النص الثانوي ثانوياً. خطوات بالمئة الصحيحة تتجنّب 0.8800000000000001.
 */
function mutedAlpha(text: string, background: string, floor = 0.72) {
  let percent = Math.round(floor * 100);
  while (
    percent < 100 &&
    contrast(mix(text, background, percent / 100), background) < 4.5
  )
    percent++;
  return percent / 100;
}

/**
 * يقرّب color نحو toward بأقل قدر يبلغ به 4.5:1 مع كل خلفية في against —
 * يحفظ درجة اللون بدل استبداله بالأسود أو الأبيض.
 */
function readableOn(color: string, toward: string, against: string[]) {
  for (let percent = 0; percent <= 100; percent++) {
    const candidate = mix(toward, color, percent / 100);
    if (against.every((bg) => contrast(candidate, bg) >= 4.5)) return candidate;
  }
  return toward;
}

/**
 * الرموز المشتقة تُحسب لكل ثيم، الأساسي والمخصّص، فلا يفقد ما يستخدم
 * muted أو primary-text لونه في الثيم الأساسي.
 */
function withDerivedTokens(theme: ThemeDefinition): ThemeDefinition {
  const colors = theme.colors as Colors;
  const reading = [colors.surface, colors.background, colors.workspace].filter(
    (bg): bg is string => !!bg,
  );
  const medium = Number(theme.variables?.["medium-emphasis-opacity"] ?? 0.75);
  return {
    ...theme,
    colors: {
      ...colors,
      // مطابق لما يرسمه Vuetify لنص medium-emphasis على surface تماماً
      muted: mix(colors["on-surface"]!, colors.surface!, medium),
      "primary-text": readableOn(
        colors.primary!,
        colors["on-surface"]!,
        reading,
      ),
    },
  };
}

// ─── الثيمان الأساسيان ───────────────────────────────────────────────

// Large neutral areas, white surfaces, and restrained brand accents.
const dalalyLight = withDerivedTokens({
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
});

const dalalyDark = withDerivedTokens({
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
});

export const dalalyThemes: Record<string, ThemeDefinition> = {
  dalalyLight,
  dalalyDark,
};

// ─── الثيم المخصّص ───────────────────────────────────────────────────

export function createTheme(
  colors: AppearanceColors,
  dark: boolean,
): ThemeDefinition {
  const base = dark ? dalalyDark : dalalyLight;
  const baseColors = base.colors as Colors;

  // قيمة غير صالحة ("#ggg"، نص فارغ، مفتاح ناقص من إعداد قديم) ترجع
  // إلى لون الثيم الأساسي بدل أن تنتج NaN ونصاً أبيض على خلفية بيضاء.
  const c = Object.fromEntries(
    APPEARANCE_KEYS.map((key) => [
      key,
      normalizeHex(colors[key] ?? "") ?? baseColors[key]!,
    ]),
  ) as AppearanceColors;

  const onSurface = ink(c.surface);

  // في الداكن يكون الـ workspace أعمق من الخلفية (‎#142428 تحت ‎#1D3034
  // في الثيم الأساسي)، ومزج 30% أسود يعيد العلاقة نفسها لأي لون.
  const workspace = dark ? mix("#000000", c.background, 0.3) : c.background;

  // surface-variant خلفية التلميحات والإشعارات (snackbar) في Vuetify؛ إن
  // طابق secondary السطحَ تقريباً اختفت حدودها فوق البطاقات، فنميّزها.
  const surfaceVariant =
    contrast(c.secondary, c.surface) < 1.1
      ? mix(onSurface, c.surface, 0.07)
      : c.secondary;

  // شفافية النص الثانوي تُحسب على أسطح القراءة فقط. primary وaccent خارجها
  // عمداً، كي لا يُسطّح لونُ زرٍّ متوسطُ الإضاءة تراتبيةَ النص في التطبيق كله.
  const readingSurfaces = [
    c.surface,
    c.background,
    workspace,
    surfaceVariant,
    c.sidebar,
  ];
  const medium = Math.max(
    ...readingSurfaces.map((bg) => mutedAlpha(ink(bg), bg)),
  );

  return withDerivedTokens({
    ...base,
    variables: {
      ...base.variables,
      "high-emphasis-opacity": 1,
      "medium-emphasis-opacity": medium,
    },
    colors: {
      ...baseColors,
      ...c,
      workspace,
      "surface-variant": surfaceVariant,
      "on-surface": onSurface,
      "on-background": ink(c.background),
      "on-workspace": ink(workspace),
      // يُحسب على surface-variant نفسها لا على السطح، وإلا فـ secondary
      // داكن مع سطح فاتح يعطي تلميحات وإشعارات بنص أسود على داكن.
      "on-surface-variant": ink(surfaceVariant),
      "on-primary": ink(c.primary),
      "on-secondary": ink(c.secondary),
      "on-accent": ink(c.accent),
      "on-sidebar": ink(c.sidebar),
      // مشتق من السطح نفسه، فيبقى من درجته أياً كان اللون المختار
      border: mix(onSurface, c.surface, 0.15),
    },
  });
}
