import codelFullLogo from "../assets/images/black_and_white_full_logo.svg";
import codelMarkLogo from "../assets/images/black_and_white_logo.svg";

/** المطوّر، كما يظهر في «حول التطبيق» و«الدعم» في صفحة المساعدة. */
export const CODEL = {
  nameAr: "كودل",
  nameEn: "Codel",
  address: "بغداد - الدورة - حي دجلة",
};

/**
 * شعارا كودل بلون واحد: الكامل حيث يتّسع المكان، والرمز وحده في المساحات
 * الضيقة. النسبة من viewBox كل ملف، فلا يُمدّ ولا يُضغط.
 */
export const CODEL_LOGOS = {
  full: { src: codelFullLogo, ratio: 671.68 / 117.31 },
  mark: { src: codelMarkLogo, ratio: 303.32 / 117.31 },
} as const;

export type ContactAction = { icon: string; label: string; href: string };
export type DeveloperContact = {
  key: string;
  label: string;
  icon: string;
  /** يُعرض من اليسار إلى اليمين (رقم، بريد، موقع) داخل النص العربي. */
  value: string;
  actions: ContactAction[];
  /** رسالة النسخ؛ غيابها يعني أن القيمة لا تُنسخ. */
  copied?: string;
};

export const CODEL_CONTACTS: DeveloperContact[] = [
  {
    key: "phone",
    label: "الهاتف وواتساب",
    icon: "mdi-phone-outline",
    value: "07824082356",
    actions: [
      { icon: "mdi-phone", label: "اتصال", href: "tel:07824082356" },
      {
        icon: "mdi-whatsapp",
        label: "مراسلة عبر واتساب",
        href: "https://wa.me/9647824082356",
      },
    ],
    copied: "نُسخ رقم الهاتف.",
  },
  {
    key: "whatsapp",
    label: "واتساب فقط",
    icon: "mdi-whatsapp",
    value: "07884841993",
    actions: [
      {
        icon: "mdi-whatsapp",
        label: "مراسلة عبر واتساب",
        href: "https://wa.me/9647884841993",
      },
    ],
    copied: "نُسخ رقم واتساب.",
  },
  {
    key: "email",
    label: "البريد الإلكتروني",
    icon: "mdi-email-outline",
    value: "business@codelapps.com",
    actions: [
      {
        icon: "mdi-email-edit-outline",
        label: "كتابة رسالة",
        href: "mailto:business@codelapps.com",
      },
    ],
    copied: "نُسخ البريد الإلكتروني.",
  },
  {
    key: "website",
    label: "الموقع الإلكتروني",
    icon: "mdi-web",
    value: "codelapps.com",
    actions: [
      {
        icon: "mdi-open-in-new",
        label: "فتح الموقع",
        href: "https://codelapps.com",
      },
    ],
  },
];
