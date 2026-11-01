/**
 * المطوّر، كما يظهر في «حول التطبيق» و«الدعم» في صفحة المساعدة.
 *
 * TODO(owner): بيانات التواصل الرسمية لشركة كودل (الموقع والبريد والهاتف أو
 * واتساب) لم تُعطَ ولا توجد في المستودع. تُكتب هنا كما هي، ولا تُخترع؛ ما بقي
 * null لا يظهر، وتظهر بدله جملة أنها لم تُضف بعد.
 *
 * TODO(owner): شعار كودل الرسمي يوضع في src/assets/brand/codel-logo.svg (أو
 * .png). الصفحة تجده وحدها؛ إلى أن يوضع يظهر الاسم «Codel» نصاً بدله. لا يُرسم
 * ولا يُقرَّب.
 */
export const CODEL = {
  nameAr: "شركة كودل",
  nameEn: "Codel",
  website: null as string | null,
  email: null as string | null,
  phone: null as string | null,
};

/** The official logo when its file is in the repository, else null. */
const logos = import.meta.glob<string>("../assets/brand/codel-logo.{svg,png}", {
  eager: true,
  query: "?url",
  import: "default",
});
export const CODEL_LOGO: string | null = Object.values(logos)[0] ?? null;
