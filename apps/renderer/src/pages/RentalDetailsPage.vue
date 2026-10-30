<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import RentalDetailsPanel from "../components/rentals/RentalDetailsPanel.vue";
import RecordFacts from "../components/shared/RecordFacts.vue";
import PhoneLink from "../components/shared/PhoneLink.vue";
import StatusChip from "../components/shared/StatusChip.vue";
import RecordFollowupDialog from "../components/shared/RecordFollowupDialog.vue";
import DealDialog from "../components/deals/DealDialog.vue";
import LeaseList from "../components/leases/LeaseList.vue";
import type { RecordFact } from "../components/shared/record";
import * as rentals from "../services/rentals.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useRentalActions } from "../composables/useRentalActions";
import { useSnackbar } from "../composables/useSnackbar";
import { formatMoney, formatNumber } from "../utils/format";
import { exportRentalFolder } from "../utils/listingExport";
import {
  RENT_PERIOD_LABELS,
  RENTAL_PROPERTY_LABELS,
} from "../constants/domain";
import type {
  DealPayload,
  DealRecord,
  FollowupTarget,
  RentalRecord,
} from "../types";

/**
 * صفحة العرض الإيجاري، بدل حوار التفاصيل (1120px): رابط ثابت، وعودة بـ Alt+←
 * إلى الصف نفسه، وتخطيط صفحة عرض البيع نفسه.
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { setRefreshHandler } = useRefresh();
const { notifyError, notifySuccess } = useSnackbar();
const rental = ref<RentalRecord | null>(null);

// صفقة على هذا العرض: المؤجر من العرض، والمستأجر يُختار في الحوار.
const dealDialog = ref(false);
const dealPreset = computed<Partial<DealPayload> | null>(() =>
  rental.value
    ? {
        deal_type: "rent",
        rental_id: rental.value.id,
        owner_person_id: rental.value.owner_person_id,
      }
    : null,
);
function onDealSaved(deal: DealRecord) {
  notifySuccess(`أُنشئت الصفقة ${deal.code}.`);
  void router.push(`/deals/${deal.id}`);
}
const error = ref("");
const loading = ref(false);
const favorite = ref(false);
const followupOpen = ref(false);
const panel = useTemplateRef<{ followupSaved: () => void }>("panel");
let requestId = 0;

async function load() {
  const current = ++requestId;
  loading.value = true;
  error.value = "";
  try {
    const id = Number(route.params.id);
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new Error("رقم العرض الإيجاري غير صالح.");
    const [record, favorites] = await Promise.all([
      rentals.getRental(id),
      rentals.listRentalFavoriteIds().catch(() => ({ ids: [] as number[] })),
    ]);
    if (current !== requestId) return;
    rental.value = record;
    favorite.value = favorites.ids.includes(id);
  } catch (cause) {
    if (current === requestId) {
      rental.value = null;
      error.value = getErrorMessage(cause);
    }
  } finally {
    if (current === requestId) loading.value = false;
  }
}
const { askArchive, askRestore, askDelete } = useRentalActions(
  async (action) => {
    if (action === "delete") await router.push("/rentals");
    else await load();
  },
);
function edit(record: RentalRecord) {
  void router.push(`/rentals/${record.id}/edit`);
}
async function toggleFavorite() {
  const record = rental.value;
  if (!record) return;
  try {
    if (favorite.value) await rentals.removeRentalFavorite(record.id);
    else await rentals.addRentalFavorite(record.id);
    favorite.value = !favorite.value;
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
async function exportFolder(record: RentalRecord) {
  try {
    const result = await exportRentalFolder(record);
    if (result.canceled) return;
    if (!result.ok) throw new Error(result.message ?? "تعذر تصدير الإيجار.");
    notifySuccess(
      `تم تصدير الإيجار مع صوره إلى: ${result.path ?? "المجلد المحدد"}`,
    );
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
watch(
  () => route.params.id,
  () => {
    rental.value = null;
    void load();
  },
  { immediate: true },
);
onMounted(() => setRefreshHandler(load));

const title = computed(() =>
  rental.value
    ? rental.value.name || `إيجار ${rental.value.code}`
    : "تفاصيل العرض الإيجاري",
);
const showCode = computed(
  () => rental.value && !title.value.includes(rental.value.code),
);

const facts = computed<RecordFact[]>(() => {
  const r = rental.value;
  if (!r) return [];
  const rooms = [
    r.rooms_count !== null ? `${r.rooms_count} غرف` : null,
    r.bathrooms_count !== null ? `${r.bathrooms_count} حمامات` : null,
    r.floors_count !== null ? `${r.floors_count} طوابق` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [
    {
      key: "price",
      label: "الإيجار",
      value: `${formatMoney(r.rent_price)} د.ع`,
      hint: [
        RENT_PERIOD_LABELS[r.rent_period] ?? r.rent_period,
        r.is_negotiable ? "قابل للتفاوض" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      emphasis: true,
    },
    {
      key: "location",
      label: "الموقع",
      value: [r.governorate, r.district, r.neighborhood]
        .filter(Boolean)
        .join(" · "),
      hint: r.address_details,
    },
    { key: "owner", label: "المالك", value: r.owner_name },
    {
      key: "area",
      label: "المساحة",
      value: `${formatNumber(r.area_value)} ${r.area_unit ?? ""}`.trim(),
      hint: [RENTAL_PROPERTY_LABELS[r.property_type] ?? r.property_type, rooms]
        .filter(Boolean)
        .join(" · "),
    },
  ];
});

const followupTarget = computed<FollowupTarget | null>(() =>
  rental.value
    ? { kind: "rental", listingId: rental.value.id, listingLabel: title.value }
    : null,
);
</script>

<template>
  <AppPage :title="title" :parent="{ to: '/rentals', label: 'عروض الإيجار' }">
    <template v-if="rental" #status>
      <bdi v-if="showCode" class="text-medium-emphasis">{{ rental.code }}</bdi>
      <StatusChip :status="rental.status" />
    </template>
    <template v-if="rental" #header-actions>
      <v-btn
        v-if="can('deals.create') && rental.status !== 'archived'"
        variant="text"
        prepend-icon="mdi-handshake-outline"
        @click="dealDialog = true"
        >صفقة</v-btn
      >
      <v-btn
        v-if="can('rentals.update')"
        color="primary"
        prepend-icon="mdi-pencil-outline"
        @click="edit(rental)"
        >تعديل</v-btn
      >
      <v-btn
        v-if="can('rentals.followups.create')"
        variant="text"
        prepend-icon="mdi-phone-plus-outline"
        @click="followupOpen = true"
        >تسجيل متابعة</v-btn
      >
      <v-btn
        :icon="favorite ? 'mdi-heart' : 'mdi-heart-outline'"
        :color="favorite ? 'error' : undefined"
        variant="text"
        :aria-pressed="favorite"
        :aria-label="favorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'"
        :title="favorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'"
        @click="toggleFavorite"
      />
      <v-menu
        v-if="
          can('rentals.export') ||
          can('rentals.archive') ||
          can('rentals.restore') ||
          can('rentals.delete')
        "
        location="bottom end"
      >
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            icon="mdi-dots-horizontal"
            variant="text"
            aria-label="أوامر أخرى للعرض الإيجاري"
            title="أوامر أخرى"
          />
        </template>
        <v-list density="compact" min-width="220">
          <v-list-item
            v-if="can('rentals.export')"
            prepend-icon="mdi-folder-download-outline"
            title="تصدير ملف نصي والصور"
            @click="exportFolder(rental)"
          />
          <v-list-item
            v-if="rental.status === 'archived' && can('rentals.restore')"
            prepend-icon="mdi-archive-arrow-up-outline"
            title="إرجاع من الأرشيف"
            @click="askRestore(rental)"
          />
          <v-list-item
            v-else-if="rental.status !== 'archived' && can('rentals.archive')"
            prepend-icon="mdi-archive-arrow-down-outline"
            title="أرشفة"
            @click="askArchive(rental)"
          />
          <template v-if="can('rentals.delete')">
            <v-divider />
            <v-list-item
              prepend-icon="mdi-delete-outline"
              title="حذف"
              base-color="error"
              @click="askDelete(rental)"
            />
          </template>
        </v-list>
      </v-menu>
    </template>

    <v-skeleton-loader v-if="loading && !rental" type="table-heading, image" />
    <v-alert v-else-if="error" type="error" variant="tonal"
      >{{ error
      }}<template #append
        ><v-btn variant="text" @click="load">إعادة المحاولة</v-btn></template
      ></v-alert
    >
    <template v-else-if="rental">
      <RecordFacts :facts="facts" label="هوية العرض الإيجاري">
        <template #owner>
          <router-link
            v-if="rental.owner_person_id && can('people.read')"
            :to="`/clients/${rental.owner_person_id}`"
            class="record-link"
            >{{ rental.owner_name }}</router-link
          >
          <span v-else>{{ rental.owner_name || "—" }}</span>
          <PhoneLink :phone="rental.owner_phone" :name="rental.owner_name" />
        </template>
      </RecordFacts>
      <section
        v-if="can('leases.read')"
        class="dal-panel rental-leases"
        aria-label="إيجارات العرض"
      >
        <h2 class="rental-leases__title">الإيجارات</h2>
        <LeaseList :filters="{ rental_id: rental.id }" />
      </section>
      <RentalDetailsPanel
        ref="panel"
        :key="rental.id"
        :rental="rental"
        @edit="edit"
      />
    </template>
    <RecordFollowupDialog
      v-model="followupOpen"
      :target="followupTarget"
      @saved="panel?.followupSaved()"
    />
    <DealDialog
      v-model="dealDialog"
      :preset="dealPreset"
      @saved="onDealSaved"
    />
  </AppPage>
</template>

<style scoped>
.rental-leases {
  padding: 12px 16px;
  margin-bottom: 12px;
}
.rental-leases__title {
  margin: 0 0 8px;
  font-size: 0.95rem;
  font-weight: 700;
}
</style>
