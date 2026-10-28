<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import RentalForm from "../components/rentals/RentalForm.vue";
import MatchingResultsDialog from "../components/requests/MatchingResultsDialog.vue";
import DraftNotice from "../components/shared/DraftNotice.vue";
import { useDirtyForm } from "../composables/useDirtyForm";
import { useApiFormErrors } from "../composables/useApiFormErrors";
import { useSaveShortcut } from "../composables/useSaveShortcut";
import * as rentals from "../services/rentals.service";
import * as requests from "../services/requests.service";
import { getErrorMessage } from "../services/api.service";
import { useLocations } from "../composables/useLocations";
import { useSnackbar } from "../composables/useSnackbar";
import type {
  MatchResult,
  RentalForm as RentalFormType,
  RentalRecord,
} from "../types";

const route = useRoute();
const router = useRouter();
const { loadLocations } = useLocations();
const { notifyError, notifySuccess } = useSnackbar();

function empty(): RentalFormType {
  return {
    latitude: null,
    longitude: null,
    location_link: null,
    name: "",
    property_type: "house",
    rent_price: "",
    rent_period: "monthly",
    area_value: "",
    area_unit: "متر",
    floors_count: null,
    rooms_count: null,
    bathrooms_count: null,
    amenities: {},
    other_details: "",
    governorate_id: null,
    district_id: null,
    neighborhood_id: null,
    governorate: "",
    district: "",
    neighborhood: "",
    address_details: "",
    owner_person_id: null,
    owner_name: "",
    owner_phone: "",
    owner_notes: "",
    status: "available",
    is_negotiable: false,
    notes: "",
  };
}

function toForm(item: RentalRecord): RentalFormType {
  return {
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    location_link: item.location_link ?? null,
    name: item.name ?? "",
    property_type: item.property_type,
    rent_price: item.rent_price,
    rent_period: item.rent_period,
    // عمود numeric يصل بخانتين عشريتين («145.00»)، والأصفار الزائدة ضجيج في الحقل.
    area_value: String(Number(item.area_value)),
    area_unit: item.area_unit,
    floors_count: item.floors_count,
    rooms_count: item.rooms_count,
    bathrooms_count: item.bathrooms_count,
    amenities: item.amenities ?? {},
    other_details: item.other_details ?? "",
    governorate_id: item.governorate_id,
    district_id: item.district_id,
    neighborhood_id: item.neighborhood_id,
    governorate: item.governorate ?? "",
    district: item.district ?? "",
    neighborhood: item.neighborhood ?? "",
    address_details: item.address_details ?? "",
    owner_person_id: item.owner_person_id ?? null,
    owner_name: item.owner_name,
    owner_phone: item.owner_phone,
    owner_notes: item.owner_notes ?? "",
    status: item.status,
    is_negotiable: item.is_negotiable,
    notes: item.notes ?? "",
  };
}

const form = ref<RentalFormType>(empty());
const editingId = ref<number | null>(null);
const saving = ref(false);
const formRef = useTemplateRef<{
  validate: () => Promise<boolean>;
  focusField: (name: string) => Promise<void>;
}>("formRef");
const matchDialog = ref(false);
const matches = ref<MatchResult[]>([]);
const pendingRedirect = ref<string | null>(null);
const isEditing = computed(() => editingId.value !== null);
const changes = useDirtyForm(form, () => `rental:${editingId.value ?? "new"}`);
// النموذج يسمّي حقول الموقع بأسمائها في الطلب نفسه، فلا أسماء بديلة.
const apiErrors = useApiFormErrors();
useSaveShortcut(() => void save());

async function save() {
  // Enter في حقل يرسل النموذج حتى أثناء الحفظ؛ loading يمنع النقر وحده.
  if (saving.value) return;
  apiErrors.clear();
  // التحقق يركّز أول حقل خاطئ ويُظهر رسالته تحته.
  if (!(await formRef.value?.validate())) return;
  saving.value = true;
  matches.value = [];
  pendingRedirect.value = null;
  const payload = {
    ...form.value,
    rent_price: Number(form.value.rent_price),
    area_value: Number(form.value.area_value),
    floors_count:
      form.value.floors_count === null ? null : Number(form.value.floors_count),
    rooms_count:
      form.value.rooms_count === null ? null : Number(form.value.rooms_count),
    bathrooms_count:
      form.value.bathrooms_count === null
        ? null
        : Number(form.value.bathrooms_count),
  };
  try {
    let savedId = editingId.value;
    if (savedId !== null) {
      await rentals.updateRental(savedId, payload);
      changes.markSaved();
      notifySuccess("تم تحديث العرض الإيجاري.");
    } else {
      const created = await rentals.createRental(payload);
      savedId = created.id;
      // مسودة «جديد» قبل تغيّر المفتاح إلى معرّف العرض.
      changes.markSaved();
      // تصير الصفحة صفحة تعديل العرض الجديد قبل أي خطوة أخرى، فحفظ ثانٍ
      // (بعد إغلاق حوار المطابقات مثلاً) يحدّثه ولا يُنشئ عرضاً مكرّراً.
      editingId.value = savedId;
      await router.replace(`/rentals/${savedId}/edit`);
      notifySuccess("تمت إضافة العرض الإيجاري. أضف صوره من صفحته.");
    }

    // بعد الحفظ صفحة العرض نفسه (وفيها الصور)، لا القائمة؛ وعرض أُضيف من
    // خطوة العقار في عقد (?contract=<id>) يعود إليه مختاراً.
    const contractId = Number(route.query.contract);
    const destination =
      Number.isSafeInteger(contractId) && contractId > 0
        ? `/contracts/${contractId}?step=property&listing=${savedId}`
        : `/rentals/${savedId}`;
    try {
      const result = await requests.rentalRequestMatches(savedId);
      matches.value = result.matches;
      if (result.count) {
        notifySuccess(`طلبات الإيجار المطابقة: ${result.count}.`);
        pendingRedirect.value = destination;
      }
    } catch {
      // Matching is advisory and must not block saving an offer.
    }

    if (matches.value.length) matchDialog.value = true;
    else await router.push(destination);
  } catch (error) {
    const general = apiErrors.apply(error);
    if (general) notifyError(general);
    const first = apiErrors.fields()[0];
    if (first) void formRef.value?.focusField(first);
  } finally {
    saving.value = false;
  }
}

function cancel() {
  void router.push(
    editingId.value !== null ? `/rentals/${editingId.value}` : "/rentals",
  );
}

function closeMatches(value: boolean) {
  matchDialog.value = value;
  if (!value && pendingRedirect.value) {
    const path = pendingRedirect.value;
    pendingRedirect.value = null;
    void router.push(path);
  }
}

function openMatch(match: MatchResult) {
  const id = Number((match.record as { id?: number }).id);
  if (!id) return;
  matchDialog.value = false;
  pendingRedirect.value = null;
  void router.push(`/rental-requests/${id}`);
}

// المكوّن نفسه يخدم ‎/rentals/new‎ و‎/rentals/:id/edit‎ ويُعاد استخدامه عند
// الانتقال بينهما، فيُحمَّل النموذج كلما تغيّر المعرّف لا عند التركيب وحده.
watch(
  () => Number(route.params.id) || null,
  async (id) => {
    if (id !== null && id === editingId.value) return;
    apiErrors.clear();
    await loadLocations();
    if (!id) {
      form.value = empty();
      editingId.value = null;
      changes.markLoaded();
      return;
    }
    try {
      const item = await rentals.getRental(id);
      form.value = toForm(item);
      editingId.value = id;
      changes.markLoaded();
    } catch (error) {
      notifyError(getErrorMessage(error));
      await router.replace("/rentals");
    }
  },
  { immediate: true },
);
</script>

<template>
  <AppPage
    :title="isEditing ? 'تعديل عرض إيجاري' : 'إضافة عرض إيجاري'"
    :parent="
      isEditing
        ? { to: `/rentals/${editingId}`, label: 'العرض' }
        : { to: '/rentals', label: 'عروض الإيجار' }
    "
  >
    <DraftNotice
      v-if="changes.draft.value"
      :saved-at="changes.draft.value.savedAt"
      @restore="changes.restoreDraft"
      @discard="changes.discardDraft"
    />
    <RentalForm
      ref="formRef"
      v-model="form"
      :saving="saving"
      :dirty="changes.isDirty.value"
      :field-errors="apiErrors.errors.value"
      @submit="save"
      @cancel="cancel"
    />
    <MatchingResultsDialog
      :model-value="matchDialog"
      :matches="matches"
      title="طلبات الإيجار المطابقة"
      @update:model-value="closeMatches"
      @open="openMatch"
    />
  </AppPage>
</template>
