<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import RentalCard from "../components/rentals/RentalCard.vue";
import RentalDetailsDialog from "../components/rentals/RentalDetailsDialog.vue";
import * as rentals from "../services/rentals.service";
import { getErrorMessage } from "../services/api.service";
import { useSnackbar } from "../composables/useSnackbar";
import type { RentalRecord } from "../types";
const router = useRouter(); const { notifyError } = useSnackbar(); const items = ref<RentalRecord[]>([]); const selected = ref<RentalRecord | null>(null); const open = ref(false); const favoriteIds = ref(new Set<number>());
async function load() { try { items.value = await rentals.listRentalFavorites(); favoriteIds.value = new Set(items.value.map((item) => item.id)); } catch (e) { notifyError(getErrorMessage(e)); } }
function remove(item: RentalRecord) { void rentals.removeRentalFavorite(item.id).then(load).catch((e) => notifyError(getErrorMessage(e))); }
function edit(item: RentalRecord) { open.value = false; void router.push(`/rentals/${item.id}/edit`); }
onMounted(() => void load());
</script>
<template><AppLayout title="مفضلة الإيجارات" subtitle="العروض الإيجارية المحفوظة للمستخدم الحالي."><v-btn variant="tonal" prepend-icon="mdi-arrow-right" class="mb-3" @click="router.push('/rentals')">كل الإيجارات</v-btn><v-row v-if="items.length"><v-col v-for="item in items" :key="item.id" cols="12" sm="6" lg="4" xl="3"><RentalCard :rental="item" favorite @view="selected = $event; open = true" @favorite="remove" /></v-col></v-row><v-empty-state v-else icon="mdi-heart-off-outline" title="لا توجد إيجارات مفضلة" text="أضف عروضاً إلى المفضلة من صفحة الإيجارات." /><RentalDetailsDialog v-model="open" :rental="selected" favorite can-manage @favorite="remove" @edit="edit" /></AppLayout></template>
