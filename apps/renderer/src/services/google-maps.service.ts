/// <reference types="google.maps" />

export const mapsConfig = {
  apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "",
  mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() ?? "",
};

let pending: Promise<void> | null = null;
let authError = false;
const failures = new Set<() => void>();

export function onMapsAuthFailure(callback: () => void) {
  failures.add(callback);
  return () => {
    failures.delete(callback);
  };
}

export async function loadGoogleMaps() {
  if (!mapsConfig.apiKey || !mapsConfig.mapId) {
    throw new Error(
      "خرائط Google غير مهيأة. يمكنك إدخال الإحداثيات والرابط وحفظهما يدوياً.",
    );
  }
  if (!navigator.onLine)
    throw new Error(
      "لا يوجد اتصال بالإنترنت. تبقى بيانات الموقع محفوظة ويمكن تعديلها يدوياً.",
    );
  if (authError)
    throw new Error(
      "تعذر التحقق من إعدادات خرائط Google. راجع مفتاح الخدمة وقيود الوصول.",
    );
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      if (
        typeof window.google !== "undefined" &&
        typeof google.maps?.importLibrary === "function"
      ) {
        resolve();
        return;
      }
      const globals = window as Window & {
        dalalyMapsReady?: () => void;
        gm_authFailure?: () => void;
      };
      const script = document.createElement("script");
      script.id = "dalaly-google-maps-api";
      script.async = true;
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        reject(
          new Error(
            "تعذر تحميل خرائط Google. تحقق من الإنترنت ثم أعد المحاولة؛ يمكنك حفظ الموقع يدوياً.",
          ),
        );
      };
      const timer = window.setTimeout(fail, 20000);
      globals.dalalyMapsReady = () => {
        clearTimeout(timer);
        resolve();
      };
      globals.gm_authFailure = () => {
        authError = true;
        fail();
        for (const callback of failures) callback();
      };
      script.onerror = fail;
      script.nonce =
        document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ?? "";
      const params = new URLSearchParams({
        key: mapsConfig.apiKey,
        v: "quarterly",
        loading: "async",
        callback: "dalalyMapsReady",
        language: "ar",
        region: "IQ",
      });
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      document.head.append(script);
    }).catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  await pending;
  const [maps, marker] = await Promise.all([
    google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
    google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
  ]);
  return { ...maps, ...marker, ColorScheme: google.maps.ColorScheme };
}
