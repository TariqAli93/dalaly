import { reactive } from "vue";

type SnackbarColor = "success" | "error" | "info" | "warning";

const state = reactive({
  show: false,
  text: "",
  color: "success" as SnackbarColor,
});

function notify(text: string, color: SnackbarColor) {
  state.show = true;
  state.text = text;
  state.color = color;
}

export function useSnackbar() {
  return {
    state,
    notify,
    notifySuccess: (text: string) => notify(text, "success"),
    notifyError: (text: string) => notify(text, "error"),
    notifyInfo: (text: string) => notify(text, "info"),
  };
}
