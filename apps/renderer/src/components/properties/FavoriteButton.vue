<script setup lang="ts">
import { getErrorMessage } from "../../services/api.service";
import { useFavorites } from "../../composables/useFavorites";
import { useSnackbar } from "../../composables/useSnackbar";

const props = defineProps<{ propertyId: number; size?: string }>();

const { isFavorite, toggleFavorite } = useFavorites();
const { notifyError } = useSnackbar();

async function toggle() {
  try {
    await toggleFavorite(props.propertyId);
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
</script>

<template>
  <v-btn
    :icon="isFavorite(propertyId) ? 'mdi-heart' : 'mdi-heart-outline'"
    :color="isFavorite(propertyId) ? 'error' : undefined"
    :size="size ?? 'small'"
    variant="text"
    title="المفضلة"
    @click.stop="toggle"
  />
</template>
