<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import RentalFilters from "../components/rentals/RentalFilters.vue";
import RentalCard from "../components/rentals/RentalCard.vue";
import RentalDetailsDialog from "../components/rentals/RentalDetailsDialog.vue";
import * as rentals from "../services/rentals.service";
import { getErrorMessage } from "../services/api.service";
import { useLocations } from "../composables/useLocations";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { useConfirm } from "../composables/useConfirm";
import { useRefresh } from "../composables/useRefresh";
import type { RentalFilters as RentalFiltersType, RentalRecord } from "../types";
const router = useRouter(); const { loadLocations } = useLocations(); const { can } = usePermissions(); const { notifyError, notifySuccess } = useSnackbar(); const { openConfirm } = useConfirm(); const { setRefreshHandler } = useRefresh();
const filters = ref<RentalFiltersType>({ property_type: "", rent_period: "", rent_price_min: "", rent_price_max: "", area_min: "", area_max: "", rooms_count: "", bathrooms_count: "", floors_count: "", governorate_id: null, district_id: null, neighborhood_id: null, status: "", negotiable: "", amenities: "", q: "" });
const items = ref<RentalRecord[]>([]); const favoriteIds = ref(new Set<number>()); const loading = ref(false); const selected = ref<RentalRecord | null>(null); const detailsOpen = ref(false);
async function load() { loading.value = true; try { items.value = await rentals.listRentals(filters.value); const result = await rentals.listRentalFavoriteIds(); favoriteIds.value = new Set(result.ids); } catch (e) { notifyError(getErrorMessage(e)); } finally { loading.value = false; } }
function clear() { filters.value = { ...filters.value, property_type: "", rent_period: "", rent_price_min: "", rent_price_max: "", area_min: "", area_max: "", rooms_count: "", bathrooms_count: "", floors_count: "", governorate_id: null, district_id: null, neighborhood_id: null, status: "", negotiable: "", q: "" }; void load(); }
function view(item: RentalRecord) { selected.value = item; detailsOpen.value = true; }
async function favorite(item: RentalRecord) { try { if (favoriteIds.value.has(item.id)) { await rentals.removeRentalFavorite(item.id); favoriteIds.value.delete(item.id); } else { await rentals.addRentalFavorite(item.id); favoriteIds.value.add(item.id); } favoriteIds.value = new Set(favoriteIds.value); } catch (e) { notifyError(getErrorMessage(e)); } }
function edit(item: RentalRecord) { detailsOpen.value = false; void router.push(`/rentals/${item.id}/edit`); }
function archive(item: RentalRecord) { openConfirm({ title: `أرشفة ${item.code}`, body: "سيبقى العرض محفوظاً لكنه لن يظهر في القائمة الافتراضية.", confirmText: "أرشفة", color: "warning", onConfirm: async () => { try { await rentals.archiveRental(item.id); detailsOpen.value = false; await load(); notifySuccess("تمت الأرشفة."); } catch (e) { notifyError(getErrorMessage(e)); } } }); }
function restore(item: RentalRecord) { openConfirm({ title: `إرجاع ${item.code}`, body: "إرجاع العرض إلى حالة متاح؟", confirmText: "إرجاع", color: "success", onConfirm: async () => { try { await rentals.restoreRental(item.id); detailsOpen.value = false; await load(); notifySuccess("تم الإرجاع."); } catch (e) { notifyError(getErrorMessage(e)); } } }); }
function remove(item: RentalRecord) { openConfirm({ title: `حذف ${item.code}`, body: "سيتم حذف العرض وصوره ومتابعاته نهائياً.", confirmText: "حذف", color: "error", onConfirm: async () => { try { await rentals.deleteRental(item.id); detailsOpen.value = false; await load(); notifySuccess("تم حذف العرض."); } catch (e) { notifyError(getErrorMessage(e)); } } }); }
onMounted(async () => { await loadLocations(); setRefreshHandler(load); await load(); });
</script>
<template><AppLayout title="الإيجارات" subtitle="بحث وإدارة مستقلة للعروض الإيجارية."><template #header-actions><v-btn v-if="can('rentals.create')" color="primary" prepend-icon="mdi-plus" @click="router.push('/rentals/new')">إضافة إيجار</v-btn><v-btn v-if="can('rentals.read')" variant="tonal" prepend-icon="mdi-heart-outline" @click="router.push('/rental-favorites')">مفضلة الإيجارات</v-btn></template><RentalFilters v-model="filters" @apply="load" @clear="clear" /><div class="d-flex align-center mb-3"><span class="text-body-2">{{ items.length }} عرض إيجاري</span><v-spacer /><v-progress-circular v-if="loading" indeterminate size="20" width="2" /></div><v-row v-if="!loading && items.length"><v-col v-for="item in items" :key="item.id" cols="12" sm="6" lg="4" xl="3"><RentalCard :rental="item" :favorite="favoriteIds.has(item.id)" @view="view" @favorite="favorite" /></v-col></v-row><v-empty-state v-else-if="!loading" icon="mdi-home-search-outline" title="لا توجد عروض إيجارية" text="غيّر الفلاتر أو أضف أول عرض إيجاري." /><RentalDetailsDialog v-model="detailsOpen" :rental="selected" :favorite="selected ? favoriteIds.has(selected.id) : false" :can-manage="can('rentals.update')" @favorite="favorite" @edit="edit" @archive="archive" @restore="restore" @delete="remove" /></AppLayout></template>
