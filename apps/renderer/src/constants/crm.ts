import type {
  DocumentSortKey,
  FollowupType,
  ListSortOption,
  PersonRecord,
  PersonRole,
  PersonSource,
  PersonSortKey,
  PurchaseRequestSortKey,
  TaskPriority,
  TaskSortKey,
  TaskStatus,
} from "../types";

// الترتيب الافتراضي للجداول المقسّمة في الخادم، وهو ترتيب القوائم الكاملة نفسه.
export const PEOPLE_DEFAULT_SORT: ListSortOption<PersonSortKey> = {
  value: "updated",
  title: "آخر تحديث",
  key: "updated_at",
  order: "desc",
};
// مشترك بين طلبات الإيجار والشراء (مفاتيح الشراء جزء من مفاتيح الإيجار).
export const REQUESTS_DEFAULT_SORT: ListSortOption<PurchaseRequestSortKey> = {
  value: "updated",
  title: "آخر تحديث",
  key: "updated_at",
  order: "desc",
};
export const DOCUMENTS_DEFAULT_SORT: ListSortOption<DocumentSortKey> = {
  value: "newest",
  title: "الأحدث",
  key: "uploaded_at",
  order: "desc",
};

/** عدد الأشخاص في قائمة الاختيار المبحوثة في الخادم (PersonPicker). */
export const PERSON_PICKER_SIZE = 20;

export function personStatusLabel(value: string) {
  return (
    (
      { active: "نشط", inactive: "غير نشط", archived: "مؤرشف" } as Record<
        string,
        string
      >
    )[value] ?? value
  );
}

/** لون شريحة حالة الزبون: النشط وحده ملوّن، والبقية محايدة. */
export function personStatusColor(value: string) {
  return value === "active" ? "success" : undefined;
}

export function personTypeLabel(value: string) {
  return (
    (
      { individual: "فرد", company: "شركة", other: "أخرى" } as Record<
        string,
        string
      >
    )[value] ?? value
  );
}

/**
 * تصفية جدول الزبائن بالحالة. "current" لا يُرسل حالةً، فيعيد الخادم غير
 * المؤرشفين؛ لا طريق إلى المؤرشف إلا بطلبه صراحة.
 */
export type PersonStatusFilter = PersonRecord["status"] | "current";
export const PERSON_STATUS_FILTERS: Array<{
  title: string;
  value: PersonStatusFilter;
}> = [
  { title: "الحاليون", value: "current" },
  { title: "نشط", value: "active" },
  { title: "غير نشط", value: "inactive" },
  { title: "المؤرشفون", value: "archived" },
];

/** صفات الزبون عند المكتب (PERSON_ROLES في الخادم)؛ قد تجتمع أكثر من صفة. */
export const PERSON_ROLES: Array<{ title: string; value: PersonRole }> = [
  { title: "مشترٍ", value: "buyer" },
  { title: "بائع", value: "seller" },
  { title: "مستأجر", value: "tenant" },
  { title: "مؤجر", value: "landlord" },
  { title: "مالك", value: "owner" },
  { title: "مستثمر", value: "investor" },
  { title: "أخرى", value: "other" },
];
export function personRoleLabel(value: string) {
  return PERSON_ROLES.find((item) => item.value === value)?.title ?? value;
}

/** كيف وصل الزبون إلى المكتب. */
export const PERSON_SOURCES: Array<{ title: string; value: PersonSource }> = [
  { title: "زيارة للمكتب", value: "walk_in" },
  { title: "اتصال هاتفي", value: "phone" },
  { title: "توصية من زبون", value: "referral" },
  { title: "مواقع التواصل", value: "social" },
  { title: "إعلان عن عرض", value: "listing_ad" },
  { title: "أخرى", value: "other" },
];
export function personSourceLabel(value: string | null) {
  return value
    ? (PERSON_SOURCES.find((item) => item.value === value)?.title ?? value)
    : "";
}


/** حالات المهمة (متابعة عرض أو نشاط زبون) كما يقبلها الخادم. */
export const TASK_STATUSES: Array<{ title: string; value: TaskStatus }> = [
  { title: "مفتوحة", value: "open" },
  { title: "أُنجزت", value: "done" },
  { title: "ملغاة", value: "cancelled" },
];
export function taskStatusLabel(value: string) {
  return TASK_STATUSES.find((item) => item.value === value)?.title ?? value;
}
export function taskStatusColor(value: string) {
  return value === "open"
    ? "primary"
    : value === "done"
      ? "success"
      : "default";
}

export const TASK_PRIORITIES: Array<{ title: string; value: TaskPriority }> = [
  { title: "منخفضة", value: "low" },
  { title: "عادية", value: "normal" },
  { title: "مرتفعة", value: "high" },
  { title: "عاجلة", value: "urgent" },
];
export function taskPriorityLabel(value: string) {
  return TASK_PRIORITIES.find((item) => item.value === value)?.title ?? value;
}
export function taskPriorityColor(value: string) {
  return value === "urgent"
    ? "error"
    : value === "high"
      ? "warning"
      : value === "low"
        ? "default"
        : "info";
}

/** جدول المهام: الأقرب موعداً أولاً (بلا موعد في آخره). */
export const TASKS_DEFAULT_SORT: ListSortOption<TaskSortKey> = {
  value: "due",
  title: "الأقرب موعداً",
  key: "scheduled_at",
  order: "asc",
};

/** أنواع المتابعة كما يقبلها الخادم، للعروض والإيجارات معاً. */
export const FOLLOWUP_TYPES: Array<{
  title: string;
  value: FollowupType;
  icon: string;
}> = [
  { title: "اتصال هاتفي", value: "phone_call", icon: "mdi-phone" },
  { title: "اجتماع", value: "meeting", icon: "mdi-account-group" },
  { title: "رسالة", value: "message", icon: "mdi-message-text-outline" },
  { title: "معاينة", value: "visit", icon: "mdi-home-search" },
  { title: "تفاوض", value: "negotiation", icon: "mdi-handshake" },
  { title: "مهمة", value: "task", icon: "mdi-checkbox-marked-circle-outline" },
  { title: "أخرى", value: "other", icon: "mdi-note-text-outline" },
];

export function followupTypeLabel(value: string) {
  return FOLLOWUP_TYPES.find((item) => item.value === value)?.title ?? value;
}
export function followupTypeIcon(value: string) {
  return (
    FOLLOWUP_TYPES.find((item) => item.value === value)?.icon ??
    "mdi-note-text-outline"
  );
}

/** حالة المستمسك المحسوبة: active نشط غير منتهٍ، expired نشط انتهى تاريخه. */
export function documentStatusLabel(value: string) {
  return (
    (
      { active: "ساري", expired: "منتهي", archived: "مؤرشف" } as Record<
        string,
        string
      >
    )[value] ?? value
  );
}
export function documentStatusColor(value: string) {
  return value === "expired"
    ? "error"
    : value === "active"
      ? "success"
      : undefined;
}

/** حالات طلبات الشراء والإيجار (الخادم: open / matched / closed / archived). */
export const REQUEST_STATUSES = [
  { title: "مفتوح", value: "open" },
  { title: "تمت المطابقة", value: "matched" },
  { title: "مغلق", value: "closed" },
];

export function requestStatusLabel(value: string) {
  if (value === "archived") return "مؤرشف";
  return REQUEST_STATUSES.find((item) => item.value === value)?.title ?? value;
}

/** لون شريحة حالة الطلب: المفتوح يحتاج عملاً، والبقية استقرّت. */
export function requestStatusColor(value: string) {
  return value === "open" ? "primary" : undefined;
}
