/** What the inspector shows: a block, a clause, or (null) the document. */
export type StudioSelection = { kind: "block" | "clause"; id: string } | null;

/** Studio zoom steps, as fractions of 100%. */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
