import { computed, ref } from "vue";
import { useTheme } from "vuetify";
import { useAppearance } from "./useAppearance";

const THEME_KEY = "dalaly.theme";
const themeName = ref(
  localStorage.getItem(THEME_KEY) === "dalalyDark"
    ? "dalalyDark"
    : "dalalyLight",
);

export function useThemeMode() {
  const theme = useTheme();
  useAppearance();
  const isDark = computed(() => themeName.value === "dalalyDark");

  function apply() {
    theme.change(themeName.value);
  }

  function toggle() {
    themeName.value = isDark.value ? "dalalyLight" : "dalalyDark";
    localStorage.setItem(THEME_KEY, themeName.value);
    theme.change(themeName.value);
  }

  return { themeName, isDark, toggle, apply };
}
