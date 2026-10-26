<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useThemeMode } from "../../composables/useThemeMode";
import {
  useAppearance,
  colorFields,
  fontOptions,
  fontSizes,
  type AppearanceMode,
} from "../../composables/useAppearance";
import type { AppearanceColors } from "../../plugins/theme";
import SettingsSection from "./SettingsSection.vue";

/**
 * المظهر على هذا الجهاز: الوضع ولوحات الألوان الجاهزة أولاً، ثم الخط وعرض
 * المحتوى، والألوان المخصّصة تحت «متقدم» مع معاينتها. التغييرات فورية.
 */
const { isDark, toggle } = useThemeMode();
const { appearance, resetColors, resetAll } = useAppearance();
const editMode = ref<AppearanceMode>(
  isDark.value ? "dalalyDark" : "dalalyLight",
);
watch(isDark, (value) => {
  editMode.value = value ? "dalalyDark" : "dalalyLight";
});
const colors = computed(() => appearance.colors[editMode.value]);
const modeLabel = computed(() =>
  editMode.value === "dalalyDark" ? "الداكن" : "الفاتح",
);
const presets = [
  { label: "دلالي", key: "default", color: "#116466" },
  { label: "أزرق هادئ", key: "blue", color: "#315F9A" },
  { label: "زيتوني", key: "olive", color: "#52683F" },
];
function applyPreset(key: string) {
  resetColors(editMode.value);
  if (key === "default") return;
  const dark = editMode.value === "dalalyDark";
  Object.assign(
    colors.value,
    key === "blue"
      ? {
          primary: dark ? "#94B8EE" : "#315F9A",
          secondary: dark ? "#253750" : "#E8EEF7",
          accent: dark ? "#E7BE89" : "#916320",
          sidebar: "#1B2E49",
        }
      : {
          primary: dark ? "#B2CD92" : "#52683F",
          secondary: dark ? "#303D2A" : "#EBEFE6",
          accent: dark ? "#E7B396" : "#9B6040",
          sidebar: "#283B2C",
        },
  );
}
function setColor(key: keyof AppearanceColors, value: unknown) {
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
    colors.value[key] = value;
}
</script>

<template>
  <div class="appearance-settings">
    <SettingsSection
      title="الوضع والألوان"
      description="تُطبّق التغييرات فوراً وتُحفظ على هذا الجهاز وحده."
    >
      <div class="appearance-row">
        <span class="appearance-label">الوضع</span>
        <v-btn-toggle
          :model-value="isDark ? 'dark' : 'light'"
          color="primary"
          mandatory
          divided
          density="comfortable"
          variant="outlined"
          aria-label="وضع المظهر"
          @update:model-value="($event === 'dark') !== isDark && toggle()"
        >
          <v-btn value="light" prepend-icon="mdi-white-balance-sunny"
            >فاتح</v-btn
          >
          <v-btn value="dark" prepend-icon="mdi-weather-night">داكن</v-btn>
        </v-btn-toggle>
      </div>
      <div class="appearance-row">
        <span class="appearance-label">لوحة الألوان</span>
        <div class="appearance-presets" role="group" aria-label="لوحات الألوان">
          <v-btn
            v-for="preset in presets"
            :key="preset.key"
            variant="tonal"
            @click="applyPreset(preset.key)"
            ><span
              class="appearance-dot"
              :style="{ backgroundColor: preset.color }"
              aria-hidden="true"
            />{{ preset.label }}</v-btn
          >
        </div>
        <span class="appearance-hint">تُطبَّق على المظهر {{ modeLabel }}.</span>
      </div>
    </SettingsSection>

    <SettingsSection title="الخط وحجم النص">
      <div class="appearance-pair">
        <v-select
          v-model="appearance.font"
          label="نوع الخط"
          :items="fontOptions"
          hide-details
        />
        <v-select
          v-model="appearance.fontSize"
          label="حجم النص"
          :items="fontSizes"
          hide-details
        />
      </div>
      <p class="appearance-hint mt-2">
        الخطوط العربية مضمّنة وتعمل دون اتصال. ومن خطوط النظام نفسه:
        <bdi>Segoe UI</bdi>، <bdi>Tahoma</bdi>.
      </p>
    </SettingsSection>

    <SettingsSection
      title="عرض المحتوى"
      description="على الشاشات العريضة يمكن حصر المحتوى في عرض أقصى أسهل للقراءة."
    >
      <v-switch
        v-model="appearance.fluid"
        label="عرض المحتوى بكامل عرض النافذة"
        color="primary"
        hide-details
      />
      <div v-if="!appearance.fluid" class="appearance-width">
        <div class="appearance-width__label">
          <span>الحد الأقصى للعرض</span>
          <bdi>{{ appearance.maxWidth }} px</bdi>
        </div>
        <v-slider
          v-model="appearance.maxWidth"
          aria-label="الحد الأقصى لعرض المحتوى"
          :min="960"
          :max="1920"
          :step="80"
          color="primary"
          thumb-label
          hide-details
        />
      </div>
    </SettingsSection>

    <SettingsSection title="متقدم">
      <v-expansion-panels variant="accordion" flat class="appearance-advanced">
        <v-expansion-panel>
          <v-expansion-panel-title>ألوان مخصّصة</v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="appearance-row">
              <v-select
                v-model="editMode"
                label="المظهر المراد تخصيصه"
                :items="[
                  { title: 'المظهر الفاتح', value: 'dalalyLight' },
                  { title: 'المظهر الداكن', value: 'dalalyDark' },
                ]"
                hide-details
                class="appearance-mode-select"
              />
              <v-btn
                variant="text"
                prepend-icon="mdi-restore"
                @click="resetColors(editMode)"
                >استعادة ألوان المظهر {{ modeLabel }}</v-btn
              >
            </div>
            <div class="color-grid">
              <v-menu
                v-for="field in colorFields"
                :key="field.key"
                :close-on-content-click="false"
                location="bottom"
              >
                <template #activator="{ props }"
                  ><v-btn
                    v-bind="props"
                    class="color-field"
                    variant="outlined"
                    :aria-label="`${field.label}: ${colors[field.key]}`"
                    ><span
                      class="color-swatch"
                      :style="{ backgroundColor: colors[field.key] }"
                      aria-hidden="true" /><span class="color-field__text"
                      >{{ field.label }}<bdi>{{ colors[field.key] }}</bdi></span
                    ><v-spacer /><v-icon
                      icon="mdi-chevron-down"
                      size="18"
                      aria-hidden="true" /></v-btn
                ></template>
                <v-sheet border rounded="lg" class="color-picker">
                  <div class="dal-section-title color-picker__title">
                    {{ field.label }}
                  </div>
                  <v-color-picker
                    :model-value="colors[field.key]"
                    mode="hex"
                    :modes="['hex']"
                    hide-mode-switch
                    flat
                    @update:model-value="setColor(field.key, $event)"
                  />
                </v-sheet>
              </v-menu>
            </div>
            <div class="appearance-label mt-4 mb-2">معاينة</div>
            <v-theme-provider :theme="editMode" with-background>
              <v-sheet
                class="appearance-preview"
                color="background"
                rounded="lg"
              >
                <v-sheet color="sidebar" class="preview-nav" rounded="lg">
                  <v-icon icon="mdi-home-city-outline" size="24" />
                  <strong>دلالي</strong>
                </v-sheet>
                <v-sheet class="preview-content" border rounded="lg">
                  <strong>مساحة عملك</strong>
                  <p>ألوان واضحة ونص مقروء لتنظيم عروض المكتب.</p>
                  <div class="d-flex flex-wrap ga-2">
                    <v-btn color="primary" variant="flat" size="small"
                      >إجراء أساسي</v-btn
                    >
                    <v-btn color="secondary" variant="flat" size="small"
                      >إجراء ثانوي</v-btn
                    >
                    <v-chip color="accent" variant="tonal" size="small" label
                      >تمييز</v-chip
                    >
                  </div>
                </v-sheet>
              </v-sheet>
            </v-theme-provider>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
      <div class="mt-3">
        <v-btn variant="text" prepend-icon="mdi-restore" @click="resetAll"
          >استعادة إعدادات المظهر الافتراضية كلها</v-btn
        >
      </div>
    </SettingsSection>
  </div>
</template>

<style scoped>
.appearance-advanced {
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
  overflow: hidden;
}
.appearance-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 12px;
}
.appearance-row:last-child {
  margin-bottom: 0;
}
.appearance-label {
  min-width: 88px;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
}
.appearance-hint {
  margin: 0;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.appearance-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.appearance-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-inline-end: 8px;
  border-radius: 50%;
}
.appearance-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 320px));
  gap: 12px 16px;
}
.appearance-width {
  max-width: 480px;
  margin-top: 8px;
}
.appearance-width__label {
  display: flex;
  justify-content: space-between;
  font-size: calc(13px * var(--dal-font-scale));
}
.appearance-mode-select {
  flex: 0 1 260px;
}
.color-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.color-field {
  justify-content: flex-start;
  height: auto;
  min-height: 52px;
  padding: 8px 12px;
  text-align: start;
}
.color-field :deep(.v-btn__content) {
  width: 100%;
  gap: 12px;
}
.color-field__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  font-weight: 600;
}
.color-swatch {
  width: 24px;
  height: 24px;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-control);
  flex: 0 0 auto;
}
.color-field bdi {
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 400;
}
.color-picker {
  padding: 8px;
}
.color-picker__title {
  padding: 4px 8px 8px;
}
.appearance-preview {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--dal-stroke);
}
.preview-nav {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 8px;
}
.preview-content {
  display: grid;
  gap: 8px;
  padding: 12px 16px;
}
.preview-content p {
  margin: 0;
  font-size: calc(13px * var(--dal-font-scale));
}
@media (max-width: 900px) {
  .color-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 540px) {
  .color-grid,
  .appearance-pair,
  .appearance-preview {
    grid-template-columns: 1fr;
  }
}
</style>
