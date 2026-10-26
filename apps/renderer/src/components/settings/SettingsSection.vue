<script setup lang="ts">
import { useId } from "vue";

/**
 * قسم داخل لوح الإعدادات: عنوان ووصف قصير وأوامر القسم في سطر واحد، ثم
 * محتواه. الأقسام تفصلها خطوط رفيعة، فلا بطاقة فوق بطاقة.
 */
defineProps<{ title: string; description?: string }>();
const id = useId();
</script>

<template>
  <section class="settings-section" :aria-labelledby="id">
    <header class="settings-section__head">
      <div class="settings-section__titles">
        <h2 :id="id" class="dal-section-title">{{ title }}</h2>
        <p v-if="description" class="settings-section__desc">
          {{ description }}
        </p>
      </div>
      <div v-if="$slots.actions" class="settings-section__actions">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.settings-section {
  padding: 12px 16px 16px;
  border-bottom: 1px solid var(--dal-stroke);
}
.settings-section:last-child {
  border-bottom: 0;
}
.settings-section__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 16px;
  margin-bottom: 12px;
}
.settings-section__titles {
  flex: 1 1 260px;
  min-width: 0;
}
.settings-section__titles h2 {
  margin: 0;
}
.settings-section__desc {
  margin: 2px 0 0;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
.settings-section__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
