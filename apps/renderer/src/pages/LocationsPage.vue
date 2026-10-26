<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppPage from "../components/app/AppPage.vue";
import LocationColumn from "../components/admin/LocationColumn.vue";
import LocationDialog from "../components/admin/LocationDialog.vue";
import { getErrorMessage } from "../services/api.service";
import { useLocations } from "../composables/useLocations";
import { useConfirm } from "../composables/useConfirm";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import type { District, Governorate, Neighborhood } from "../types";

/**
 * المحافظات والمناطق والأحياء التي تُختار منها مواقع العروض والطلبات: ثلاثة
 * أعمدة، كل عمود يتبع اختيار ما قبله (من اليمين). العنصر المعطّل يبقى في
 * سجلاته لكنه لا يظهر في قوائم الاختيار.
 */
const { governorates, districts, neighborhoods, loadLocations, service } =
  useLocations();
const { openConfirm } = useConfirm();
const { notifySuccess, notifyError } = useSnackbar();
const { setRefreshHandler } = useRefresh();

const selectedGovId = ref<number | null>(null);
const selectedDistId = ref<number | null>(null);
const seedingIraqLocations = ref(false);

const selectedDistricts = computed(() =>
  districts.value.filter((d) => d.governorate_id === selectedGovId.value),
);
const selectedNeighborhoods = computed(() =>
  neighborhoods.value.filter((n) => n.district_id === selectedDistId.value),
);
const selectedGovName = computed(
  () => governorates.value.find((g) => g.id === selectedGovId.value)?.name,
);
const selectedDistName = computed(
  () => districts.value.find((d) => d.id === selectedDistId.value)?.name,
);

async function refresh() {
  await loadLocations(true);
  if (selectedGovId.value === null && governorates.value.length) {
    selectedGovId.value = governorates.value[0]!.id;
  }
}

async function seedIraqLocations() {
  if (seedingIraqLocations.value) return;
  seedingIraqLocations.value = true;
  try {
    await service.seedIraqLocations();
    await refresh();
    notifySuccess("تمت إضافة المحافظات والأقضية العراقية.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    seedingIraqLocations.value = false;
  }
}

function selectGov(id: number) {
  selectedGovId.value = id;
  selectedDistId.value = null;
}

// ─── حوار واحد للمستويات الثلاثة ───────────────────────────────────────
type Level = "gov" | "dist" | "neigh";
const NOUNS: Record<Level, string> = {
  gov: "المحافظة",
  dist: "المنطقة",
  neigh: "الحي",
};
const dialog = ref(false);
const dialogLevel = ref<Level>("gov");
const dialogItem = ref<Governorate | District | Neighborhood | null>(null);
function openDialog(
  level: Level,
  item?: Governorate | District | Neighborhood,
) {
  dialogLevel.value = level;
  dialogItem.value = item ?? null;
  dialog.value = true;
}

/** يرمي عند الفشل فيبقى الحوار مفتوحاً بما كُتب. */
async function saveLocation(value: { name: string; is_active: boolean }) {
  const level = dialogLevel.value;
  const item = dialogItem.value;
  try {
    if (level === "gov") {
      if (item) await service.updateGovernorate(item.id, value);
      else await service.createGovernorate(value);
    } else if (level === "dist") {
      if (item) await service.updateDistrict(item.id, value);
      else if (selectedGovId.value)
        await service.createDistrict({
          governorate_id: selectedGovId.value,
          ...value,
        });
    } else {
      if (item) await service.updateNeighborhood(item.id, value);
      else if (selectedDistId.value)
        await service.createNeighborhood({
          district_id: selectedDistId.value,
          ...value,
        });
    }
    await refresh();
    notifySuccess(`تم حفظ ${NOUNS[level]}.`);
  } catch (error) {
    notifyError(getErrorMessage(error));
    throw error;
  }
}

async function toggle(
  level: Level,
  item: Governorate | District | Neighborhood,
) {
  const payload = { name: item.name, is_active: !item.is_active };
  try {
    if (level === "gov") await service.updateGovernorate(item.id, payload);
    else if (level === "dist") await service.updateDistrict(item.id, payload);
    else await service.updateNeighborhood(item.id, payload);
    await refresh();
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function askDelete(level: Level, item: Governorate | District | Neighborhood) {
  openConfirm({
    title: `حذف ${item.name}`,
    body:
      level === "neigh"
        ? "لا يمكن الحذف إذا كان الحي مرتبطاً بعروض. عطّله بدل حذفه ليختفي من قوائم الاختيار."
        : `لا يمكن الحذف إذا كانت ${NOUNS[level]} مرتبطة بعروض. عطّلها بدل حذفها لتختفي من قوائم الاختيار.`,
    confirmText: "حذف",
    color: "error",
    onConfirm: async () => {
      if (level === "gov") {
        await service.deleteGovernorate(item.id);
        if (selectedGovId.value === item.id) {
          selectedGovId.value = null;
          selectedDistId.value = null;
        }
      } else if (level === "dist") {
        await service.deleteDistrict(item.id);
        if (selectedDistId.value === item.id) selectedDistId.value = null;
      } else await service.deleteNeighborhood(item.id);
      await refresh();
      notifySuccess(`تم حذف ${item.name}.`);
    },
  });
}

onMounted(() => {
  setRefreshHandler(refresh);
  void refresh();
});
</script>

<template>
  <AppPage title="المحافظات والمناطق">
    <template #header-actions>
      <v-btn
        variant="tonal"
        prepend-icon="mdi-map-marker-multiple-outline"
        :loading="seedingIraqLocations"
        :disabled="seedingIraqLocations"
        @click="seedIraqLocations"
        >إضافة محافظات العراق وأقضيتها</v-btn
      >
    </template>

    <div class="locations dal-fill">
      <LocationColumn
        title="المحافظات"
        noun="المحافظة"
        :items="governorates"
        :selected-id="selectedGovId"
        empty-text="لا توجد محافظات بعد. أضفها، أو استعمل «إضافة محافظات العراق وأقضيتها»."
        selectable
        @select="selectGov"
        @add="openDialog('gov')"
        @edit="openDialog('gov', $event as Governorate)"
        @toggle="toggle('gov', $event as Governorate)"
        @remove="askDelete('gov', $event as Governorate)"
      />
      <LocationColumn
        :title="selectedGovName ? `مناطق ${selectedGovName}` : 'المناطق'"
        noun="المنطقة"
        :items="selectedDistricts"
        :selected-id="selectedDistId"
        :waiting-for="selectedGovId ? null : 'محافظة'"
        empty-text="لا توجد مناطق لهذه المحافظة بعد."
        selectable
        @select="selectedDistId = $event"
        @add="openDialog('dist')"
        @edit="openDialog('dist', $event as District)"
        @toggle="toggle('dist', $event as District)"
        @remove="askDelete('dist', $event as District)"
      />
      <LocationColumn
        :title="selectedDistName ? `أحياء ${selectedDistName}` : 'الأحياء'"
        noun="الحي"
        :items="selectedNeighborhoods"
        :waiting-for="selectedDistId ? null : 'منطقة'"
        empty-text="لا توجد أحياء لهذه المنطقة بعد."
        @add="openDialog('neigh')"
        @edit="openDialog('neigh', $event as Neighborhood)"
        @toggle="toggle('neigh', $event as Neighborhood)"
        @remove="askDelete('neigh', $event as Neighborhood)"
      />
    </div>

    <LocationDialog
      v-model="dialog"
      :noun="NOUNS[dialogLevel].replace(/^ال/, '')"
      :masculine="dialogLevel === 'neigh'"
      :item="dialogItem"
      :save-item="saveLocation"
    />
  </AppPage>
</template>

<style scoped>
.locations {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dal-gutter);
}
.locations > * {
  min-height: 0;
}
@media (max-width: 900px) {
  .locations {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }
  .locations > * {
    height: 50dvh;
  }
}
</style>
