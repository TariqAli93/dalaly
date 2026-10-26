<script setup lang="ts">
import ListingImage from "./ListingImage.vue";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import * as imagesService from "../../services/images.service";
import * as rentalsService from "../../services/rentals.service";
import { getErrorMessage } from "../../services/api.service";
import { useSnackbar } from "../../composables/useSnackbar";
import { useConfirm } from "../../composables/useConfirm";
import type { PropertyImage, RentalImage } from "../../types";
import { readFileAsDataUrl } from "../../utils/files";
import { makeThumbnail } from "../../utils/thumbnails";
import { useThumbnailBackfill } from "../../composables/useThumbnailBackfill";

/**
 * معرض صور العرض، واحد لعروض البيع والإيجار: الصورة المختارة كبيرة وتحتها
 * شريط مصغّرات (المصغّرة لا الأصل)، ومعاينة قبل الرفع بروابط object، ورفع
 * صورة بصورة، وإعادة الترتيب بالسحب أو Ctrl+→/←. kind يختار خدمة الصور.
 */
const props = defineProps<{
  kind: "sale" | "rental";
  listingId: number;
  canManage?: boolean;
}>();

type ListingImageRecord = PropertyImage | RentalImage;
type Upload = {
  data: string;
  original_name?: string;
  thumbnail?: string | null;
};
const SALE = {
  list: imagesService.listImages,
  upload: imagesService.uploadImages,
  setPrimary: imagesService.setPrimaryImage,
  reorder: imagesService.reorderImages,
  remove: imagesService.deleteImage,
  fileUrl: imagesService.imageFileUrl,
  thumbUrl: imagesService.thumbnailUrl,
  saveThumb: imagesService.saveThumbnail,
};
const RENTAL = {
  list: rentalsService.listRentalImages,
  upload: rentalsService.uploadRentalImages,
  setPrimary: rentalsService.setPrimaryRentalImage,
  reorder: rentalsService.reorderRentalImages,
  remove: rentalsService.deleteRentalImage,
  fileUrl: rentalsService.rentalImageUrl,
  thumbUrl: rentalsService.rentalThumbnailUrl,
  saveThumb: rentalsService.saveRentalThumbnail,
};
const api = computed<{
  list: (id: number) => Promise<ListingImageRecord[]>;
  upload: (id: number, images: Upload[]) => Promise<unknown>;
  setPrimary: (id: number, imageId: number) => Promise<ListingImageRecord[]>;
  reorder: (id: number, ids: number[]) => Promise<ListingImageRecord[]>;
  remove: (id: number, imageId: number) => Promise<unknown>;
  fileUrl: (id: number, imageId: number) => string;
  thumbUrl: (id: number, imageId: number) => string;
  saveThumb: (id: number, imageId: number, data: string) => Promise<unknown>;
}>(() => (props.kind === "sale" ? SALE : RENTAL));

const { notifySuccess, notifyError } = useSnackbar();
const { openConfirm } = useConfirm();
const { queueThumbnail } = useThumbnailBackfill();

const images = ref<ListingImageRecord[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const uploading = ref(false);
// المعاينة برابط object لا base64: صورة 12 ميغابكسل كانت تُحمل نصاً بنحو 5MB
// في الذاكرة لكل ملف قبل الرفع. يُقرأ الملف بياناتٍ عند رفعه فقط.
const pending = ref<Array<{ name: string; preview: string; file: File }>>([]);
const dragOver = ref(false);
const activeImageId = ref<number | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const strip = ref<HTMLElement | null>(null);
// مصغّرات تعذّر تحميلها (صور رُفعت قبل المصغّرات): يُعرض أصلها بدلها.
const missingThumbs = reactive(new Set<number>());

let dragIndex = -1;

const primaryImage = computed(
  () => images.value.find((i) => i.is_primary) ?? images.value[0] ?? null,
);
const activeImage = computed(
  () =>
    images.value.find((image) => image.id === activeImageId.value) ??
    primaryImage.value,
);

function imageUrl(image: ListingImageRecord) {
  return api.value.fileUrl(props.listingId, image.id);
}
// شريط المصغّرات يطلب المصغّرة لا الأصل (3–5MB تُفكّ لكل صورة صغيرة).
// صورة بلا مصغّرة يُعرض أصلها، ثم يصنع من يدير الصور مصغّرتها وقت الفراغ كما
// يفعل جدول العروض، فتكون الزيارة التالية خفيفة.
function onThumbLoad(image: ListingImageRecord) {
  if (!missingThumbs.has(image.id) || !props.canManage) return;
  queueThumbnail({
    key: `${props.kind === "sale" ? "property" : "rental"}:${image.id}`,
    source: imageUrl(image),
    save: (data) => api.value.saveThumb(props.listingId, image.id, data),
  });
}
function thumbUrl(image: ListingImageRecord) {
  return missingThumbs.has(image.id)
    ? imageUrl(image)
    : api.value.thumbUrl(props.listingId, image.id);
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    images.value = await api.value.list(props.listingId);
  } catch (error) {
    loadError.value = getErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function addFiles(files: File[]) {
  for (const file of files.filter((f) => f.type.startsWith("image/"))) {
    pending.value.push({
      name: file.name,
      preview: URL.createObjectURL(file),
      file,
    });
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) addFiles([...input.files]);
  input.value = "";
}

function onDrop(event: DragEvent) {
  dragOver.value = false;
  if (event.dataTransfer?.files?.length)
    addFiles([...event.dataTransfer.files]);
}

function onPaste(event: ClipboardEvent) {
  // The pending list is only shown, and uploadable, with manage permission.
  if (!props.canManage) return;
  const items = event.clipboardData?.items;
  if (!items) return;
  const files: File[] = [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length) addFiles(files);
}

function removePending(index: number) {
  const [removed] = pending.value.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.preview);
}
function clearPending() {
  for (const item of pending.value) URL.revokeObjectURL(item.preview);
  pending.value = [];
}

async function uploadPending() {
  if (!pending.value.length || uploading.value) return;
  uploading.value = true;
  let uploaded = 0;
  try {
    // كل صورة في طلب منفصل لتفادي حدود حجم الطلب، ومعها مصغّرتها لجدول
    // العروض. ما رُفع يخرج من القائمة فوراً، فإعادة المحاولة بعد فشل لا تكرّره.
    while (pending.value.length) {
      const item = pending.value[0]!;
      await api.value.upload(props.listingId, [
        {
          data: await readFileAsDataUrl(item.file),
          original_name: item.name,
          thumbnail: await makeThumbnail(item.file),
        },
      ]);
      URL.revokeObjectURL(item.preview);
      pending.value.shift();
      uploaded++;
    }
    notifySuccess(`تم رفع ${uploaded} صورة.`);
  } catch (error) {
    notifyError(
      uploaded
        ? `رُفعت ${uploaded} صورة ثم تعذّر رفع الباقي: ${getErrorMessage(error)}`
        : getErrorMessage(error),
    );
  } finally {
    uploading.value = false;
    if (uploaded) await load();
  }
}

async function setPrimary(image: ListingImageRecord) {
  try {
    images.value = await api.value.setPrimary(props.listingId, image.id);
    notifySuccess("تم تعيين الصورة الرئيسية.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function askDelete(image: ListingImageRecord) {
  openConfirm({
    title: "حذف الصورة",
    body: "سيتم حذف الصورة نهائياً من القرص وقاعدة البيانات.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await api.value.remove(props.listingId, image.id);
      await load();
      notifySuccess("تم حذف الصورة.");
    },
  });
}

async function moveImage(from: number, to: number) {
  if (to < 0 || to >= images.value.length || from === to) return;
  const next = [...images.value];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  images.value = next;
  try {
    images.value = await api.value.reorder(
      props.listingId,
      next.map((i) => i.id),
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
    await load();
  }
}

function onDragStart(index: number) {
  dragIndex = index;
}
async function onDropReorder(index: number) {
  const from = dragIndex;
  dragIndex = -1;
  if (from >= 0) await moveImage(from, index);
}

// إعادة الترتيب بلوحة المفاتيح: Ctrl+→ يقدّم الصورة (اليمين أول الترتيب في
// RTL) وCtrl+← يؤخّرها، ويبقى التركيز عليها في مكانها الجديد.
async function onThumbKeydown(event: KeyboardEvent, index: number) {
  if (!props.canManage || !event.ctrlKey) return;
  const delta =
    event.key === "ArrowRight" ? -1 : event.key === "ArrowLeft" ? 1 : 0;
  if (!delta) return;
  event.preventDefault();
  const id = images.value[index]?.id;
  await moveImage(index, index + delta);
  await nextTick();
  strip.value
    ?.querySelector<HTMLElement>(`[data-image-id="${id}"] button`)
    ?.focus();
}

watch(
  () => props.listingId,
  () => {
    missingThumbs.clear();
    void load();
  },
);
onMounted(() => {
  window.addEventListener("paste", onPaste);
  void load();
});
onBeforeUnmount(() => {
  window.removeEventListener("paste", onPaste);
  clearPending();
});
</script>

<template>
  <div class="gallery-root">
    <v-progress-linear
      v-if="loading"
      indeterminate
      color="primary"
      class="mb-2"
    />
    <v-alert
      v-if="loadError"
      type="error"
      variant="tonal"
      density="compact"
      class="mb-2"
    >
      تعذر تحميل الصور: {{ loadError }}
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة المحاولة</v-btn>
      </template>
    </v-alert>

    <div v-if="primaryImage" class="gallery">
      <ListingImage
        :src="imageUrl(activeImage!)"
        class="gallery-primary"
        alt="صورة العرض"
      />
      <ol ref="strip" class="thumbs" aria-label="صور العرض">
        <li
          v-for="(image, index) in images"
          :key="image.id"
          :data-image-id="image.id"
          class="thumb-wrap"
          :class="{ 'thumb-active': image.id === activeImage?.id }"
          :draggable="canManage"
          @dragstart="onDragStart(index)"
          @dragover.prevent
          @drop.prevent="onDropReorder(index)"
        >
          <button
            type="button"
            class="thumb-button"
            :aria-label="`الصورة ${index + 1} من ${images.length}${image.is_primary ? '، الرئيسية' : ''}`"
            :aria-pressed="image.id === activeImage?.id"
            :aria-keyshortcuts="
              canManage ? 'Control+ArrowRight Control+ArrowLeft' : undefined
            "
            :title="canManage ? 'Ctrl+→ / Ctrl+← لتغيير الترتيب' : undefined"
            @click="activeImageId = image.id"
            @keydown="onThumbKeydown($event, index)"
          >
            <img
              :src="thumbUrl(image)"
              class="thumb"
              alt=""
              width="84"
              height="84"
              loading="lazy"
              decoding="async"
              @error="missingThumbs.add(image.id)"
              @load="onThumbLoad(image)"
            />
            <v-icon
              v-if="image.is_primary"
              icon="mdi-star"
              size="16"
              class="thumb-primary"
              aria-hidden="true"
            />
          </button>
          <div v-if="canManage" class="thumb-actions">
            <v-btn
              v-if="!image.is_primary"
              icon="mdi-star-outline"
              size="small"
              variant="text"
              :aria-label="`تعيين الصورة ${index + 1} رئيسية`"
              title="تعيين رئيسية"
              @click="setPrimary(image)"
            />
            <v-spacer />
            <v-btn
              icon="mdi-delete-outline"
              size="small"
              variant="text"
              color="error"
              :aria-label="`حذف الصورة ${index + 1}`"
              title="حذف"
              @click="askDelete(image)"
            />
          </div>
        </li>
      </ol>
    </div>
    <p v-else-if="!loading && !loadError" class="gallery-empty">
      لا توجد صور لهذا العرض.
    </p>

    <template v-if="canManage">
      <!-- زر فعلي لا div: منطقة الرفع يجب أن تُفتح بلوحة المفاتيح أيضاً. -->
      <button
        type="button"
        class="dropzone"
        :class="{ 'dropzone-over': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
        @click="fileInput?.click()"
      >
        <v-icon icon="mdi-cloud-upload-outline" size="24" />
        <span>اسحب الصور هنا، أو الصقها (Ctrl+V)، أو اضغط للاختيار</span>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          hidden
          @change="onFileChange"
        />
      </button>

      <div v-if="pending.length" class="pending">
        <div class="pending__title">
          معاينة قبل الرفع ({{ pending.length }})
        </div>
        <ul class="thumbs">
          <li
            v-for="(item, index) in pending"
            :key="item.preview"
            class="thumb-wrap"
          >
            <img
              :src="item.preview"
              class="thumb"
              alt=""
              width="84"
              height="84"
            />
            <div class="thumb-actions">
              <v-spacer />
              <v-btn
                icon="mdi-close"
                size="small"
                variant="text"
                color="error"
                :aria-label="`إزالة ${item.name} من الرفع`"
                @click="removePending(index)"
              />
            </div>
          </li>
        </ul>
        <div class="d-flex justify-end mt-2 ga-2">
          <v-btn variant="text" :disabled="uploading" @click="clearPending"
            >إلغاء</v-btn
          >
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
  aspect-ratio: 4/3;
  border-radius: var(--dal-radius-card);
  object-fit: cover;
}
.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.thumb-wrap {
  width: 88px;
  border: 2px solid transparent;
  border-radius: var(--dal-radius-card);
  overflow: hidden;
}
.thumb-active {
  border-color: rgb(var(--v-theme-primary));
}
.thumb-button {
  position: relative;
  display: block;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.thumb {
  display: block;
  width: 84px;
  height: 84px;
  object-fit: cover;
  background: var(--dal-hover);
}
.thumb-primary {
  position: absolute;
  inset-block-start: 4px;
  inset-inline-start: 4px;
  color: rgb(var(--v-theme-warning));
}
/* الأوامر تحت المصغّرة لا فوقها، والحذف في الطرف الآخر بعيداً عن «رئيسية». */
.thumb-actions {
  display: flex;
  align-items: center;
}
.gallery-empty {
  margin: 0;
  padding: 16px 0;
  color: var(--dal-muted);
  text-align: center;
}
.dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 12px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.5);
  border-radius: var(--dal-radius-card);
  padding: 10px 12px;
  cursor: pointer;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: calc(13px * var(--dal-font-scale));
}
.dropzone-over {
  border-color: rgb(var(--v-theme-primary));
  background: var(--dal-selection);
}
.pending {
  margin-top: 12px;
}
.pending__title {
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
}
</style>
