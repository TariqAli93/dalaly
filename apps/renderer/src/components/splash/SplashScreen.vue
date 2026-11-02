<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
type Stage = { progress?: number; message?: string; isError?: boolean };
type SplashAPI = {
  onProgress: (callback: (stage: Stage) => void) => () => void;
  getVersion: () => Promise<string>;
  getProgress: () => Promise<Stage>;
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
  { label: "إدارة الإيجارات", icon: "mdi-key-chain" },
  { label: "إدارة الزبائن", icon: "mdi-account-group" },
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
    ?.getProgress()
    .then(receive)
    .catch(() => undefined);
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
  <!-- غلاف دليل الهوية مصغّراً (465×300): الاسم بالكوفي على ليل دجلة، سطر
       الوصف بالطابوق، قاعدة نحاسية، وشريط الزقّورة أسفل منطقة التحميل. -->
  <v-app class="splash-app" dir="rtl">
    <v-sheet class="splash-window" rounded="0">
      <section class="splash-upper" aria-label="دلالي لإدارة العروض العقارية">
        <div class="branding">
          <h1>دلالي</h1>
          <p>إدارة العروض العقارية</p>
          <span class="branding__rule" aria-hidden="true" />
        </div>
        <div class="feature-grid">
          <div v-for="feature in features" :key="feature.label" class="feature">
            <span class="feature-icon"
              ><v-icon :icon="feature.icon" size="22" /></span
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
          bg-color="#F4EFE6"
          bg-opacity="0.14"
          height="2"
          location="bottom"
          :aria-label="message"
          class="startup-progress"
        />
      </section>
      <v-sheet class="information-panel" color="#0A2028" rounded="0">
        <div v-if="failed" class="startup-error" role="alert">
          <p>{{ message }}</p>
          <div class="recovery-actions">
            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-refresh"
              @click="retry"
              >إعادة المحاولة</v-btn
            ><v-btn size="small" variant="text" @click="api?.openLogs()"
              >فتح السجلات</v-btn
            ><v-btn size="small" variant="text" @click="api?.quit()"
              >خروج</v-btn
            >
          </div>
        </div>
        <div v-else class="benefit-grid">
          <div v-for="benefit in benefits" :key="benefit.label" class="benefit">
            <v-icon :icon="benefit.icon" size="18" /><span>{{
              benefit.label
            }}</span>
          </div>
        </div>
      </v-sheet>
    </v-sheet>
  </v-app>
</template>
<style scoped>
/* شاشة البدء نافذة مستقلة بلا ثيم التطبيق: ألوان الهوية مكتوبة هنا كما هي
   في الدليل (ليل دجلة، الحجر الجيري، الطابوق، النحاس). */
.splash-app {
  background: transparent;
  color: #f4efe6;
  font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif;
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
  background: #0e2a33;
  color: #f4efe6;
  border: 1px solid #0a2028;
}
/* شريط الزقّورة فوق سطر التحميل مباشرة، فلا يمرّ النص فوق النقش. */
.splash-upper {
  position: relative;
  flex: 1;
  min-height: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='48'%3E%3Cg fill='%23B8924F'%3E%3Crect x='8' y='34' width='40' height='6' fill-opacity='.22'/%3E%3Crect x='16' y='24' width='24' height='6' fill-opacity='.22'/%3E%3Crect x='24' y='14' width='8' height='6' fill-opacity='.4'/%3E%3C/g%3E%3C/svg%3E");
  background-repeat: repeat-x;
  background-size: 28px 24px;
  background-position: center bottom 20px;
}
.branding {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-top: 22px;
}
.branding h1 {
  margin: 0;
  font-family: "Reem Kufi", "IBM Plex Sans Arabic", sans-serif;
  font-size: 42px;
  font-weight: 600;
  line-height: 1.25;
  color: #f4efe6;
}
.branding p {
  margin: 0;
  font-size: 15px;
  font-weight: 400;
  line-height: 1.5;
  color: #d4bf9a;
}
.branding__rule {
  width: 40px;
  height: 2px;
  margin-top: 10px;
  background: #b8924f;
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
  margin-top: 14px;
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
  width: 40px;
  height: 40px;
  color: #b8924f;
  border: 1px solid rgba(244, 239, 230, 0.18);
}
.feature span {
  font-size: 11px;
  font-weight: 500;
}
.loading-status {
  position: absolute;
  bottom: 5px;
  inset-inline: 8px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  /* مرحلة التشغيل تحمل معنى: أصغر حجم مقروء في نافذة 465×300. */
  font-size: 11px;
  line-height: 1.25;
  color: #d4bf9a;
}
.startup-progress {
  position: absolute;
  bottom: 0;
}
.information-panel {
  color: #d4bf9a;
  border-top: 1px solid #b8924f;
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
  gap: 6px;
}
.benefit .v-icon {
  color: #b8924f;
}
.benefit span {
  color: #d4bf9a;
  font-size: 10px;
  line-height: 1.55;
  white-space: nowrap;
}
.startup-error {
  padding: 6px 10px;
  text-align: center;
  color: #f4efe6;
}
/* شاشة الاسترداد تُقرأ تحت ضغط: نص 13px وأزرار بحجمها. */
.startup-error p {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.6;
}
.recovery-actions {
  display: flex;
  justify-content: center;
  gap: 6px;
}
.recovery-actions .v-btn {
  font: inherit;
  font-size: 13px;
  letter-spacing: 0;
}
@media (prefers-reduced-motion: reduce) {
  .startup-progress :deep(.v-progress-linear__determinate) {
    transition: none;
  }
}
</style>
