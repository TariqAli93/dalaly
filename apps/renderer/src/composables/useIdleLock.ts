import { ref } from "vue";

const IDLE_KEY = "dalaly.idleMinutes";
const idleMinutes = ref(Number(localStorage.getItem(IDLE_KEY) ?? 15));

let timer: ReturnType<typeof setTimeout> | null = null;
let onIdle: (() => void) | null = null;
const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];

function reset() {
  if (timer) clearTimeout(timer);
  if (idleMinutes.value > 0 && onIdle) {
    timer = setTimeout(() => onIdle?.(), idleMinutes.value * 60_000);
  }
}

/**
 * يبدأ مؤقّت الخمول: عند انقضاء المدة بدون نشاط يُستدعى handler
 * (عادةً تسجيل خروج تلقائي). يُستدعى من App.vue.
 */
function start(handler: () => void) {
  onIdle = handler;
  events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
  reset();
}

function stop() {
  if (timer) clearTimeout(timer);
  events.forEach((event) => window.removeEventListener(event, reset));
}

function setIdleMinutes(minutes: number) {
  idleMinutes.value = minutes;
  localStorage.setItem(IDLE_KEY, String(minutes));
  reset();
}

export function useIdleLock() {
  return { idleMinutes, start, stop, setIdleMinutes, reset };
}
