<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  onScopeDispose,
  ref,
  watch,
} from "vue";
import type { VMenu } from "vuetify/components";
import { useRouter } from "vue-router";
import { useAuth } from "../../composables/useAuth";
import { usePermissions } from "../../composables/usePermissions";
import * as legal from "../../services/legal-content.service";
import { useSnackbar } from "../../composables/useSnackbar";
import { getErrorMessage } from "../../services/api.service";
const router = useRouter(),
  { currentUser } = useAuth(),
  { can } = usePermissions();
const { notifyError } = useSnackbar();
const notices = ref<legal.LegalNotice[]>([]),
  localEnabled = ref(false),
  refreshing = ref(false);
const nativeNotifications = Boolean(window.dalalyConfig?.notifyLegalTask);
const unread = computed(() => notices.value.filter((n) => !n.read_at));
type NoticeLocation = Exclude<
  NonNullable<InstanceType<typeof VMenu>["$props"]["locationStrategy"]>,
  string
>;
// Keep this fixed-toolbar flyout in viewport coordinates. The connected RTL
// strategy can place it outside the screen after dialog overlays close.
const noticeLocation: NoticeLocation = (data, _props, styles) => {
  const updateLocation = () => {
    const target = data.target.value;
    if (!target || Array.isArray(target) || !data.contentEl.value) return;
    const box = target.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const width = Math.min(380, Math.max(0, viewportWidth - 24));
    const start = data.isRtl.value ? box.left : box.right - width;
    const left = Math.min(
      Math.max(12, start),
      Math.max(12, viewportWidth - width - 12),
    );
    const top = Math.max(12, box.bottom + 8);
    styles.value = {
      position: "fixed",
      left: `${left}px`,
      right: "auto",
      top: `${top}px`,
      width: `${width}px`,
      maxWidth: `${width}px`,
      maxHeight: `${Math.max(0, viewportHeight - top - 12)}px`,
      overflowY: "auto",
      transformOrigin: data.isRtl.value ? "top left" : "top right",
    };
  };
  const stop = watch(
    [data.target, data.contentEl, data.isRtl],
    () => {
      void nextTick(updateLocation);
    },
    { immediate: true },
  );
  onScopeDispose(stop);
  return { updateLocation };
};
const preferenceKey = () =>
  `dalaly.legal-notifications.${currentUser.value?.id ?? 0}`;
const groups = computed(() => {
  const map = new Map<string, { title: string; items: legal.LegalNotice[] }>();
  for (const n of notices.value) {
    const key = `${n.contract_type}:${n.property_type}:${n.kind}`;
    const group = map.get(key) ?? {
      title: `${n.contract_type === "rental" ? "إيجار" : "بيع"} · ${legal.propertyScopes.find((p) => p.value === n.property_type)?.title ?? n.property_type} · ${n.kind === "overdue" ? "متأخر" : "موعد قريب"}`,
      items: [],
    };
    group.items.push(n);
    map.set(key, group);
  }
  return [...map.values()];
});
async function refresh() {
  if (!can("legal_content.read") || refreshing.value) return;
  refreshing.value = true;
  const actorId = currentUser.value?.id;
  try {
    const result = await legal.notifications();
    if (actorId !== currentUser.value?.id) return;
    notices.value = result;
    const key = preferenceKey() + ".seen";
    const seen: number[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    const fresh = result.filter((n) => !n.read_at && !seen.includes(n.id));
    if (
      localEnabled.value &&
      fresh.length &&
      window.dalalyConfig?.notifyLegalTask
    ) {
      const response = await window.dalalyConfig.notifyLegalTask({
        title: "متابعة الصيغ القانونية",
        body: `${fresh.length} تنبيه جديد لطلبات تحتاج إجراء. افتح تنبيهات التطبيق للاطلاع.`,
      });
      if (response.ok)
        localStorage.setItem(
          key,
          JSON.stringify([...seen, ...fresh.map((n) => n.id)].slice(-300)),
        );
    }
  } catch {
    /* Keep stored notices visible while the local API reconnects. */
  } finally {
    refreshing.value = false;
  }
}
async function open(notice: legal.LegalNotice) {
  try {
    await legal.readNotice(notice.id);
  } catch (e) {
    notifyError(getErrorMessage(e));
    return;
  }
  notice.read_at = new Date().toISOString();
  await router.push({
    path: "/settings/legal-content",
    query: {
      contract_type: notice.contract_type,
      property_type: notice.property_type,
    },
  });
}
async function readAll() {
  const current = [...unread.value];
  const results = await Promise.allSettled(
    current.map((n) => legal.readNotice(n.id)),
  );
  results.forEach((result, i) => {
    if (result.status === "fulfilled")
      current[i].read_at = new Date().toISOString();
  });
  await refresh();
}
watch(localEnabled, (value) => {
  localStorage.setItem(preferenceKey(), String(value));
});
watch(
  () => currentUser.value?.id,
  () => {
    notices.value = [];
    localEnabled.value = localStorage.getItem(preferenceKey()) === "true";
    void refresh();
  },
);
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  localEnabled.value = localStorage.getItem(preferenceKey()) === "true";
  void refresh();
  timer = setInterval(() => void refresh(), 60000);
  window.addEventListener("dalaly:legal-content-changed", refresh);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  window.removeEventListener("dalaly:legal-content-changed", refresh);
});
</script>
<template>
  <v-menu
    v-if="can('legal_content.read')"
    :close-on-content-click="false"
    location="bottom end"
    :location-strategy="noticeLocation"
  >
    <template #activator="{ props }"
      ><v-btn
        v-bind="props"
        icon
        variant="text"
        aria-label="تنبيهات الصيغ القانونية"
        title="تنبيهات الصيغ القانونية"
        ><v-badge
          :model-value="unread.length > 0"
          :content="unread.length"
          color="warning"
          ><v-icon icon="mdi-bell-outline" /></v-badge></v-btn
    ></template>
    <v-card
      width="380"
      max-width="calc(100vw - 24px)"
      max-height="520"
      class="legal-notices"
      ><v-card-title class="text-subtitle-1"
        >تنبيهات الصيغ القانونية</v-card-title
      ><v-card-text class="py-0"
        ><p v-if="!groups.length" class="text-medium-emphasis py-4">
          لا توجد مواعيد قريبة أو متأخرة تحتاج إجراء.
        </p>
        <v-list v-else density="compact"
          ><template v-for="group in groups" :key="group.title"
            ><v-list-subheader
              >{{ group.title }} · {{ group.items.length }}</v-list-subheader
            ><v-list-item
              v-for="notice in group.items"
              :key="notice.id"
              :title="notice.title"
              :subtitle="
                new Date(notice.target_at).toLocaleString('ar-IQ', {
                  timeZone: 'Asia/Baghdad',
                })
              "
              :prepend-icon="notice.read_at ? 'mdi-check' : 'mdi-circle-small'"
              @click="open(notice)" /></template></v-list
        ><v-switch
          v-if="nativeNotifications"
          v-model="localEnabled"
          label="إشعارات سطح المكتب"
          density="compact"
          hide-details /></v-card-text
      ><v-card-actions
        ><v-btn variant="text" :disabled="!unread.length" @click="readAll"
          >تعليم الكل كمقروء</v-btn
        ><v-spacer /><v-btn
          icon="mdi-refresh"
          variant="text"
          aria-label="تحديث التنبيهات"
          @click="refresh" /></v-card-actions
    ></v-card>
  </v-menu>
</template>
<style scoped>
.legal-notices {
  overflow: auto;
}
</style>
