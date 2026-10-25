<script setup lang="ts">
import { computed } from "vue";

/**
 * رقم هاتف معزول الاتجاه (لا ينقلب داخل نص عربي) ومعه اتصال وواتساب.
 * واتساب يحتاج الصيغة الدولية: 07… العراقية تصير 9647….
 */
const props = defineProps<{ phone?: string | null; name?: string | null }>();

const digits = computed(() =>
  (props.phone ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, ""),
);
const whatsapp = computed(() => {
  const value = digits.value;
  if (!value) return "";
  if (value.startsWith("964")) return value;
  if (value.startsWith("07")) return `964${value.slice(1)}`;
  return value;
});
const who = computed(() => props.name || "صاحب الرقم");
</script>

<template>
  <span class="phone-link">
    <bdi>{{ phone || "—" }}</bdi>
    <template v-if="digits">
      <a
        :href="`tel:${digits}`"
        class="phone-link__action"
        :title="`اتصال بـ ${who}`"
        :aria-label="`اتصال بـ ${who}`"
        ><v-icon icon="mdi-phone" size="16"
      /></a>
      <a
        :href="`https://wa.me/${whatsapp}`"
        target="_blank"
        rel="noopener"
        class="phone-link__action"
        :title="`مراسلة ${who} عبر واتساب`"
        :aria-label="`مراسلة ${who} عبر واتساب`"
        ><v-icon icon="mdi-whatsapp" size="16"
      /></a>
    </template>
  </span>
</template>

<style scoped>
.phone-link {
  display: inline-flex;
  white-space: nowrap;
  align-items: center;
  gap: 6px;
}
.phone-link__action {
  display: inline-flex;
  padding: 4px;
  border-radius: var(--dal-radius-control);
  color: rgb(var(--v-theme-primary-text));
  text-decoration: none;
}
.phone-link__action:hover {
  background: var(--dal-hover);
}
</style>
