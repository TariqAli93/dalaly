<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import PropertyForm from "../components/properties/PropertyForm.vue";
import { DIRECT_PRICE } from "../constants/domain";
import { getErrorMessage } from "../services/api.service";
import { useProperties } from "../composables/useProperties";
import { useStats } from "../composables/useStats";
import { useSnackbar } from "../composables/useSnackbar";
import * as requests from "../services/requests.service";
import * as customersService from "../services/customers.service";
import { toNumber } from "../utils/format";
import type { CustomerRecord, PropertyForm as PropertyFormType, PropertyRecord } from "../types";

const route = useRoute();
const router = useRouter();
const { service, loadProperties } = useProperties();
const { loadStats } = useStats();
const { notifySuccess, notifyError } = useSnackbar();
const customers = ref<CustomerRecord[]>([]);

function defaultForm(): PropertyFormType {
  return {
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
    owner_customer_id: null,
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
    name: p.name ?? "",
    property_type: p.property_type,
    legal_type: p.legal_type,
    area_value: p.area_value,
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
    owner_customer_id: p.owner_customer_id ?? null,
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
const formRef = ref<{ validate: () => Promise<boolean> } | null>(null);

const isEditing = computed(() => editingId.value !== null);

const computedTotal = computed(() => {
  if (form.value.pricing_method === DIRECT_PRICE) {
    return toNumber(form.value.total_price);
  }
  return toNumber(form.value.area_value) * toNumber(form.value.unit_price);
});

function isPayloadValid() {
  if (!form.value.property_type || !form.value.legal_type) return false;
  if (toNumber(form.value.area_value) <= 0 || !form.value.area_unit) return false;
  if (!form.value.pricing_method || !form.value.owner_name || !form.value.owner_phone) {
    return false;
  }
  if (form.value.pricing_method === DIRECT_PRICE) {
    return toNumber(form.value.total_price) > 0;
  }
  return toNumber(form.value.unit_price) > 0 && computedTotal.value > 0;
}

async function save() {
  const valid = await formRef.value?.validate();
  if (!valid) {
    notifyError("تحقق من الحقول المطلوبة قبل الحفظ.");
    return;
  }
  if (!isPayloadValid()) {
    notifyError("لا يمكن حفظ عرض بدون سعر كلي صحيح وبيانات مالك.");
    return;
  }

  saving.value = true;
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
      notifySuccess("تم تحديث العرض بنجاح.");
    } else {
      const created = await service.createProperty(payload);
      savedId = created.id;
      notifySuccess("تمت إضافة العرض بنجاح.");
    }
    if (savedId !== null) {
      try {
        const result = await requests.purchaseRequestMatches(savedId);
        if (result.count) notifySuccess(`Found ${result.count} matching purchase requests.`);
      } catch {
        // Matching is advisory and must not block saving an offer.
      }
    }
    await Promise.all([loadProperties(), loadStats()]);
    await router.push("/properties");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  customers.value = await customersService.listCustomers().catch(() => []);
  const idParam = route.params.id;
  if (idParam) {
    const id = Number(idParam);
    try {
      const property = await service.getProperty(id);
      form.value = propertyToForm(property);
      editingId.value = id;
    } catch (error) {
      notifyError(getErrorMessage(error));
      await router.replace("/properties");
    }
  }
});
</script>

<template>
  <AppLayout :title="isEditing ? 'تعديل عرض عقاري' : 'إضافة عرض عقاري'">
    <PropertyForm
      ref="formRef"
      v-model="form"
      :customers="customers"
      :editing="isEditing"
      :saving="saving"
      @submit="save"
      @cancel="router.push('/properties')"
    />
  </AppLayout>
</template>
