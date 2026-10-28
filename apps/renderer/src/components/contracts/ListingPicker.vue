<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import * as propertiesService from "../../services/properties.service";
import * as rentalsService from "../../services/rentals.service";
import { getErrorMessage } from "../../services/api.service";
import { useSnackbar } from "../../composables/useSnackbar";
import { RENTAL_PROPERTY_LABELS } from "../../constants/domain";
import { formatMoney } from "../../utils/format";
import type { PropertyRecord, RentalRecord } from "../../types";

/**
 * Picks the listing a contract is about: a sale listing for a sale, a rental
 * listing for a lease. Searches the paged list on the server like
 * PersonPicker (first 20, then matches after a 300 ms pause); each result
 * shows its code, type, area and price to tell similar listings apart.
 */
type Listing = PropertyRecord | RentalRecord;
const model = defineModel<number | null>({ default: null });
const props = defineProps<{ kind: "sale" | "rent" }>();
const emit = defineEmits<{ picked: [Listing | null] }>();

const results = ref<Listing[]>([]);
const selected = ref<Listing | null>(null);
const loading = ref(false);
let controller: AbortController | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let loadedQuery: string | null = null;

const items = computed(() =>
  selected.value &&
  !results.value.some((item) => item.id === selected.value?.id)
    ? [selected.value, ...results.value]
    : results.value,
);

async function search(q: string) {
  if (q === loadedQuery) return;
  controller?.abort();
  const current = new AbortController();
  controller = current;
  loading.value = true;
  try {
    const page =
      props.kind === "sale"
        ? await propertiesService.listPropertiesPage(
            { q },
            {
              page: 1,
              page_size: 20,
              sort_by: "updated_at",
              sort_order: "desc",
            },
            current.signal,
          )
        : await rentalsService.listRentalsPage(
            { q },
            {
              page: 1,
              page_size: 20,
              sort_by: "updated_at",
              sort_order: "desc",
            },
            current.signal,
          );
    if (current.signal.aborted) return;
    results.value = page.items;
    loadedQuery = q;
  } catch (error) {
    if (!current.signal.aborted)
      useSnackbar().notifyError(getErrorMessage(error));
  } finally {
    if (controller === current) {
      controller = null;
      loading.value = false;
    }
  }
}

function onSearch(text: string | null) {
  const q = (text ?? "").trim();
  if (selected.value && q === titleOf(selected.value)) return;
  clearTimeout(timer);
  timer = setTimeout(() => void search(q), 300);
}

function titleOf(item: Listing) {
  return item.name || item.code;
}
function detailOf(item: Listing) {
  const type =
    props.kind === "rent"
      ? (RENTAL_PROPERTY_LABELS[item.property_type] ?? item.property_type)
      : item.property_type;
  const price =
    "total_price" in item
      ? formatMoney(item.total_price)
      : formatMoney((item as RentalRecord).rent_price);
  return [item.code, type, `${item.area_value} ${item.area_unit}`, price]
    .filter(Boolean)
    .join(" · ");
}

function onPick(id: number | null) {
  model.value = id;
  const found = results.value.find((item) => item.id === id) ?? null;
  selected.value = found;
  emit("picked", found);
}

watch(
  [model, () => props.kind],
  async ([id]) => {
    if (!id) {
      selected.value = null;
      return;
    }
    if (selected.value?.id === id) return;
    try {
      const item =
        props.kind === "sale"
          ? await propertiesService.getProperty(id)
          : await rentalsService.getRental(id);
      if (model.value === id) selected.value = item;
    } catch {
      // A listing deleted since: the id stays until another is picked.
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearTimeout(timer);
  controller?.abort();
});
</script>

<template>
  <v-autocomplete
    :model-value="model"
    :items="items"
    :loading="loading"
    :item-title="titleOf"
    item-value="id"
    no-filter
    :no-data-text="
      kind === 'sale'
        ? 'لا يوجد عرض بيع بهذا البحث'
        : 'لا يوجد عرض إيجار بهذا البحث'
    "
    @update:model-value="onPick"
    @update:search="onSearch"
    @update:menu="(open: boolean) => open && loadedQuery === null && search('')"
  >
    <template #item="{ props: itemProps, item }">
      <v-list-item v-bind="itemProps" :subtitle="detailOf(item.raw)" />
    </template>
  </v-autocomplete>
</template>
