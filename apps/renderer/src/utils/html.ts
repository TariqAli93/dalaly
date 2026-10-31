/** Text for an HTML document the renderer prints or exports: & < > " ' escaped. */
export function escapeHtml(value: string | null | undefined) {
  return (value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
