// منطق شاشة البدء: يستقبل التقدم من العملية الرئيسية عبر splashAPI الآمن،
// يحصر النسبة بين 0 و100، يمنع رجوعها للخلف، يقرأ الإصدار ديناميكياً،
// ويحوّل الشاشة إلى وضع خطأ (مع أزرار) عند فشل الإقلاع.
(() => {
  const statusEl = document.getElementById("status");
  const fillEl = document.getElementById("fill");
  const pctEl = document.getElementById("pct");
  const versionEl = document.getElementById("version");
  const errorMsgEl = document.getElementById("errorMsg");
  const retryBtn = document.getElementById("retryBtn");
  const logsBtn = document.getElementById("logsBtn");
  const quitBtn = document.getElementById("quitBtn");

  let currentPct = 0;
  let unsubscribe = null;

  function applyProgress(rawProgress, message, isError) {
    const progress = Math.max(0, Math.min(100, Number(rawProgress) || 0));
    // النسبة لا تتقدّم في حالة الخطأ، ولا تعود للخلف أبداً.
    if (!isError && progress >= currentPct) {
      currentPct = progress;
      fillEl.style.width = `${progress}%`;
      pctEl.textContent = `${progress}%`;
    }
    if (typeof message === "string" && message.length) {
      if (isError) errorMsgEl.textContent = message;
      else statusEl.textContent = message;
    }
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

    // أزرار شاشة الخطأ.
    if (retryBtn) retryBtn.addEventListener("click", () => window.splashAPI.retry());
    if (logsBtn) logsBtn.addEventListener("click", () => window.splashAPI.openLogs());
    if (quitBtn) quitBtn.addEventListener("click", () => window.splashAPI.quit());
  }

  // إزالة المستمع عند إغلاق الصفحة لمنع تسرّب الذاكرة.
  window.addEventListener("beforeunload", () => {
    if (typeof unsubscribe === "function") unsubscribe();
  });
})();
