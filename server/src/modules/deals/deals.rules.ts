import { DEAL_STAGES } from "../../infrastructure/database/schema.js";

export { DEAL_STAGES };
export type DealStage = (typeof DEAL_STAGES)[number];

/** Stages of a deal still being worked, in pipeline order. */
export const OPEN_STAGES = [
  "new",
  "contacted",
  "qualified",
  "viewing_scheduled",
  "viewing_done",
  "negotiating",
  "agreed",
  "contract_preparation",
  "contract_issued",
] as const satisfies readonly DealStage[];
export const CLOSED_STAGES = [
  "won",
  "lost",
  "cancelled",
] as const satisfies readonly DealStage[];

/** Stages from which a deal can be closed as won: a price was agreed. */
const WINNABLE: readonly DealStage[] = [
  "agreed",
  "contract_preparation",
  "contract_issued",
];

export const isClosed = (stage: string) =>
  (CLOSED_STAGES as readonly string[]).includes(stage);

export type StageMoveDeal = {
  stage: string;
  agreedPrice: string | null;
  ownerPersonId: number | null;
  /** The linked contract's status, or null without one. */
  agreementStatus: string | null;
};

export type StageMoveInput = {
  reason?: string | null;
  lost_reason?: string | null;
};

/**
 * Whether a deal may move from its stage to `to`, and if not, why (in Arabic).
 * Open stages move freely among themselves, so a deal can go back a step;
 * closing and reopening have conditions, and a closed deal is reopened before
 * it can be closed another way.
 */
export function stageMoveError(
  deal: StageMoveDeal,
  to: DealStage,
  input: StageMoveInput = {},
): string | null {
  const reason = input.reason?.trim();
  if (deal.stage === to) return "الصفقة في هذه المرحلة أصلاً.";
  if (isClosed(deal.stage)) {
    if (isClosed(to)) return "أعد فتح الصفقة أولاً ثم أغلقها بالنتيجة الجديدة.";
    if (!reason) return "اذكر سبب إعادة فتح الصفقة.";
  }
  if (to === "contract_issued" && deal.agreementStatus !== "issued")
    return "لا تنتقل الصفقة إلى «صدر العقد» إلا بعقد صادر مرتبط بها.";
  if (to === "won") {
    if (!WINNABLE.includes(deal.stage as DealStage))
      return "لا تُكسب الصفقة إلا بعد الاتفاق على السعر.";
    if (!deal.agreedPrice) return "سجّل السعر المتفق عليه قبل كسب الصفقة.";
    if (!deal.ownerPersonId) return "حدد البائع أو المؤجر قبل كسب الصفقة.";
  }
  if (to === "lost" && !input.lost_reason?.trim())
    return "اذكر سبب خسارة الصفقة.";
  if (to === "cancelled" && !reason) return "اذكر سبب إلغاء الصفقة.";
  return null;
}

/** Moves that need deals.close: closing, and reopening a closed deal. */
export function needsClosePermission(from: string, to: DealStage) {
  return isClosed(to) || isClosed(from);
}
