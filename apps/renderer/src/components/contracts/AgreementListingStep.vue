<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import {
  pickListing,
  rolesOf,
  type AgreementContext,
  type AgreementTerms,
  type ContractIssue,
  type ListingRecord,
  type TemplateKey,
} from "@contract-document/index";
import ListingPicker from "./ListingPicker.vue";
import { usePermissions } from "../../composables/usePermissions";
import { RENTAL_PROPERTY_LABELS } from "../../constants/domain";
import { formatMoney, formatPlot } from "../../utils/format";
import type { PropertyRecord, RentalRecord } from "../../types";

/**
 * The listing the contract is about, from the office's sale or rental
 * listings. Picking one fills the price or rent when the terms have none,
 * and offers the listing's registered owner as the first party. A new
 * listing is added on its own page, which returns here once saved (the
 * draft is already saved, so nothing is lost on the way).
 */
const listingId = defineModel<number | null>("listingId", { required: true });
const terms = defineModel<AgreementTerms>("terms", { required: true });
const props = defineProps<{
  template: TemplateKey;
  agreementId: number;
  context: AgreementContext;
  firstPartyId: number | null;
  readonly?: boolean;
  issues: ContractIssue[];
}>();
const emit = defineEmits<{
  listing: [ListingRecord | null];
  useOwner: [number];
}>();
const router = useRouter();
const { can } = usePermissions();

const kind = computed(() =>
  rolesOf(props.template)[0] === "seller" ? "sale" : "rent",
);
const ownerPersonId = computed(
  () => props.context.listing?.owner_person_id ?? null,
);
const missing = computed(() =>
  props.issues.some((issue) => issue.code === "PROPERTY_MISSING"),
);

function onPicked(item: PropertyRecord | RentalRecord | null) {
  if (!item) {
    emit("listing", null);
    return;
  }
  const listing = pickListing(
    kind.value === "sale" ? "property" : "rental",
    item as unknown as Record<string, unknown>,
  );
  emit("listing", listing);
  // Fill the amount from the listing only when the contract has none yet.
  if (
    kind.value === "sale" &&
    terms.value.sale_price === null &&
    listing.total_price
  )
    terms.value = { ...terms.value, sale_price: listing.total_price };
  if (
    kind.value === "rent" &&
    terms.value.rent_amount === null &&
    listing.rent_price
  ) {
    const period = listing.rent_period;
    terms.value = {
      ...terms.value,
      rent_amount: listing.rent_price,
      rent_period:
        period === "monthly" || period === "semi_annual" || period === "annual"
          ? period
          : terms.value.rent_period,
    };
  }
}

function addListing() {
  void router.push(
    `${kind.value === "sale" ? "/properties/new" : "/rentals/new"}?contract=${props.agreementId}`,
  );
}

const facts = computed(() => {
  const listing = props.context.listing;
  if (!listing) return [];
  const type =
    listing.source === "rental"
      ? (RENTAL_PROPERTY_LABELS[listing.property_type ?? ""] ??
        listing.property_type)
      : listing.property_type;
  const rows = [
    { label: "الرمز", value: listing.code },
    { label: "النوع", value: type },
    {
      label: "المساحة",
      value:
        listing.area_value !== null
          ? `${listing.area_value} ${listing.area_unit ?? ""}`
          : null,
    },
    {
      label: "الموقع",
      value:
        [
          listing.governorate,
          listing.district,
          listing.neighborhood,
          listing.address_details,
        ]
          .filter(Boolean)
          .join("، ") || null,
    },
  ];
  if (listing.source === "property")
    rows.push(
      { label: "جنس العقار", value: listing.legal_type },
      {
        label: "رقم القطعة",
        value: formatPlot(listing.plot_number, listing.plot_letter) || null,
      },
      {
        label: "المقاطعة",
        value:
          [listing.subdistrict_number, listing.subdistrict_name]
            .filter(Boolean)
            .join(" ") || null,
      },
      {
        label: "السعر المعروض",
        value:
          listing.total_price !== null
            ? formatMoney(listing.total_price)
            : null,
      },
    );
  else
    rows.push(
      {
        label: "الغرف / الحمامات",
        value: [listing.rooms_count, listing.bathrooms_count].every(
          (v) => v === null,
        )
          ? null
          : `${listing.rooms_count ?? "—"} / ${listing.bathrooms_count ?? "—"}`,
      },
      {
        label: "البدل المعروض",
        value:
          listing.rent_price !== null ? formatMoney(listing.rent_price) : null,
      },
    );
  return rows;
});
</script>

<template>
  <section class="dal-panel listing" aria-label="العقار">
    <header class="dal-panel__header">
      <span class="dal-section-title">{{
        kind === "sale"
          ? "العقار المبيع (من عروض البيع)"
          : "المأجور (من عروض الإيجار)"
      }}</span>
    </header>
    <div class="listing__body">
      <div class="listing__pick">
        <ListingPicker
          v-model="listingId"
          :kind="kind"
          :label="kind === 'sale' ? 'اختر عرض البيع' : 'اختر عرض الإيجار'"
          placeholder="ابحث بالرمز أو الاسم أو المنطقة"
          :disabled="readonly"
          :error-messages="missing ? ['اختر العقار موضوع العقد.'] : []"
          clearable
          hide-details="auto"
          @picked="onPicked"
        />
        <v-btn
          v-if="
            !readonly &&
            can(kind === 'sale' ? 'properties.create' : 'rentals.create')
          "
          variant="tonal"
          prepend-icon="mdi-home-plus-outline"
          @click="addListing"
          >عرض جديد</v-btn
        >
      </div>

      <dl v-if="facts.length" class="listing__facts">
        <div v-for="fact in facts" :key="fact.label">
          <dt>{{ fact.label }}</dt>
          <dd :class="{ listing__missing: !fact.value }">
            <bdi>{{ fact.value ?? "غير مسجل" }}</bdi>
          </dd>
        </div>
      </dl>

      <v-alert
        v-if="!readonly && ownerPersonId && ownerPersonId !== firstPartyId"
        type="info"
        variant="tonal"
        density="compact"
      >
        لهذا العرض مالك مسجّل في الزبائن.
        <template #append>
          <v-btn
            size="small"
            variant="text"
            @click="emit('useOwner', ownerPersonId!)"
          >
            اعتماده {{ kind === "sale" ? "بائعاً" : "مؤجراً" }}
          </v-btn>
        </template>
      </v-alert>
    </div>
  </section>
</template>

<style scoped>
.listing__body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.listing__pick {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.listing__pick > :first-child {
  flex: 1 1 auto;
}
.listing__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px 16px;
  margin: 0;
}
.listing__facts dt {
  font-size: 12px;
  color: var(--dal-muted);
}
.listing__facts dd {
  margin: 0;
}
.listing__missing {
  color: rgb(var(--v-theme-warning));
}
</style>
