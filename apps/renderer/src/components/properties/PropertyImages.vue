<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as imagesService from "../../services/images.service";
import { getErrorMessage } from "../../services/api.service";
import { useSnackbar } from "../../composables/useSnackbar";
import { useConfirm } from "../../composables/useConfirm";
import type { PropertyImage } from "../../types";

const props = defineProps<{ propertyId: number; canManage?: boolean }>();

const { notifySuccess, notifyError } = useSnackbar();
const { openConfirm } = useConfirm();

const images = ref<PropertyImage[]>([]);
const loading = ref(false);
const uploading = ref(false);
const pending = ref<Array<{ name: string; dataUrl: string }>>([]);
const dragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

let dragIndex = -1;

const primaryImage = computed(
  () => images.value.find((i) => i.is_primary) ?? images.value[0] ?? null,
);

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function imageUrl(image: PropertyImage) {
  return imagesService.imageFileUrl(props.propertyId, image.id);
}

async function load() {
  loading.value = true;
  try {
    images.value = await imagesService.listImages(props.propertyId);
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function addFiles(files: File[]) {
  const imageFiles = files.filter((f) => f.type.startsWith("image/"));
  for (const file of imageFiles) {
    const dataUrl = await fileToDataUrl(file);
    pending.value.push({ name: file.name, dataUrl });
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) void addFiles([...input.files]);
  input.value = "";
}

function onDrop(event: DragEvent) {
  dragOver.value = false;
  if (event.dataTransfer?.files?.length) {
    void addFiles([...event.dataTransfer.files]);
  }
}

function onPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items;
  if (!items) return;
  const files: File[] = [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length) void addFiles(files);
}

function removePending(index: number) {
  pending.value.splice(index, 1);
}

async function uploadPending() {
  if (!pending.value.length) return;
  uploading.value = true;
  try {
    // رفع كل صورة في طلب منفصل لتفادي حدود حجم الطلب.
    for (const item of pending.value) {
      await imagesService.uploadImages(props.propertyId, [
        { data: item.dataUrl, original_name: item.name },
      ]);
    }
    pending.value = [];
    await load();
    notifySuccess("تم رفع الصور.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    uploading.value = false;
  }
}

async function setPrimary(image: PropertyImage) {
  try {
    images.value = await imagesService.setPrimaryImage(props.propertyId, image.id);
    notifySuccess("تم تعيين الصورة الرئيسية.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function askDelete(image: PropertyImage) {
  openConfirm({
    title: "حذف الصورة",
    body: "سيتم حذف الصورة نهائياً من القرص وقاعدة البيانات.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await imagesService.deleteImage(props.propertyId, image.id);
      await load();
      notifySuccess("تم حذف الصورة.");
    },
  });
}

function onDragStart(index: number) {
  dragIndex = index;
}

async function onDropReorder(index: number) {
  if (dragIndex < 0 || dragIndex === index) return;
  const next = [...images.value];
  const [moved] = next.splice(dragIndex, 1);
  next.splice(index, 0, moved);
  images.value = next;
  dragIndex = -1;
  try {
    images.value = await imagesService.reorderImages(
      props.propertyId,
      next.map((i) => i.id),
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
    await load();
  }
}

watch(() => props.propertyId, load);
onMounted(() => {
  window.addEventListener("paste", onPaste);
  void load();
});
onBeforeUnmount(() => window.removeEventListener("paste", onPaste));
</script>

<template>
  <div>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

    <!-- معرض الصور -->
    <div v-if="primaryImage" class="gallery">
      <img :src="imageUrl(primaryImage)" class="gallery-primary" alt="صورة العقار" />
      <div v-if="images.length" class="thumbs">
        <div
          v-for="(image, index) in images"
          :key="image.id"
          class="thumb-wrap"
          :class="{ 'thumb-active': image.is_primary }"
          :draggable="canManage"
          @dragstart="onDragStart(index)"
          @dragover.prevent
          @drop.prevent="onDropReorder(index)"
        >
          <img :src="imageUrl(image)" class="thumb" alt="" @click="setPrimary(image)" />
          <div v-if="canManage" class="thumb-actions">
            <v-btn
              v-if="!image.is_primary"
              icon="mdi-star-outline"
              size="x-small"
              variant="flat"
              color="amber"
              title="تعيين رئيسية"
              @click="setPrimary(image)"
            />
            <v-icon v-else icon="mdi-star" color="amber" size="small" />
            <v-btn
              icon="mdi-delete-outline"
              size="x-small"
              variant="flat"
              color="error"
              title="حذف"
              @click="askDelete(image)"
            />
          </div>
        </div>
      </div>
    </div>
    <v-empty-state
      v-else-if="!loading"
      icon="mdi-image-multiple-outline"
      title="لا توجد صور"
      text="أضف صوراً للعقار."
    />

    <!-- منطقة الرفع -->
    <template v-if="canManage">
      <div
        class="dropzone"
        :class="{ 'dropzone-over': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
        @click="fileInput?.click()"
      >
        <v-icon icon="mdi-cloud-upload-outline" size="32" />
        <div class="text-body-2 mt-1">
          اسحب وأفلت الصور هنا، أو الصق صورة (Ctrl+V)، أو اضغط للاختيار
        </div>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          hidden
          @change="onFileChange"
        />
      </div>

      <!-- معاينة قبل الحفظ -->
      <div v-if="pending.length" class="pending mt-3">
        <div class="text-subtitle-2 mb-2">معاينة قبل الرفع ({{ pending.length }})</div>
        <div class="thumbs">
          <div v-for="(item, index) in pending" :key="index" class="thumb-wrap">
            <img :src="item.dataUrl" class="thumb" alt="" />
            <div class="thumb-actions">
              <v-btn
                icon="mdi-close"
                size="x-small"
                variant="flat"
                color="error"
                @click="removePending(index)"
              />
            </div>
          </div>
        </div>
        <div class="d-flex justify-end mt-2 ga-2">
          <v-btn variant="text" @click="pending = []">إلغاء</v-btn>
          <v-btn
            color="primary"
            :loading="uploading"
            prepend-icon="mdi-upload"
            @click="uploadPending"
          >
            رفع {{ pending.length }} صورة
          </v-btn>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gallery-primary {
  width: 100%;
  max-height: 360px;
  object-fit: contain;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.thumb-wrap {
  position: relative;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
}
.thumb-active {
  border-color: rgb(var(--v-theme-primary));
}
.thumb {
  width: 84px;
  height: 84px;
  object-fit: cover;
  cursor: pointer;
  display: block;
}
.thumb-actions {
  position: absolute;
  inset-block-start: 2px;
  inset-inline-end: 2px;
  display: flex;
  gap: 2px;
}
.dropzone {
  margin-top: 14px;
  border: 2px dashed rgba(var(--v-theme-on-surface), 0.3);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s;
}
.dropzone-over {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.06);
}
</style>
