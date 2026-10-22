/**
 * Runs `callback` once the browser has painted the current frame (the inner
 * requestAnimationFrame fires at the start of the next frame). Returns a
 * function that cancels it.
 */
export function afterNextPaint(callback: () => void): () => void {
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(callback);
  });
  return () => cancelAnimationFrame(frame);
}
