<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import { getErrorMessage } from "../services/api.service";
import { useLocations } from "../composables/useLocations";
import { useConfirm } from "../composables/useConfirm";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import type { District, Governorate } from "../types";

const { governorates, districts, loadLocations, service } = useLocations();
const { openConfirm } = useConfirm();
const { notifySuccess, notifyError } = useSnackbar();
const { setRefreshHandler } = useRefresh();

const selectedGovId = ref<number | null>(null);

const selectedDistricts = computed(() =>
  districts.value.filter((d) => d.governorate_id === selectedGovId.value),
);

const govDialog = ref(false);
const editingGov = ref<Governorate | null>(null);
const govForm = ref({ name: "", is_active: true });

const distDialog = ref(false);
const editingDist = ref<District | null>(null);
const distForm = ref({ name: "", is_active: true });

async function refresh() {
  await loadLocations(true);
  if (selectedGovId.value === null && governorates.value.length) {
    selectedGovId.value = governorates.value[0].id;
  }
}

function openGovDialog(gov?: Governorate) {
  editingGov.value = gov ?? null;
  govForm.value = { name: gov?.name ?? "", is_active: gov?.is_active ?? true };
  govDialog.value = true;
}

async function saveGov() {
  try {
    if (editingGov.value) {
      await service.updateGovernorate(editingGov.value.id, govForm.value);
    } else {
      await service.createGovernorate(govForm.value);
    }
    govDialog.value = false;
    await refresh();
    notifySuccess("تم حفظ المحافظة.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function askDeleteGov(gov: Governorate) {
  openConfirm({
    title: `حذف ${gov.name}`,
    body: "لا يمكن الحذف إذا كانت مرتبطة بعقارات.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await service.deleteGovernorate(gov.id);
      if (selectedGovId.value === gov.id) selectedGovId.value = null;
      await refresh();
      notifySuccess("تم حذف المحافظة.");
    },
  });
}

function openDistDialog(dist?: District) {
  editingDist.value = dist ?? null;
  distForm.value = {
    name: dist?.name ?? "",
    is_active: dist?.is_active ?? true,
  };
  distDialog.value = true;
}

async function saveDist() {
  if (!selectedGovId.value) return;
  try {
    if (editingDist.value) {
      await service.updateDistrict(editingDist.value.id, distForm.value);
    } else {
      await service.createDistrict({
        governorate_id: selectedGovId.value,
        name: distForm.value.name,
        is_active: distForm.value.is_active,
      });
    }
    distDialog.value = false;
    await refresh();
    notifySuccess("تم حفظ المنطقة.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function askDeleteDist(dist: District) {
  openConfirm({
    title: `حذف ${dist.name}`,
    body: "لا يمكن الحذف إذا كانت مرتبطة بعقارات.",
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      await service.deleteDistrict(dist.id);
      await refresh();
      notifySuccess("تم حذف المنطقة.");
    },
  });
}

async function toggleGov(gov: Governorate) {
  try {
    await service.updateGovernorate(gov.id, {
      name: gov.name,
      is_active: !gov.is_active,
    });
    await refresh();
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

async function toggleDist(dist: District) {
  try {
    await service.updateDistrict(dist.id, {
      name: dist.name,
      is_active: !dist.is_active,
    });
    await refresh();
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

onMounted(() => {
  setRefreshHandler(refresh);
  void refresh();
});
</script>

<template>
  <AppLayout
    title="المحافظات والمناطق"
    subtitle="تسريع إدخال العقارات والفلترة."
  >
    <div class="flex gap-4">
      <v-card rounded="lg" variant="flat" border class="w-full md:w-1/2">
        <v-card-title class="d-flex align-center">
          <span>المحافظات</span>
          <v-spacer />
          <v-btn
            color="primary"
            prepend-icon="mdi-plus"
            @click="openGovDialog()"
          >
            إضافة محافظة
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-empty-state
            v-if="!governorates.length"
            icon="mdi-map-marker-off-outline"
            title="لا توجد محافظات"
          />
          <v-list v-else>
            <v-list-item
              v-for="gov in governorates"
              :key="gov.id"
              :active="selectedGovId === gov.id"
              :title="gov.name"
              @click="selectedGovId = gov.id"
            >
              <template #append>
                <v-switch
                  :model-value="gov.is_active"
                  color="primary"
                  density="compact"
                  hide-details
                  @update:model-value="toggleGov(gov)"
                  @click.stop
                />
                <v-btn
                  icon="mdi-pencil"
                  size="small"
                  variant="text"
                  @click.stop="openGovDialog(gov)"
                />
                <v-btn
                  icon="mdi-delete-outline"
                  color="error"
                  size="small"
                  variant="text"
                  @click.stop="askDeleteGov(gov)"
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>

      <v-card rounded="lg" variant="flat" border class="w-full md:w-1/2">
        <v-card-title class="d-flex align-center">
          <span>المناطق</span>
          <v-spacer />
          <v-btn
            color="primary"
            prepend-icon="mdi-plus"
            :disabled="!selectedGovId"
            @click="openDistDialog()"
          >
            إضافة منطقة
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-empty-state
            v-if="!selectedGovId"
            icon="mdi-arrow-left"
            title="اختر محافظة لعرض مناطقها"
          />
          <v-empty-state
            v-else-if="!selectedDistricts.length"
            icon="mdi-map-marker-off-outline"
            title="لا توجد مناطق لهذه المحافظة"
          />
          <v-list v-else>
            <v-list-item
              v-for="dist in selectedDistricts"
              :key="dist.id"
              :title="dist.name"
            >
              <template #append>
                <v-switch
                  :model-value="dist.is_active"
                  color="primary"
                  density="compact"
                  hide-details
                  @update:model-value="toggleDist(dist)"
                />
                <v-btn
                  icon="mdi-pencil"
                  size="small"
                  variant="text"
                  @click="openDistDialog(dist)"
                />
                <v-btn
                  icon="mdi-delete-outline"
                  color="error"
                  size="small"
                  variant="text"
                  @click="askDeleteDist(dist)"
                />
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </div>

    <v-dialog v-model="govDialog" width="460">
      <v-card rounded="lg">
        <v-card-title>{{
          editingGov ? "تعديل محافظة" : "إضافة محافظة"
        }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="govForm.name" label="اسم المحافظة" autofocus />
          <v-switch
            v-model="govForm.is_active"
            label="مفعّلة"
            color="primary"
            hide-details
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="govDialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="flat" @click="saveGov">حفظ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="distDialog" width="460">
      <v-card rounded="lg">
        <v-card-title>{{
          editingDist ? "تعديل منطقة" : "إضافة منطقة"
        }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="distForm.name" label="اسم المنطقة" autofocus />
          <v-switch
            v-model="distForm.is_active"
            label="مفعّلة"
            color="primary"
            hide-details
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="distDialog = false">إلغاء</v-btn>
          <v-btn color="primary" variant="flat" @click="saveDist">حفظ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </AppLayout>
</template>
