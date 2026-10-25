import { ref } from "vue";

type SnackbarColor = "success" | "error" | "info" | "warning";

/** زر في الإشعار (تراجع مثلاً)؛ يُنفَّذ مرة ويُغلق الإشعار. */
export type SnackbarAction = { label: string; run: () => void | Promise<void> };

export type SnackbarMessage = {
  id: string;
  text: string;
  color: SnackbarColor;
  timeout: number;
};

// طابور لا خانة واحدة: إشعار يتبع إشعاراً (حُفظ ثم وُجدت مطابقات) لا يمحو
// الأول قبل أن يُقرأ. الخطأ يبقى حتى يُغلق؛ النجاح والمعلومة 4 ثوانٍ.
const queue = ref<SnackbarMessage[]>([]);
const actions = new Map<string, SnackbarAction>();
let sequence = 0;

function notify(text: string, color: SnackbarColor, action?: SnackbarAction) {
  const id = `dal-snack-${++sequence}`;
  if (action) {
    actions.set(id, action);
    // الإشعارات القديمة لا تُستدعى أزرارها بعد اختفائها.
    if (actions.size > 20) actions.delete(actions.keys().next().value!);
  }
  const timeout = color === "error" ? -1 : action ? 6000 : 4000;
  queue.value = [...queue.value, { id, text, color, timeout }];
}

function actionFor(id: string) {
  return actions.get(id) ?? null;
}

export function useSnackbar() {
  return {
    queue,
    actionFor,
    notify,
    notifySuccess: (text: string, action?: SnackbarAction) =>
      notify(text, "success", action),
    notifyError: (text: string) => notify(text, "error"),
    notifyInfo: (text: string, action?: SnackbarAction) =>
      notify(text, "info", action),
  };
}
