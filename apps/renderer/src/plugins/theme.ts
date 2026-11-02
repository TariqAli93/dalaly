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

// حبر النص في الثيم المخصّص: درجتا النص في الهوية (الفحم على الفاتح والحجر
// الجيري على الداكن) بدل الأسود والأبيض الخالصين، فيبقى الثيم من عائلة دلالي
// نفسها. نشترط 7:1 (AAA) لا 4.5 لأن النص الثانوي يُشتق منه بالشفافية ويحتاج
// هامشاً؛ وإلا فالخالص.
const INK = { dark: "#1C2326", light: "#F4EFE6" };

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

/** لون الهوية المختار يدوياً ما دام مقروءاً (4.5:1) على كل خلفية، وإلا المشتق. */
function brandOr(
  brand: string | undefined,
  against: string[],
  derived: () => string,
) {
  return brand && against.every((bg) => contrast(brand, bg) >= 4.5)
    ? brand
    : derived();
}

/**
 * الرموز المشتقة تُحسب لكل ثيم، الأساسي والمخصّص، فلا يفقد ما يستخدم
 * muted أو primary-text أو link لونه في الثيم الأساسي. الثيمان الأساسيان
 * يحملان درجتَي الهوية لـ muted (ضفاف) وlink (النحاس الداكن)، وتبقيان ما
 * دامتا مقروءتين على أسطح الثيم؛ إن اختار المستخدم أسطحاً لا تُقرآن عليها
 * اشتُقّتا.
 */
function withDerivedTokens(
  theme: ThemeDefinition,
  brand: Colors = {},
): ThemeDefinition {
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
      muted: brandOr(brand.muted, reading, () =>
        mix(colors["on-surface"]!, colors.surface!, medium),
      ),
      "primary-text": readableOn(
        colors.primary!,
        colors["on-surface"]!,
        reading,
      ),
      // الروابط بلون التمييز (النحاس) مقرّباً من الحبر حتى 4.5:1، كما في
      // دليل الهوية: النحاس لا يُكتب به نص صغير على الفاتح بل بدرجته الداكنة.
      link: brandOr(brand.link, reading, () =>
        readableOn(colors.accent!, colors["on-surface"]!, reading),
      ),
      // عناوين أقسام القائمة الجانبية ومؤشّر العنصر المحدد: النحاس على ليل
      // دجلة، أو أقرب درجة منه تُقرأ على لون الشريط المختار.
      "sidebar-accent": readableOn(colors.accent!, colors["on-sidebar"]!, [
        colors.sidebar!,
      ]),
    },
  };
}

// ─── الثيمان الأساسيان ───────────────────────────────────────────────

// ألوان دليل الهوية (لوحة «الألوان»): ليل دجلة ‎#0E2A33 للتنقّل والأوامر
// والعناوين، الحجر الجيري ‎#F4EFE6 خلفيةً والورق ‎#FBF8F2 للألواح بحدّ
// ‎#E3D8C4، الطابوق البغدادي ‎#D4BF9A مسانداً، النحاس ‎#B8924F للتمييز
// ودرجته الداكنة ‎#7E5F2B للنص الصغير والروابط، الفحم ‎#1C2326 للنص، وضفاف
// ‎#4A6468 للنص الثانوي والبيانات والجداول.
const BRAND_LIGHT: Colors = { muted: "#4A6468", link: "#7E5F2B" };
const BRAND_DARK: Colors = { muted: "#B9C4C2", link: "#D9B474" };

const dalalyLight = withDerivedTokens(
  {
    dark: false,
    variables: { "medium-emphasis-opacity": 0.75 },
    colors: {
      primary: "#0E2A33",
      secondary: "#EDE5D6",
      accent: "#B8924F",
      background: "#F4EFE6",
      workspace: "#F4EFE6",
      surface: "#FBF8F2",
      sidebar: "#0E2A33",
      "on-sidebar": "#F4EFE6",
      "on-background": "#1C2326",
      "on-workspace": "#1C2326",
      "on-surface": "#1C2326",
      "on-secondary": "#1C2326",
      "on-primary": "#F4EFE6",
      "on-accent": "#0E2A33",
      "surface-variant": "#EDE5D6",
      "on-surface-variant": "#4A6468",
      border: "#E3D8C4",
      error: "#b3261e",
      // بدون تعريف صريح ترجع Vuetify إلى ألوان Material الافتراضية
      // (كهرماني وأزرق) وهي خارج نظام التصميم. الانتظار بالنحاس الداكن،
      // والمستقر بلون ضفاف، وكلها بتباين ≥4.5:1 على الورق والحجر.
      warning: "#7e5f2b",
      success: "#2f6d4f",
      info: "#4a6468",
    },
  },
  BRAND_LIGHT,
);

// الداكن على ليل دجلة كغلاف الدليل: الألواح أفتح قليلاً من الأرضية والتنقّل
// أعمق منها، والأساسي بالطابوق البغدادي ونصّه بليل دجلة.
const dalalyDark = withDerivedTokens(
  {
    dark: true,
    variables: { "medium-emphasis-opacity": 0.75 },
    colors: {
      primary: "#D4BF9A",
      secondary: "#1A3C47",
      accent: "#B8924F",
      background: "#0E2A33",
      workspace: "#0A1F26",
      surface: "#12313B",
      sidebar: "#0A2028",
      "on-sidebar": "#F4EFE6",
      "on-background": "#F4EFE6",
      "on-workspace": "#F4EFE6",
      "on-surface": "#F4EFE6",
      "on-secondary": "#F4EFE6",
      "on-primary": "#0E2A33",
      "on-accent": "#0E2A33",
      "surface-variant": "#1A3C47",
      "on-surface-variant": "#C9C2B4",
      border: "#2A4A55",
      error: "#ffb4ab",
      warning: "#d9b474",
      success: "#7fc9a3",
      info: "#a9bec1",
    },
  },
  BRAND_DARK,
);

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
  const brand = dark ? BRAND_DARK : BRAND_LIGHT;

  // قيمة غير صالحة ("#ggg"، نص فارغ، مفتاح ناقص من إعداد قديم) ترجع
  // إلى لون الثيم الأساسي بدل أن تنتج NaN ونصاً أبيض على خلفية بيضاء.
  const c = Object.fromEntries(
    APPEARANCE_KEYS.map((key) => [
      key,
      normalizeHex(colors[key] ?? "") ?? baseColors[key]!,
    ]),
  ) as AppearanceColors;

  const onSurface = ink(c.surface);

  // في الداكن يكون الـ workspace أعمق من الخلفية (‎#0A1F26 تحت ‎#0E2A33
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

  return withDerivedTokens(
    {
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
        // حدّ الهوية الدافئ على سطحها؛ وعلى سطح مخصّص مشتق منه، فيبقى من
        // درجته أياً كان اللون المختار
        border:
          c.surface === baseColors.surface
            ? baseColors.border!
            : mix(onSurface, c.surface, 0.15),
      },
    },
    brand,
  );
}
