import { reactive, watch } from "vue";
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

// سؤال ينتظر جواباً (confirmAsync): يُحسم بـ false إن أُغلق الحوار بلا تأكيد.
let pendingAnswer: ((confirmed: boolean) => void) | null = null;
watch(
  () => state.open,
  (open) => {
    if (open || !pendingAnswer) return;
    pendingAnswer(false);
    pendingAnswer = null;
  },
);

function openConfirm(input: ConfirmInput) {
  pendingAnswer?.(false);
  pendingAnswer = null;
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

/** الحوار نفسه، لمن يحتاج الجواب قيمةً (حارس مسار مثلاً) لا إجراءً. */
function confirmAsync(input: Omit<ConfirmInput, "onConfirm">) {
  return new Promise<boolean>((resolve) => {
    openConfirm({
      ...input,
      onConfirm: () => {
        pendingAnswer = null;
        resolve(true);
      },
    });
    pendingAnswer = resolve;
  });
}

export function useConfirm() {
  return { state, openConfirm, confirmAsync, close, runConfirmedAction };
}
