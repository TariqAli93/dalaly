import { ref } from "vue";
import * as favoritesService from "../services/favorites.service";

const favoriteIds = ref<Set<number>>(new Set());
const loaded = ref(false);

async function loadFavoriteIds(force = false) {
  if (loaded.value && !force) return;
  try {
    const result = await favoritesService.listFavoriteIds();
    favoriteIds.value = new Set(result.ids);
    loaded.value = true;
  } catch {
    // تجاهل
  }
}

function isFavorite(id: number) {
  return favoriteIds.value.has(id);
}

async function toggleFavorite(id: number) {
  if (favoriteIds.value.has(id)) {
    await favoritesService.removeFavorite(id);
    favoriteIds.value.delete(id);
  } else {
    await favoritesService.addFavorite(id);
    favoriteIds.value.add(id);
  }
  // إثارة التفاعلية
  favoriteIds.value = new Set(favoriteIds.value);
}

export function useFavorites() {
  return {
    favoriteIds,
    loadFavoriteIds,
    isFavorite,
    toggleFavorite,
    service: favoritesService,
  };
}
