<script setup lang="ts">
/**
 * شريط حفظ ثابت أسفل نموذج الصفحة: الحفظ ظاهر دائماً مهما طال النموذج، ومعه
 * إلغاء وحالة «تعديلات غير محفوظة». زر الحفظ type=submit داخل v-form، فيعمل
 * Enter كذلك. الترتيب: الأساسي أولاً في اتجاه القراءة، والمجموعة في الطرف.
 */
defineProps<{ saving?: boolean; dirty?: boolean; saveLabel?: string }>();
const emit = defineEmits<{ cancel: [] }>();
</script>

<template>
  <div class="form-actions">
    <span v-if="dirty" class="form-actions__state" role="status">
      <v-icon icon="mdi-circle" size="8" color="warning" aria-hidden="true" />
      تعديلات غير محفوظة
    </span>
    <v-spacer />
    <v-btn
      color="primary"
      type="submit"
      :loading="saving"
      prepend-icon="mdi-content-save-outline"
      title="حفظ (Ctrl+S)"
      aria-keyshortcuts="Control+S"
      >{{ saveLabel ?? "حفظ" }}</v-btn
    >
    <v-btn variant="text" :disabled="saving" @click="emit('cancel')"
      >إلغاء</v-btn
    >
  </div>
</template>

<style scoped>
.form-actions {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  padding: 8px 16px;
  border-top: 1px solid var(--dal-stroke);
  background: rgb(var(--v-theme-surface));
  border-end-start-radius: var(--dal-radius-card);
  border-end-end-radius: var(--dal-radius-card);
}
.form-actions__state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dal-muted);
  font-size: calc(13px * var(--dal-font-scale));
}
</style>
