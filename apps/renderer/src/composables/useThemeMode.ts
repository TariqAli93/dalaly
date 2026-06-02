import { computed, ref } from "vue";
import { useTheme } from "vuetify";

const THEME_KEY = "dalaly.theme";
const themeName = ref(localStorage.getItem(THEME_KEY) ?? "dalalyLight");

export function useThemeMode() {
  const theme = useTheme();
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
