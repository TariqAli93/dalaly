/* global window, document, innerWidth, innerHeight, requestAnimationFrame -- installOverlay runs in the page */
// Teaching overlay drawn over the real app: a visible cursor with natural
// movement, click ripples, a focus ring, short instruction labels and Arabic
// title cards. It is pointer-events:none and outside #app, so it never
// changes what the app does or what Playwright's hit-testing sees. It reads
// the app's own theme variables and font, so titles shape Arabic exactly as
// the app does.

/** Runs in the page (passed to page.evaluate). Idempotent. */
export function installOverlay() {
  if (window.__tutorial) return;
  const root = document.createElement("div");
  root.id = "tutorial-overlay";
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483000;font-family:var(--dalaly-font, 'IBM Plex Sans Arabic', 'Segoe UI', sans-serif);direction:rtl";
  const style = document.createElement("style");
  style.textContent = `
    #tutorial-overlay .t-cursor{position:absolute;left:0;top:0;width:26px;height:26px;will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));transition:opacity .2s}
    #tutorial-overlay .t-ripple{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid rgb(var(--v-theme-accent, 176 138 62));opacity:.9;animation:t-ripple .55s ease-out forwards}
    @keyframes t-ripple{from{transform:scale(.3);opacity:.95}to{transform:scale(1.35);opacity:0}}
    #tutorial-overlay .t-ring{position:absolute;border:3px solid rgb(var(--v-theme-accent, 176 138 62));border-radius:6px;box-shadow:0 0 0 4px rgba(var(--v-theme-accent, 176 138 62),.22),0 0 0 100vmax rgba(15,30,36,.16);opacity:0;transition:opacity .25s ease, left .3s ease, top .3s ease, width .3s ease, height .3s ease}
    #tutorial-overlay .t-label{position:absolute;max-width:420px;padding:8px 14px;background:rgb(var(--v-theme-sidebar, 15 42 51));color:rgb(var(--v-theme-on-sidebar, 244 239 230));font-size:15px;line-height:1.55;border-inline-start:4px solid rgb(var(--v-theme-accent, 176 138 62));box-shadow:0 6px 18px rgba(0,0,0,.18);opacity:0;transform:translateY(4px);transition:opacity .25s ease, transform .25s ease}
    #tutorial-overlay .t-label.show,#tutorial-overlay .t-ring.show{opacity:1;transform:none}
    #tutorial-overlay .t-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgb(var(--v-theme-sidebar, 15 42 51));color:rgb(var(--v-theme-on-sidebar, 244 239 230));opacity:0;transition:opacity .45s ease;text-align:center}
    #tutorial-overlay .t-card.show{opacity:1}
    #tutorial-overlay .t-kicker{font-size:17px;letter-spacing:0;color:rgb(var(--v-theme-accent, 176 138 62))}
    #tutorial-overlay .t-title{font-family:var(--dal-display-font, inherit);font-size:52px;font-weight:700;line-height:1.25;max-width:80%}
    #tutorial-overlay .t-rule{width:96px;height:3px;background:rgb(var(--v-theme-accent, 176 138 62))}
    #tutorial-overlay .t-sub{font-size:20px;opacity:.85;max-width:70%;line-height:1.6}
    #tutorial-overlay .t-sync{position:absolute;inset:0;background:#000}
  `;
  root.appendChild(style);
  const cursor = document.createElement("div");
  cursor.className = "t-cursor";
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5v17.2l4.6-4.4 2.9 6.6 2.9-1.3-2.8-6.4h6.4z" fill="#fff" stroke="#14262c" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  root.appendChild(cursor);
  const ring = document.createElement("div");
  ring.className = "t-ring";
  root.appendChild(ring);
  const label = document.createElement("div");
  label.className = "t-label";
  root.appendChild(label);
  document.documentElement.appendChild(root);

  const state = { x: innerWidth / 2, y: innerHeight / 2 };
  const place = () => (cursor.style.transform = `translate(${state.x - 4}px, ${state.y - 2}px)`);
  place();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  window.__tutorial = {
    async moveTo(x, y, ms = 600) {
      const from = { x: state.x, y: state.y };
      const distance = Math.hypot(x - from.x, y - from.y);
      const duration = Math.max(180, Math.min(ms, 220 + distance * 0.9));
      // A slight arc reads as a hand, not a robot.
      const bend = Math.min(60, distance * 0.12);
      const start = performance.now();
      for (;;) {
        const t = Math.min(1, (performance.now() - start) / duration);
        const k = ease(t);
        state.x = from.x + (x - from.x) * k;
        state.y = from.y + (y - from.y) * k - Math.sin(Math.PI * k) * bend;
        place();
        if (t >= 1) break;
        await frame();
      }
    },
    press() {
      const ripple = document.createElement("div");
      ripple.className = "t-ripple";
      ripple.style.left = `${state.x}px`;
      ripple.style.top = `${state.y}px`;
      root.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    },
    ring(rect) {
      if (!rect) return ring.classList.remove("show");
      const pad = 6;
      Object.assign(ring.style, { left: `${rect.x - pad}px`, top: `${rect.y - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
      ring.classList.add("show");
    },
    label(text, rect) {
      if (!text) return label.classList.remove("show");
      label.textContent = text;
      const width = Math.min(420, label.offsetWidth || 320);
      let x = rect ? rect.x + rect.width / 2 - width / 2 : innerWidth / 2 - width / 2;
      // Labels stay clear of the bottom band, where the subtitles are burned in.
      let y = rect ? rect.y + rect.height + 14 : 64;
      if (rect && y + 70 > innerHeight - 90) y = Math.max(12, rect.y - 70);
      x = Math.max(12, Math.min(innerWidth - width - 12, x));
      Object.assign(label.style, { left: `${x}px`, top: `${y}px` });
      label.classList.add("show");
    },
    async card(content) {
      let card = root.querySelector(".t-card");
      if (!content) {
        if (!card) return;
        card.classList.remove("show");
        await new Promise((resolve) => setTimeout(resolve, 480));
        card.remove();
        cursor.style.opacity = "1";
        return;
      }
      if (!card) {
        card = document.createElement("div");
        card.className = "t-card";
        root.insertBefore(card, cursor);
      }
      card.innerHTML = "";
      for (const [className, text] of [["t-kicker", content.kicker], ["t-title", content.title], ["t-rule", ""], ["t-sub", content.subtitle]]) {
        if (className !== "t-rule" && !text) continue;
        const element = document.createElement("div");
        element.className = className;
        element.textContent = text;
        card.appendChild(element);
      }
      cursor.style.opacity = "0";
      await frame();
      card.classList.add("show");
      await new Promise((resolve) => setTimeout(resolve, 480));
    },
    clear() {
      ring.classList.remove("show");
      label.classList.remove("show");
    },
    /**
     * A full-frame pure black marker for the window recorder: it is found in
     * the capture (blackdetect) to tie video time to the step clock. Resolves
     * once the change has been painted (two animation frames).
     */
    async sync(on) {
      let marker = root.querySelector(".t-sync");
      if (on && !marker) {
        marker = document.createElement("div");
        marker.className = "t-sync";
        // Window capture delivers frames only when something changes: a 2 px
        // corner flickers between two blacks, so frames keep coming while the
        // marker shows (both count as black for blackdetect).
        const tick = document.createElement("div");
        tick.style.cssText = "position:absolute;left:0;top:0;width:2px;height:2px;background:#000";
        marker.appendChild(tick);
        root.appendChild(marker);
        const flicker = () => {
          if (!marker.isConnected) return;
          tick.style.background = tick.style.background === "rgb(0, 0, 0)" ? "#030303" : "#000";
          requestAnimationFrame(flicker);
        };
        requestAnimationFrame(flicker);
      } else if (!on) marker?.remove();
      await frame();
      await frame();
    },
    /**
     * A 16-bit frame counter in the client rows the recorder crops off
     * (`height` CSS px at the bottom, cells `cell` CSS px wide), advanced
     * every animation frame: read back from the capture it gives the real
     * rate of fresh frames and every stall, whatever the lesson shows. It is
     * never in the finished video.
     */
    clock(on, height, cell) {
      root.querySelector(".t-clock")?.remove();
      if (!on) return;
      const strip = document.createElement("div");
      strip.className = "t-clock";
      strip.style.cssText = `position:fixed;bottom:0;left:50%;transform:translateX(-50%);height:${height}px;width:${cell * 16}px;display:flex;z-index:2147483647`;
      const cells = Array.from({ length: 16 }, () => {
        const bit = document.createElement("div");
        bit.style.cssText = `width:${cell}px;height:100%;background:#000`;
        strip.appendChild(bit);
        return bit;
      });
      root.appendChild(strip);
      let count = 0;
      const advance = () => {
        if (!strip.isConnected) return;
        count = (count + 1) & 0xffff;
        cells.forEach((bit, index) => (bit.style.background = (count >> index) & 1 ? "#fff" : "#000"));
        requestAnimationFrame(advance);
      };
      requestAnimationFrame(advance);
    },
    position: () => ({ ...state }),
  };
}
