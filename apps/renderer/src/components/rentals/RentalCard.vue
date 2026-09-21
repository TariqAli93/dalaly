<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { RentalRecord, RentalImage } from "../../types";
import * as rentals from "../../services/rentals.service";
import { getErrorMessage } from "../../services/api.service";
import { formatMoney } from "../../utils/format";
const props = defineProps<{ rental: RentalRecord; favorite?: boolean }>();
const emit = defineEmits<{ view: [RentalRecord]; favorite: [RentalRecord] }>();
const image = ref<RentalImage | null>(null);
const typeLabel: Record<string, string> = { house: "بيت", apartment: "شقة", shop: "محل", warehouse: "مخزن", other: "أخرى" };
const periodLabel: Record<string, string> = { monthly: "شهري", semi_annual: "نصف سنوي", annual: "سنوي" };
function imageUrl() { return image.value ? rentals.rentalImageUrl(props.rental.id, image.value.id) : ""; }
onMounted(async () => { try { image.value = (await rentals.listRentalImages(props.rental.id)).find((item) => item.is_primary) ?? null; } catch (e) { void getErrorMessage(e); } });
</script>
<template><v-card class="rental-card" variant="flat" border hover @click="emit('view', rental)"><div class="rental-card__image"><img v-if="image" :src="imageUrl()" alt="صورة الإيجار" /><v-icon v-else icon="mdi-home-outline" size="46" color="primary" /><v-btn class="rental-card__favorite" :icon="favorite ? 'mdi-heart' : 'mdi-heart-outline'" :color="favorite ? 'error' : undefined" variant="flat" size="small" @click.stop="emit('favorite', rental)" /></div><v-card-text><div class="d-flex justify-space-between align-center"><v-chip size="small" color="primary" variant="tonal">{{ typeLabel[rental.property_type] }}</v-chip><span class="text-caption">{{ rental.code }}</span></div><div class="rental-card__price mt-2">{{ formatMoney(rental.rent_price) }} <span>دينار / {{ periodLabel[rental.rent_period] }}</span></div><div class="d-flex flex-wrap ga-3 text-body-2 mt-3"><span><v-icon icon="mdi-ruler-square" size="16" /> {{ rental.area_value }} {{ rental.area_unit }}</span><span v-if="rental.rooms_count !== null"><v-icon icon="mdi-door" size="16" /> {{ rental.rooms_count }}</span><span v-if="rental.bathrooms_count !== null"><v-icon icon="mdi-shower" size="16" /> {{ rental.bathrooms_count }}</span></div><div class="text-body-2 mt-3 text-medium-emphasis"><v-icon icon="mdi-map-marker-outline" size="16" /> {{ [rental.governorate, rental.district, rental.neighborhood].filter(Boolean).join(' · ') || 'الموقع غير محدد' }}</div><v-chip v-if="rental.is_negotiable" class="mt-3" size="small" color="success" variant="tonal">قابل للتفاوض</v-chip></v-card-text></v-card></template>
<style scoped>.rental-card { height: 100%; cursor: pointer; }.rental-card__image { height: 170px; display: grid; place-items: center; background: rgba(var(--v-theme-on-surface), .04); position: relative; }.rental-card__image img { width: 100%; height: 100%; object-fit: cover; }.rental-card__favorite { position: absolute; inset-block-start: 8px; inset-inline-end: 8px; }.rental-card__price { font-size: 18px; font-weight: 700; color: rgb(var(--v-theme-primary)); }.rental-card__price span { font-size: 12px; font-weight: 400; color: rgba(var(--v-theme-on-surface), .68); }</style>
