<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import skyline from "../../assets/images/splash-background.png";
type Stage = { progress?: number; message?: string; isError?: boolean };
type SplashAPI = {
  onProgress: (callback: (stage: Stage) => void) => () => void;
  getVersion: () => Promise<string>;
  retry: () => Promise<void>;
  openLogs: () => Promise<void>;
  quit: () => Promise<void>;
};
const api = (window as Window & { splashAPI?: SplashAPI }).splashAPI;
const progress = ref(6);
const message = ref("جارِ تهيئة التطبيق…");
const failed = ref(false);
const version = ref("");
let unsubscribe: (() => void) | undefined;
const features = [
  { label: "تقارير وإحصائيات", icon: "mdi-chart-bar" },
  { label: "إدارة العقود", icon: "mdi-file-document-outline" },
  { label: "إدارة العملاء", icon: "mdi-account-group" },
  { label: "إدارة العقارات", icon: "mdi-home" },
];
const benefits = [
  { label: "مصمم لمكاتب العقار في العراق", icon: "mdi-check-circle" },
  { label: "واجهة حديثة لسطح المكتب", icon: "mdi-monitor" },
  { label: "بيانات محلية وآمنة", icon: "mdi-lock" },
  { label: "سريع وموثوق", icon: "mdi-lightning-bolt" },
];
function receive(stage: Stage) {
  if (stage.progress === 6) {
    progress.value = 6;
    failed.value = false;
  }
  if (typeof stage.progress === "number")
    progress.value = Math.max(progress.value, Math.min(100, stage.progress));
  if (stage.message) message.value = stage.message;
  if (stage.isError) failed.value = true;
}
async function retry() {
  if (!api) return;
  failed.value = false;
  progress.value = 6;
  message.value = "جارِ إعادة المحاولة…";
  try {
    await api.retry();
  } catch {
    failed.value = true;
    message.value =
      "تعذّرت إعادة المحاولة. يمكنك فتح السجلات للاطّلاع على التفاصيل.";
  }
}
onMounted(() => {
  unsubscribe = api?.onProgress(receive);
  void api
    ?.getVersion()
    .then((value) => {
      version.value = value;
    })
    .catch(() => undefined);
});
onBeforeUnmount(() => unsubscribe?.());
</script>
<template>
  <v-app class="splash-app" dir="rtl">
    <v-sheet class="splash-window" rounded="lg">
      <section class="splash-upper" aria-label="دلالي لإدارة العروض العقارية">
        <v-img :src="skyline" alt="" cover class="skyline" eager />
        <div class="branding">
          <h1>دلالي</h1>
          <p>إدارة العروض العقارية</p>
        </div>
        <div class="feature-grid">
          <div v-for="feature in features" :key="feature.label" class="feature">
            <v-sheet class="feature-icon" rounded="lg" elevation="1"
              ><v-icon :icon="feature.icon" size="27" /></v-sheet
            ><span>{{ feature.label }}</span>
          </div>
        </div>
        <div
          v-if="!failed"
          class="loading-status"
          role="status"
          aria-live="polite"
        >
          <span>{{ message }}</span
          ><bdi v-if="version">{{ version }}</bdi>
        </div>
        <v-progress-linear
          v-if="!failed"
          :model-value="progress"
          color="primary"
          height="2"
          location="bottom"
          :aria-label="message"
          class="startup-progress"
        />
      </section>
      <v-sheet class="information-panel" color="#193638" rounded="lg">
        <div v-if="failed" class="startup-error" role="alert">
          <p>{{ message }}</p>
          <div class="recovery-actions">
            <v-btn
              size="x-small"
              variant="tonal"
              prepend-icon="mdi-refresh"
              @click="retry"
              >إعادة المحاولة</v-btn
            ><v-btn size="x-small" variant="text" @click="api?.openLogs()"
              >فتح السجلات</v-btn
            ><v-btn size="x-small" variant="text" @click="api?.quit()"
              >خروج</v-btn
            >
          </div>
        </div>
        <div v-else class="benefit-grid">
          <div v-for="benefit in benefits" :key="benefit.label" class="benefit">
            <v-icon :icon="benefit.icon" size="21" /><span>{{
              benefit.label
            }}</span>
          </div>
        </div>
      </v-sheet>
    </v-sheet>
  </v-app>
</template>
<style scoped>
.splash-app {
  background: transparent;
  color: #193638;
  font-family: Cairo, "Segoe UI", Tahoma, sans-serif;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
.splash-app :deep(.v-application__wrap) {
  min-height: 0;
  height: 100dvh;
}
.splash-window {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  padding: 0px;
  background: #f9fafb;
  border: 1px solid #e4e8ea;
}
.splash-upper {
  position: relative;
  flex: 1;
  min-height: 0;
}
.skyline {
  position: absolute;
  inset: 0;
  opacity: 0.84;
  pointer-events: none;
}
.skyline::after {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.14);
}
.branding {
  position: relative;
  text-align: center;
  padding-top: 29px;
}
.branding h1 {
  margin: 0;
  font-size: 39px;
  font-weight: 800;
  line-height: 1.35;
}
.branding p {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.5;
}
.feature-grid,
.benefit-grid {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  padding-inline: 20px;
}
.feature-grid {
  position: relative;
  margin-top: 19px;
}
.feature,
.benefit {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 5px;
  padding: 6px 10px;
}
.feature-icon {
  display: grid;
  place-items: center;
  width: 50px;
  height: 50px;
  color: #193638;
  border-radius: 13px !important;
  box-shadow: 0 2px 7px rgba(25, 54, 56, 0.12) !important;
}
.feature span {
  font-size: 10px;
  font-weight: 600;
}
.loading-status {
  position: absolute;
  bottom: 3px;
  inset-inline: 8px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 8px;
  line-height: 1.25;
  color: #496367;
}
.startup-progress {
  position: absolute;
  bottom: 0;
  border-radius: 2px;
}
.information-panel {
  margin-top: 5px;
  color: #fff;
  border-radius: 11px !important;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  flex: 0 0 auto;
}
.benefit-grid {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  padding-inline: 20px;
  padding-block: 6px;
  width: 100%;
}
.benefit {
  gap: 7px;
}
.benefit span {
  font-size: 8px;
  line-height: 1.55;
  white-space: nowrap;
}
.startup-error {
  padding: 6px 10px;
  text-align: center;
}
.startup-error p {
  margin: 0 0 4px;
  font-size: 9px;
  line-height: 1.6;
}
.recovery-actions {
  display: flex;
  justify-content: center;
  gap: 6px;
}
.recovery-actions .v-btn {
  font: inherit;
  font-size: 9px;
  letter-spacing: 0;
}
@media (prefers-reduced-motion: reduce) {
  .startup-progress :deep(.v-progress-linear__determinate) {
    transition: none;
  }
}
</style>
