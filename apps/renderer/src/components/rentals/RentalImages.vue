<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { RentalImage } from "../../types";
import * as rentals from "../../services/rentals.service";
import { getErrorMessage } from "../../services/api.service";
import { useSnackbar } from "../../composables/useSnackbar";
import { useConfirm } from "../../composables/useConfirm";
const props = defineProps<{
  rentalId: number;
  canManage?: boolean;
  primaryOnly?: boolean;
}>();
const { notifySuccess, notifyError } = useSnackbar();
const { openConfirm } = useConfirm();
const images = ref<RentalImage[]>([]);
const primaryImage = computed(
  () => images.value.find((image) => image.is_primary) ?? null,
);
const loading = ref(false);
const uploading = ref(false);
const input = ref<HTMLInputElement | null>(null);
const toDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
async function load() {
  loading.value = true;
  try {
    images.value = await rentals.listRentalImages(props.rentalId);
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    loading.value = false;
  }
}
async function upload(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])].filter(
    (file) => file.type.startsWith("image/"),
  );
  if (!files.length) return;
  uploading.value = true;
  try {
    for (const file of files)
      await rentals.uploadRentalImages(props.rentalId, [
        { data: await toDataUrl(file), original_name: file.name },
      ]);
    await load();
    notifySuccess("تم رفع صور الإيجار.");
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    uploading.value = false;
    (event.target as HTMLInputElement).value = "";
  }
}
function imageUrl(image: RentalImage) {
  return rentals.rentalImageUrl(props.rentalId, image.id);
}
async function primary(image: RentalImage) {
  try {
    images.value = await rentals.setPrimaryRentalImage(
      props.rentalId,
      image.id,
    );
  } catch (e) {
    notifyError(getErrorMessage(e));
  }
}
function remove(image: RentalImage) {
  openConfirm({
    title: "حذف صورة الإيجار",
    body: "سيتم حذف الصورة نهائياً.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      try {
        await rentals.deleteRentalImage(props.rentalId, image.id);
        await load();
        notifySuccess("تم حذف الصورة.");
      } catch (e) {
        notifyError(getErrorMessage(e));
      }
    },
  });
}
onMounted(() => void load());
</script>
<template>
  <div>
    <v-progress-linear
      v-if="loading || uploading"
      indeterminate
      color="primary"
      class="mb-2"
    />
    <div v-if="images.length && !primaryOnly" class="rental-gallery">
      <div
        v-for="image in images"
        :key="image.id"
        class="rental-image"
        :class="{ primary: image.is_primary }"
      >
        <img :src="imageUrl(image)" alt="صورة الإيجار" />
        <div v-if="canManage" class="rental-image__actions">
          <v-btn
            v-if="!image.is_primary"
            icon="mdi-star-outline"
            size="x-small"
            color="warning"
            @click="primary(image)"
          /><v-icon v-else icon="mdi-star" color="warning" /><v-btn
            icon="mdi-delete-outline"
            size="x-small"
            color="error"
            @click="remove(image)"
          />
        </div>
      </div>
    </div>
    <div v-else-if="primaryOnly && primaryImage">
      <div
        v-for="image in [primaryImage]"
        :key="image.id"
        class="rental-image small"
        :class="{ primary: image.is_primary }"
      >
        <img :src="imageUrl(image)" alt="صورة الإيجار" />
        <div v-if="canManage" class="rental-image__actions">
          <v-btn
            v-if="!image.is_primary"
            icon="mdi-star-outline"
            size="x-small"
            color="warning"
            @click="primary(image)"
          /><v-icon v-else icon="mdi-star" color="warning" /><v-btn
            icon="mdi-delete-outline"
            size="x-small"
            color="error"
            @click="remove(image)"
          />
        </div>
      </div>
    </div>
    <v-empty-state
      v-else-if="!loading"
      icon="mdi-image-off-outline"
      title="لا توجد صور"
      text="أضف صوراً لهذا العرض الإيجاري."
    />
    <v-btn
      v-if="canManage"
      variant="tonal"
      prepend-icon="mdi-upload"
      :loading="uploading"
      @click="input?.click()"
      >إضافة صور</v-btn
    ><input
      ref="input"
      hidden
      type="file"
      accept="image/*"
      multiple
      @change="upload"
    />
  </div>
</template>
<style scoped>
.rental-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.rental-image {
  position: relative;
  border: 2px solid transparent;
  aspect-ratio: 4/3;
  overflow: hidden;
}

.rental-image.small {
  max-width: 120px;
  max-height: 100px;
}

.rental-image.primary {
  border-color: rgb(var(--v-theme-primary));
}

.rental-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rental-image__actions {
  position: absolute;
  inset: 4px 4px auto auto;
  display: flex;
  gap: 2px;
  background: rgba(0, 0, 0, 0.45);
  padding: 2px;
}
</style>
