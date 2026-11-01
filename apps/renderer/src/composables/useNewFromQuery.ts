import { onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

/**
 * يفتح حوار الإضافة في صفحة حين يصلها ?new= (من «إضافة» في شريط الأوامر،
 * أو من لوحة التحكم أو ملف زبون)، ثم يزيل المعامل فلا يعود الحوار بالتحديث
 * أو بالرجوع. يعمل حين تُفتح الصفحة وحين يُطلب ذلك وهي مفتوحة أصلاً.
 * `open` يتلقى قيمة new (مثلاً "receipt" أو "payment" للسندات) وبقية
 * المعاملات، ويتحقق هو من صلاحية الإضافة.
 *
 * حين تُفتح الصفحة بالمعامل يُستدعى open بعد تركيبها: حوار رُكِّب مفتوحاً لا يرى
 * تغيّر v-model من false إلى true، فلا يملأ نموذجه من الإعداد المسبق ولا يحمّل
 * قوائمه (الصناديق، الموظفين…).
 */
export function useNewFromQuery(
  open: (value: string, query: Record<string, string>) => void,
) {
  const route = useRoute();
  const router = useRouter();
  let mounted = false;
  let pending: (() => void) | null = null;
  onMounted(() => {
    mounted = true;
    pending?.();
    pending = null;
  });
  watch(
    () => route.query.new,
    (value) => {
      if (typeof value !== "string" || !value) return;
      const query = Object.fromEntries(
        Object.entries(route.query).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
      if (mounted) open(value, query);
      else pending = () => open(value, query);
      // The parameters that only served the dialog go with `new`.
      void router.replace({
        query: Object.fromEntries(
          Object.entries(route.query).filter(
            ([key]) => key !== "new" && key !== "person",
          ),
        ),
      });
    },
    { immediate: true },
  );
}
