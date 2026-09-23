<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import RentalForm from "../components/rentals/RentalForm.vue";
import MatchingResultsDialog from "../components/requests/MatchingResultsDialog.vue";
import * as rentals from "../services/rentals.service";
import * as requests from "../services/requests.service";
import * as customersService from "../services/customers.service";
import { getErrorMessage } from "../services/api.service";
import { useLocations } from "../composables/useLocations";
import { useSnackbar } from "../composables/useSnackbar";
import type {
  CustomerRecord,
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
    owner_customer_id: null,
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
    name: item.name ?? "",
    property_type: item.property_type,
    rent_price: item.rent_price,
    rent_period: item.rent_period,
    area_value: item.area_value,
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
    owner_customer_id: item.owner_customer_id ?? null,
    owner_name: item.owner_name,
    owner_phone: item.owner_phone,
    owner_notes: item.owner_notes ?? "",
    status: item.status,
    is_negotiable: item.is_negotiable,
    notes: item.notes ?? "",
  };
}

const form = ref<RentalFormType>(empty());
const customers = ref<CustomerRecord[]>([]);
const editingId = ref<number | null>(null);
const saving = ref(false);
const formRef = ref<{ validate: () => Promise<boolean> } | null>(null);
const matchDialog = ref(false);
const matches = ref<MatchResult[]>([]);
const pendingRedirect = ref<string | null>(null);
const isEditing = computed(() => editingId.value !== null);

async function save() {
  if (!(await formRef.value?.validate())) {
    notifyError("تحقق من الحقول المطلوبة.");
    return;
  }
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
    if (editingId.value) {
      await rentals.updateRental(editingId.value, payload);
      notifySuccess("تم تحديث العرض الإيجاري.");
    } else {
      const created = await rentals.createRental(payload);
      savedId = created.id;
      notifySuccess("تمت إضافة العرض الإيجاري.");
    }

    const destination = editingId.value
      ? "/rentals"
      : `/rentals/${savedId}/edit`;
    if (savedId !== null) {
      try {
        const result = await requests.rentalRequestMatches(savedId);
        matches.value = result.matches;
        if (result.count) {
          notifySuccess(`تم العثور على ${result.count} طلبات إيجار مطابقة.`);
          pendingRedirect.value = destination;
        }
      } catch {
        // Matching is advisory and must not block saving an offer.
      }
    }

    if (matches.value.length) matchDialog.value = true;
    else await router.push(destination);
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    saving.value = false;
  }
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
  void router.push({ path: "/rental-requests", query: { open: String(id) } });
}

onMounted(async () => {
  await loadLocations();
  customers.value = await customersService.listCustomers().catch(() => []);
  const id = Number(route.params.id);
  if (id) {
    try {
      const item = await rentals.getRental(id);
      form.value = toForm(item);
      editingId.value = id;
    } catch (error) {
      notifyError(getErrorMessage(error));
      await router.replace("/rentals");
    }
  }
});
</script>

<template>
  <AppLayout
    :title="isEditing ? 'تعديل عرض إيجاري' : 'إضافة عرض إيجاري'"
    subtitle="نموذج مستقل للعروض الإيجارية."
  >
    <RentalForm
      ref="formRef"
      v-model="form"
      :editing="isEditing"
      :saving="saving"
      :rental-id="editingId"
      :customers="customers"
      @submit="save"
      @cancel="router.push('/rentals')"
    />
    <MatchingResultsDialog
      :model-value="matchDialog"
      :matches="matches"
      title="طلبات الإيجار المطابقة"
      @update:model-value="closeMatches"
      @open="openMatch"
    />
  </AppLayout>
</template>
