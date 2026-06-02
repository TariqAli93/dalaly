import { reactive } from "vue";
import { getErrorMessage } from "../services/api.service";
import { useSnackbar } from "./useSnackbar";

type ConfirmInput = {
  title: string;
  body: string;
  confirmText?: string;
  color?: string;
  onConfirm: () => Promise<void> | void;
};

type ConfirmState = {
  open: boolean;
  loading: boolean;
  title: string;
  body: string;
  confirmText: string;
  color: string;
  onConfirm: () => void | Promise<void>;
};

const state = reactive<ConfirmState>({
  open: false,
  loading: false,
  title: "",
  body: "",
  confirmText: "تأكيد",
  color: "primary",
  onConfirm: () => undefined,
});

function openConfirm(input: ConfirmInput) {
  state.open = true;
  state.loading = false;
  state.title = input.title;
  state.body = input.body;
  state.confirmText = input.confirmText ?? "تأكيد";
  state.color = input.color ?? "primary";
  state.onConfirm = input.onConfirm;
}

function close() {
  state.open = false;
}

async function runConfirmedAction() {
  const { notifyError } = useSnackbar();
  state.loading = true;
  try {
    await state.onConfirm();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    state.loading = false;
    state.open = false;
  }
}

export function useConfirm() {
  return { state, openConfirm, close, runConfirmedAction };
}
