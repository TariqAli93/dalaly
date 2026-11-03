<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
  CODEL,
  CODEL_CONTACTS,
  type DeveloperContact,
} from "../../constants/about";
import { useSnackbar } from "../../composables/useSnackbar";
import { platform } from "../../platform";

/**
 * طرق التواصل مع كودل: كل قيمة بأوامرها (اتصال، واتساب، رسالة، الموقع)
 * ونسخها. الروابط تُفتح ببرامجها في النظام عبر المنصّة، لا في نافذة البرنامج.
 */
const { notifySuccess, notifyError } = useSnackbar();

async function open(href: string) {
  const result = await platform.openExternal(href).catch(() => ({ ok: false }));
  if (!result.ok) notifyError("تعذر فتح الرابط. انسخ القيمة واستعملها يدوياً.");
}

// علامة ✓ على زر النسخ لحظة النسخ، مع الإشعار.
const copiedKey = ref<string | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
async function copy(contact: DeveloperContact) {
  try {
    await navigator.clipboard.writeText(contact.value);
    notifySuccess(contact.copied ?? "تم النسخ.");
    copiedKey.value = contact.key;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copiedKey.value = null), 2000);
  } catch {
    notifyError("تعذر النسخ. حدّد القيمة وانسخها يدوياً.");
  }
}
onBeforeUnmount(() => clearTimeout(copiedTimer));
</script>

<template>
  <ul class="codel-contacts" :aria-label="`التواصل مع ${CODEL.nameAr}`">
    <li v-for="contact in CODEL_CONTACTS" :key="contact.key">
      <v-icon
        :icon="contact.icon"
        size="18"
        class="codel-contacts__icon"
        aria-hidden="true"
      />
      <div class="codel-contacts__text">
        <span class="codel-contacts__label">{{ contact.label }}</span>
        <bdi dir="ltr" class="codel-contacts__value">{{ contact.value }}</bdi>
      </div>
      <div class="codel-contacts__actions">
        <v-btn
          v-for="action in contact.actions"
          :key="action.href"
          :href="action.href"
          icon
          variant="text"
          size="small"
          :title="action.label"
          :aria-label="`${action.label}: ${contact.value}`"
          @click.prevent="open(action.href)"
        >
          <v-icon :icon="action.icon" size="18" />
        </v-btn>
        <v-btn
          v-if="contact.copied"
          icon
          variant="text"
          size="small"
          :title="copiedKey === contact.key ? 'نُسخ' : 'نسخ'"
          :aria-label="`نسخ ${contact.label}: ${contact.value}`"
          @click="copy(contact)"
        >
          <v-icon
            :icon="copiedKey === contact.key ? 'mdi-check' : 'mdi-content-copy'"
            size="16"
          />
        </v-btn>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.codel-contacts {
  margin: 0;
  padding: 0;
  list-style: none;
}
.codel-contacts li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding-block: 8px;
}
.codel-contacts li + li {
  border-top: 1px solid var(--dal-stroke);
}
.codel-contacts__icon {
  color: var(--dal-muted);
}
.codel-contacts__text {
  display: grid;
  min-width: 0;
}
.codel-contacts__label {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.codel-contacts__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(14px * var(--dal-font-scale));
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  /* bdi مضمّن؛ هنا كتلة في عمودها، فتبدأ من حافة النص العربي نفسها. */
  justify-self: start;
  max-width: 100%;
}
.codel-contacts__actions {
  display: flex;
  gap: 2px;
}
.codel-contacts__actions .v-btn {
  width: 32px;
  height: 32px;
  color: rgb(var(--v-theme-primary-text));
}
</style>
