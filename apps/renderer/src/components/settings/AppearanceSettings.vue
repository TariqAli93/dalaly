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
const { isDark, toggle } = useThemeMode();
const { appearance, resetColors, resetAll } = useAppearance();
const editMode = ref<AppearanceMode>(
  isDark.value ? "dalalyDark" : "dalalyLight",
);
watch(isDark, (value) => {
  editMode.value = value ? "dalalyDark" : "dalalyLight";
});
const colors = computed(() => appearance.colors[editMode.value]);
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
    <v-card variant="flat" border>
      <v-card-title>المظهر العام</v-card-title>
      <v-card-text>
        <p class="text-medium-emphasis mb-4">
          تُطبّق التغييرات فوراً وتُحفظ على هذا الجهاز.
        </p>
        <v-btn-toggle
          :model-value="isDark ? 'dark' : 'light'"
          color="primary"
          mandatory
          divided
          variant="text"
          aria-label="وضع المظهر"
          @update:model-value="($event === 'dark') !== isDark && toggle()"
        >
          <v-btn
            value="light"
            class="rounded-tl-0"
            prepend-icon="mdi-white-balance-sunny"
            >فاتح</v-btn
          >
          <v-btn
            value="dark"
            class="rounded-tr-0"
            prepend-icon="mdi-weather-night"
            >داكن</v-btn
          >
        </v-btn-toggle>
      </v-card-text>
    </v-card>
    <v-card variant="flat" border>
      <v-card-title class="d-flex flex-wrap align-center ga-2"
        >ألوان المظهر<v-spacer /><v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-restore"
          @click="resetColors(editMode)"
          >استعادة الألوان</v-btn
        ></v-card-title
      >
      <v-card-text>
        <v-select
          v-model="editMode"
          label="لوحة الألوان المراد تخصيصها"
          :items="[
            { title: 'المظهر الفاتح', value: 'dalalyLight' },
            { title: 'المظهر الداكن', value: 'dalalyDark' },
          ]"
          hide-details
          class="mb-4"
        />
        <div class="d-flex flex-wrap ga-2 mb-5">
          <v-btn
            v-for="preset in presets"
            :key="preset.key"
            variant="tonal"
            @click="applyPreset(preset.key)"
            ><v-icon
              icon="mdi-circle"
              :color="preset.color"
              size="16"
              class="me-2"
            />{{ preset.label }}</v-btn
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
                :aria-label="field.label + ' ' + colors[field.key]"
                ><span
                  class="color-swatch"
                  :style="{ backgroundColor: colors[field.key] }"
                  aria-hidden="true" /><span
                  >{{ field.label }}<bdi>{{ colors[field.key] }}</bdi></span
                ><v-spacer /><v-icon icon="mdi-chevron-down" size="18" /></v-btn
            ></template>
            <v-card border
              ><v-card-title class="text-subtitle-2">{{
                field.label
              }}</v-card-title
              ><v-color-picker
                :model-value="colors[field.key]"
                mode="hex"
                :modes="['hex']"
                hide-mode-switch
                @update:model-value="setColor(field.key, $event)"
            /></v-card>
          </v-menu>
        </div>
      </v-card-text>
    </v-card>
    <v-row>
      <v-col cols="12" md="6"
        ><v-card variant="flat" border height="100%"
          ><v-card-title>الخط وحجم النص</v-card-title
          ><v-card-text
            ><v-select
              v-model="appearance.font"
              label="نوع الخط"
              :items="fontOptions"
            /><v-select
              v-model="appearance.fontSize"
              label="حجم النص"
              :items="fontSizes"
              hide-details
            />
            <p class="text-caption text-medium-emphasis mt-3">
              الخطوط العربية مضمّنة للعمل دون اتصال. خطوط النظام تعتمد على
              تثبيتها في الجهاز.
            </p></v-card-text
          ></v-card
        ></v-col
      >
      <v-col cols="12" md="6"
        ><v-card variant="flat" border height="100%"
          ><v-card-title>عرض المحتوى</v-card-title
          ><v-card-text
            ><v-switch
              v-model="appearance.fluid"
              label="عرض المحتوى بكامل الشاشة (Fluid Container)"
              color="primary"
              hide-details
            /><template v-if="!appearance.fluid"
              ><div class="d-flex justify-space-between mt-3">
                <span>الحد الأقصى للعرض</span
                ><bdi>{{ appearance.maxWidth }} px</bdi>
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
            /></template>
            <p class="text-caption text-medium-emphasis mt-3">
              يظل المحتوى متجاوباً عند تصغير نافذة التطبيق.
            </p></v-card-text
          ></v-card
        ></v-col
      >
    </v-row>
    <v-card variant="flat" border
      ><v-card-title>معاينة مباشرة</v-card-title
      ><v-card-text>
        <v-theme-provider :theme="editMode" with-background
          ><v-sheet class="appearance-preview" color="background" rounded="lg"
            ><v-sheet color="sidebar" class="preview-nav" rounded="lg"
              ><v-icon icon="mdi-home-city-outline" size="26" /><strong
                >دلالي</strong
              ><v-btn color="primary" size="small" variant="flat"
                >لوحة التحكم</v-btn
              ></v-sheet
            ><v-card border class="preview-content"
              ><v-card-title>مساحة عملك</v-card-title
              ><v-card-text
                ><p class="mb-4">ألوان واضحة ونص مقروء لتنظيم عروض المكتب.</p>
                <div class="d-flex flex-wrap ga-2">
                  <v-btn color="primary" variant="flat">إجراء أساسي</v-btn
                  ><v-btn color="secondary" variant="flat">إجراء ثانوي</v-btn
                  ><v-chip color="accent" variant="tonal">تمييز</v-chip>
                </div></v-card-text
              ></v-card
            ></v-sheet
          ></v-theme-provider
        > </v-card-text
      ><v-divider /><v-card-actions
        ><v-spacer /><v-btn
          class="appearance-reset"
          prepend-icon="mdi-restore"
          variant="text"
          @click="resetAll"
          >استعادة إعدادات المظهر الافتراضية</v-btn
        ></v-card-actions
      ></v-card
    >
  </div>
</template>

<style scoped>
.appearance-settings {
  display: grid;
  gap: 16px;
}
.appearance-reset {
  max-width: 100%;
  height: auto;
  min-height: 44px;
  padding-block: 8px;
}
.appearance-reset :deep(.v-btn__content) {
  white-space: normal;
}
.color-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.color-field {
  justify-content: flex-start;
  height: auto;
  min-height: 66px;
  padding: 12px;
  text-align: start;
  border-color: var(--dal-stroke);
}
.color-field :deep(.v-btn__content) {
  width: 100%;
  gap: 12px;
}
.color-swatch {
  width: 28px;
  height: 28px;
  border: 1px solid var(--dal-stroke);
  border-radius: 8px;
  flex: 0 0 auto;
}
.color-field bdi {
  display: block;
  color: var(--dal-muted);
  font-size: 0.75rem;
}
.appearance-preview {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
}
.preview-nav {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px 12px;
}
.preview-content {
  align-self: center;
}
@media (max-width: 900px) {
  .color-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 540px) {
  .color-grid {
    grid-template-columns: 1fr;
  }
  .appearance-preview {
    grid-template-columns: 1fr;
  }
  .preview-nav {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
