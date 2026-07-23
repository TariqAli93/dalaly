// منطق شاشة البدء: يستقبل التقدم من العملية الرئيسية عبر splashAPI الآمن،
// يحصر النسبة بين 0 و100، ويمنع رجوعها للخلف، ويقرأ رقم الإصدار ديناميكياً.
(() => {
  const statusEl = document.getElementById("status");
  const fillEl = document.getElementById("fill");
  const pctEl = document.getElementById("pct");
  const versionEl = document.getElementById("version");

  let currentPct = 0;
  let unsubscribe = null;

  function applyProgress(rawProgress, message, isError) {
    const progress = Math.max(0, Math.min(100, Number(rawProgress) || 0));
    // لا يعود للخلف: نعرض الأعلى فقط.
    if (progress >= currentPct) {
      currentPct = progress;
      fillEl.style.width = `${progress}%`;
      pctEl.textContent = `${progress}%`;
    }
    if (typeof message === "string" && message.length) {
      statusEl.textContent = message;
    }
    // حالة خطأ واضحة (رسالة فقط، بلا تفاصيل تقنية).
    document.body.classList.toggle("is-error", Boolean(isError));
  }

  if (window.splashAPI) {
    unsubscribe = window.splashAPI.onProgress((payload) => {
      applyProgress(
        payload && payload.progress,
        payload && payload.message,
        payload && payload.isError,
      );
    });

    window.splashAPI
      .getVersion()
      .then((version) => {
        if (version) {
          versionEl.textContent = "";
          versionEl.append("الإصدار ");
          const bdi = document.createElement("bdi");
          bdi.textContent = version;
          versionEl.append(bdi);
        }
      })
      .catch(() => {
        /* يبقى العنصر النائب "الإصدار —" */
      });
  }

  // إزالة المستمع عند إغلاق الصفحة لمنع تسرّب الذاكرة.
  window.addEventListener("beforeunload", () => {
    if (typeof unsubscribe === "function") unsubscribe();
  });
})();
