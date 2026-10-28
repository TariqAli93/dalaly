<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import PropertyForm from "../components/properties/PropertyForm.vue";
import { DIRECT_PRICE } from "../constants/domain";
import { getErrorMessage } from "../services/api.service";
import { useProperties } from "../composables/useProperties";
import { useSnackbar } from "../composables/useSnackbar";
import * as requests from "../services/requests.service";
import { toNumber } from "../utils/format";
import MatchingResultsDialog from "../components/requests/MatchingResultsDialog.vue";
import DraftNotice from "../components/shared/DraftNotice.vue";
import { useDirtyForm } from "../composables/useDirtyForm";
import { useApiFormErrors } from "../composables/useApiFormErrors";
import { useSaveShortcut } from "../composables/useSaveShortcut";
import { useLocations } from "../composables/useLocations";
import { samePlot } from "../utils/plotIdentity";
import type {
  MatchResult,
  PropertyForm as PropertyFormType,
  PropertyRecord,
} from "../types";

const route = useRoute();
const router = useRouter();
const { service, startFromFirstPage } = useProperties();
const { activeGovernorates, districtsByGovernorate, neighborhoodsByDistrict } =
  useLocations();
const { notifySuccess, notifyError } = useSnackbar();

function defaultForm(): PropertyFormType {
  return {
    latitude: null,
    longitude: null,
    location_link: null,
    name: "",
    property_type: "أرض",
    legal_type: "طابو ملك صرف",
    area_value: "",
    area_unit: "متر",
    pricing_method: "سعر على المتر",
    unit_price: "",
    total_price: "",
    governorate_id: null,
    district_id: null,
    neighborhood_id: null,
    governorate_text: "",
    district_text: "",
    neighborhood_text: "",
    address_details: "",
    owner_person_id: null,
    owner_name: "",
    owner_phone: "",
    owner_notes: "",
    status: "available",
    notes: "",
    nazal: "",
    plot_number: "",
    plot_letter: "",
    subdistrict_number: "",
    subdistrict_name: "",
    mahalla: "",
    alley: "",
    house_number: "",
    nearest_landmark: "",
    street_width: "",
    frontage: "",
    rooms_count: null,
    bathrooms_count: null,
    is_negotiable: false,
    amenities: {},
  };
}

function propertyToForm(p: PropertyRecord): PropertyFormType {
  return {
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    location_link: p.location_link ?? null,
    name: p.name ?? "",
    property_type: p.property_type,
    legal_type: p.legal_type,
    // عمود numeric يصل بخانتين عشريتين («800.00»)، والأصفار الزائدة ضجيج في الحقل.
    area_value: String(Number(p.area_value)),
    area_unit: p.area_unit,
    pricing_method: p.pricing_method,
    unit_price: p.unit_price ?? "",
    total_price: p.total_price,
    governorate_id: p.governorate_id ?? null,
    district_id: p.district_id ?? null,
    neighborhood_id: p.neighborhood_id ?? null,
    governorate_text: p.governorate_text ?? "",
    district_text: p.district_text ?? "",
    neighborhood_text: p.neighborhood_text ?? "",
    address_details: p.address_details ?? "",
    owner_person_id: p.owner_person_id ?? null,
    owner_name: p.owner_name,
    owner_phone: p.owner_phone,
    owner_notes: p.owner_notes ?? "",
    status: p.status,
    notes: p.notes ?? "",
    nazal: p.nazal ?? "",
    plot_number: p.plot_number ?? "",
    plot_letter: p.plot_letter ?? "",
    subdistrict_number: p.subdistrict_number ?? "",
    subdistrict_name: p.subdistrict_name ?? "",
    mahalla: p.mahalla ?? "",
    alley: p.alley ?? "",
    house_number: p.house_number ?? "",
    nearest_landmark: p.nearest_landmark ?? "",
    street_width: p.street_width ?? "",
    frontage: p.frontage ?? "",
    rooms_count: p.rooms_count ?? null,
    bathrooms_count: p.bathrooms_count ?? null,
    is_negotiable: p.is_negotiable ?? false,
    amenities: p.amenities ?? {},
  };
}

const editingId = ref<number | null>(null);
const form = ref<PropertyFormType>(defaultForm());
const saving = ref(false);
const formRef = useTemplateRef<{
  validate: () => Promise<boolean>;
  focusField: (name: string) => Promise<void>;
}>("formRef");
const matchDialog = ref(false);
const matches = ref<MatchResult[]>([]);
const pendingRedirect = ref<string | null>(null);

const isEditing = computed(() => editingId.value !== null);
const changes = useDirtyForm(
  form,
  () => `property:${editingId.value ?? "new"}`,
);
const apiErrors = useApiFormErrors();
useSaveShortcut(() => void save());

const computedTotal = computed(() => {
  if (form.value.pricing_method === DIRECT_PRICE) {
    return toNumber(form.value.total_price);
  }
  return toNumber(form.value.area_value) * toNumber(form.value.unit_price);
});

function isPayloadValid() {
  if (!form.value.property_type || !form.value.legal_type) return false;
  if (toNumber(form.value.area_value) <= 0 || !form.value.area_unit)
    return false;
  if (
    !form.value.pricing_method ||
    !form.value.owner_name ||
    !form.value.owner_phone
  ) {
    return false;
  }
  if (form.value.pricing_method === DIRECT_PRICE) {
    return toNumber(form.value.total_price) > 0;
  }
  return toNumber(form.value.unit_price) > 0 && computedTotal.value > 0;
}

// ─── تحذير تكرار القطعة قبل الحفظ ──────────────────────────────────────
// هوية القطعة كما يقارنها الخادم (الموقع بالاسم + رقم القطعة وحرفها). البحث
// يجلب المرشّحين برقم القطعة، والمقارنة الدقيقة هنا؛ الخادم يبقى الحَكَم (409).
const duplicate = ref<{ id: number; label: string; owner: string } | null>(
  null,
);
function locationNames() {
  const f = form.value;
  const governorate =
    activeGovernorates.value.find((g) => g.id === f.governorate_id)?.name ??
    f.governorate_text;
  const district =
    districtsByGovernorate(f.governorate_id).find((d) => d.id === f.district_id)
      ?.name ?? f.district_text;
  const neighborhood =
    neighborhoodsByDistrict(f.district_id).find(
      (n) => n.id === f.neighborhood_id,
    )?.name ?? f.neighborhood_text;
  return { governorate, district, neighborhood };
}
let duplicateTimer: ReturnType<typeof setTimeout> | undefined;
let duplicateController: AbortController | null = null;
async function checkDuplicate() {
  duplicateController?.abort();
  const plotNumber = form.value.plot_number?.trim();
  if (!plotNumber) {
    duplicate.value = null;
    return;
  }
  const controller = new AbortController();
  duplicateController = controller;
  try {
    const page = await service.listPropertiesPage(
      { plot_number: plotNumber },
      { page: 1, page_size: 50, sort_by: "updated_at", sort_order: "desc" },
      controller.signal,
    );
    if (controller.signal.aborted) return;
    const current = {
      ...locationNames(),
      plotNumber,
      plotLetter: form.value.plot_letter,
    };
    const match = page.items.find(
      (item) =>
        item.id !== editingId.value &&
        samePlot(
          {
            governorate: item.governorate,
            district: item.district,
            neighborhood: item.neighborhood,
            plotNumber: item.plot_number,
            plotLetter: item.plot_letter,
          },
          current,
        ),
    );
    duplicate.value = match
      ? {
          id: match.id,
          label: match.name || `عقار ${match.code}`,
          owner: match.owner_name || "—",
        }
      : null;
  } catch {
    // التحذير استشاري: فشله لا يمنع الحفظ، والخادم يرفض التكرار نفسه.
  }
}
watch(
  () => [
    form.value.plot_number,
    form.value.plot_letter,
    form.value.governorate_id,
    form.value.district_id,
    form.value.neighborhood_id,
    form.value.governorate_text,
    form.value.district_text,
    form.value.neighborhood_text,
  ],
  () => {
    clearTimeout(duplicateTimer);
    duplicateTimer = setTimeout(() => void checkDuplicate(), 400);
  },
);
onBeforeUnmount(() => {
  clearTimeout(duplicateTimer);
  duplicateController?.abort();
});

async function save() {
  // Enter في حقل يرسل النموذج حتى أثناء الحفظ؛ loading يمنع النقر وحده.
  if (saving.value) return;
  apiErrors.clear();
  // التحقق يركّز أول حقل خاطئ ويُظهر رسالته تحته.
  if (!(await formRef.value?.validate())) return;
  if (!isPayloadValid()) {
    notifyError("تعذر حفظ العرض: أدخل سعراً إجمالياً صحيحاً وبيانات المالك.");
    return;
  }

  saving.value = true;
  matches.value = [];
  pendingRedirect.value = null;
  const isDirect = form.value.pricing_method === DIRECT_PRICE;
  const payload = {
    ...form.value,
    area_value: toNumber(form.value.area_value),
    unit_price: isDirect ? null : toNumber(form.value.unit_price),
    total_price: computedTotal.value,
  };

  try {
    let savedId = editingId.value;
    if (editingId.value !== null) {
      await service.updateProperty(editingId.value, payload);
      changes.markSaved();
      notifySuccess("تم تحديث العرض.");
    } else {
      const created = await service.createProperty(payload);
      savedId = created.id;
      // مسودة «جديد» قبل تغيّر المفتاح إلى معرّف العرض.
      changes.markSaved();
      // حفظ ثانٍ والحوار مفتوح يحدّث العرض الجديد ولا يكرّره.
      editingId.value = savedId;
      notifySuccess("تمت إضافة العرض. أضف صوره من صفحته.");
    }
    // بعد الحفظ صفحة العرض نفسه (وفيها الصور)، لا القائمة؛ وعرض أُضيف من
    // خطوة العقار في عقد (?contract=<id>) يعود إليه مختاراً.
    const contractId = Number(route.query.contract);
    const destination =
      Number.isSafeInteger(contractId) && contractId > 0
        ? `/contracts/${contractId}?step=property&listing=${savedId}`
        : `/properties/${savedId}`;
    try {
      const result = await requests.purchaseRequestMatches(savedId!);
      matches.value = result.matches;
      if (result.count) {
        notifySuccess(`طلبات الشراء المطابقة: ${result.count}.`);
        pendingRedirect.value = destination;
      }
    } catch {
      // Matching is advisory and must not block saving an offer.
    }
    // صفحة العروض تحمّل أول صفحة حين تُفتح بعد الحفظ.
    startFromFirstPage();
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
    editingId.value !== null ? `/properties/${editingId.value}` : "/properties",
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
  void router.push(`/purchase-requests/${id}`);
}

// المكوّن نفسه يخدم ‎/properties/new‎ و‎/properties/:id/edit‎ ويُعاد استخدامه
// عند الانتقال بينهما، فيُحمَّل النموذج كلما تغيّر المعرّف.
watch(
  () => Number(route.params.id) || null,
  async (id) => {
    if (id !== null && id === editingId.value) return;
    apiErrors.clear();
    duplicate.value = null;
    if (!id) {
      form.value = defaultForm();
      editingId.value = null;
      changes.markLoaded();
      return;
    }
    try {
      const property = await service.getProperty(id);
      form.value = propertyToForm(property);
      editingId.value = id;
      changes.markLoaded();
    } catch (error) {
      notifyError(getErrorMessage(error));
      await router.replace("/properties");
    }
  },
  { immediate: true },
);
</script>

<template>
  <AppPage
    :title="isEditing ? 'تعديل عرض عقاري' : 'إضافة عرض عقاري'"
    :parent="
      isEditing
        ? { to: `/properties/${editingId}`, label: 'العرض' }
        : { to: '/properties', label: 'عروض البيع' }
    "
  >
    <DraftNotice
      v-if="changes.draft.value"
      :saved-at="changes.draft.value.savedAt"
      @restore="changes.restoreDraft"
      @discard="changes.discardDraft"
    />
    <PropertyForm
      ref="formRef"
      v-model="form"
      :saving="saving"
      :dirty="changes.isDirty.value"
      :field-errors="apiErrors.errors.value"
      :duplicate="duplicate"
      @submit="save"
      @cancel="cancel"
    />
    <MatchingResultsDialog
      :model-value="matchDialog"
      :matches="matches"
      title="طلبات الشراء المطابقة"
      @update:model-value="closeMatches"
      @open="openMatch"
    />
  </AppPage>
</template>
