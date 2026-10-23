<script setup lang="ts">
import ListingImage from "../shared/ListingImage.vue";
import { computed, onMounted, ref } from "vue";
import type { RentalImage } from "../../types";
import * as rentals from "../../services/rentals.service";
import { getErrorMessage } from "../../services/api.service";
import { useSnackbar } from "../../composables/useSnackbar";
import { useConfirm } from "../../composables/useConfirm";
import { readFileAsDataUrl } from "../../utils/files";
import { makeThumbnail } from "../../utils/thumbnails";
const props = defineProps<{
  rentalId: number;
  canManage?: boolean;
}>();
const { notifySuccess, notifyError } = useSnackbar();
const { openConfirm } = useConfirm();
const images = ref<RentalImage[]>([]);
const activeImageId = ref<number | null>(null);
const primaryImage = computed(
  () =>
    images.value.find((image) => image.is_primary) ?? images.value[0] ?? null,
);
const activeImage = computed(
  () =>
    images.value.find((image) => image.id === activeImageId.value) ??
    primaryImage.value,
);
const loading = ref(false);
const uploading = ref(false);
const input = ref<HTMLInputElement | null>(null);
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
    // كل صورة في طلب منفصل، ومعها مصغّرتها لجدول الإيجارات.
    for (const file of files)
      await rentals.uploadRentalImages(props.rentalId, [
        {
          data: await readFileAsDataUrl(file),
          original_name: file.name,
          thumbnail: await makeThumbnail(file),
        },
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
    <ListingImage
      v-if="activeImage"
      :src="imageUrl(activeImage)"
      class="rental-gallery-primary"
      alt="صورة العقار الإيجاري"
    />
    <div v-if="images.length" class="rental-gallery">
      <div
        v-for="image in images"
        :key="image.id"
        class="rental-image"
        :class="{ primary: image.id === activeImage?.id }"
      >
        <button
          type="button"
          :aria-label="`عرض الصورة ${images.indexOf(image) + 1}`"
          :aria-pressed="image.id === activeImage?.id"
          @click="activeImageId = image.id"
        >
          <ListingImage :src="imageUrl(image)" alt="صورة الإيجار" />
        </button>
        <div v-if="canManage" class="rental-image__actions">
          <v-btn
            v-if="!image.is_primary"
            icon="mdi-star-outline"
            size="x-small"
            color="warning"
            aria-label="تعيين صورة رئيسية"
            title="تعيين صورة رئيسية"
            @click="primary(image)"
          /><v-icon v-else icon="mdi-star" color="warning" /><v-btn
            icon="mdi-delete-outline"
            size="x-small"
            color="error"
            aria-label="حذف الصورة"
            title="حذف الصورة"
            @click="remove(image)"
          />
        </div>
      </div>
    </div>
    <v-empty-state
      v-else-if="!loading"
      icon="mdi-image-off-outline"
      title="لا توجد صور للعقار"
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
.rental-gallery-primary {
  width: 100%;
  height: 280px;
  object-fit: cover;
  border-radius: 10px;
  margin-bottom: 10px;
}
.rental-image > button {
  width: 100%;
  height: 100%;
  display: block;
}
.rental-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.rental-image {
  position: relative;
  border: 2px solid transparent;
  aspect-ratio: 4/3;
  overflow: hidden;
  border-radius: 8px;
}

.rental-image.primary {
  border-color: rgb(var(--v-theme-primary));
}

.rental-image :deep(.v-img) {
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
  border-radius: 6px;
}
</style>
