import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { agreements, deals } from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import {
  TEMPLATES,
  rolesOf,
  type TemplateKey,
} from "../../shared/contract-document/index.js";
import {
  createAgreement,
  deleteDraft,
  getAgreementRow,
  readTerms,
  saveDraft,
} from "../agreements/agreements.repository.js";
import { recordAudit } from "../audit/audit.service.js";
import { getDealDetail, moveDealStageIn } from "./deals.repository.js";
import { OPEN_STAGES, isClosed } from "./deals.rules.js";

/**
 * A deal and its contract. Preparing one drafts a contract from the chosen
 * template with the deal's parties, listing, currency, price and commission,
 * links it, and moves a deal still before "contract preparation" there.
 * Issuing a linked contract later moves the deal to "contract issued".
 */

const STAGE_INDEX = (stage: string) =>
  OPEN_STAGES.indexOf(stage as (typeof OPEN_STAGES)[number]);

/** An amount string of a deal as the contract terms keep it (a number). */
const termAmount = (value: string | null) =>
  value === null ? null : Number(value);

export async function prepareDealAgreement(
  dealId: number,
  template: TemplateKey,
  userId: number,
) {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) return null;
  if (isClosed(deal.stage))
    throw new DomainError(409, "الصفقة مغلقة؛ أعد فتحها لإعداد عقد لها.");
  if (TEMPLATES[template].kind !== deal.dealType)
    throw new DomainError(
      400,
      deal.dealType === "sale"
        ? "صفقة البيع تُعدّ بعقد بيع."
        : "صفقة الإيجار تُعدّ بعقد إيجار.",
    );
  if (deal.agreementId) {
    const current = await getAgreementRow(deal.agreementId).catch(() => null);
    if (current && current.status !== "cancelled")
      throw new DomainError(
        409,
        "للصفقة عقد مرتبط بها. افتحه، أو ألغه أولاً لإعداد عقد جديد.",
        "DEAL_HAS_AGREEMENT",
      );
  }

  const created = await createAgreement(template, userId);
  const [ownerRole, clientRole] = rolesOf(template);
  const terms = readTerms(created.terms);
  const price = termAmount(deal.agreedPrice ?? deal.askingPrice);
  try {
    await saveDraft(
      created.id,
      {
        base_rev: created.draftRev,
        parties: [
          ...(deal.ownerPersonId
            ? [{ role: ownerRole, person_id: deal.ownerPersonId }]
            : []),
          { role: clientRole, person_id: deal.clientPersonId },
        ],
        ...(deal.dealType === "sale"
          ? { property_id: deal.propertyId }
          : { rental_id: deal.rentalId }),
        terms: {
          ...terms,
          currency: deal.currency as "IQD" | "USD",
          ...(deal.dealType === "sale"
            ? { sale_price: price }
            : { rent_amount: price }),
          commission: termAmount(deal.expectedCommission),
        },
      },
      userId,
    );
  } catch (error) {
    await deleteDraft(created.id, userId).catch(() => undefined);
    throw error;
  }

  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(deals)
      .where(eq(deals.id, dealId))
      .for("update");
    if (!locked) return;
    await tx
      .update(deals)
      .set({
        agreementId: created.id,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, dealId));
    if (
      !isClosed(locked.stage) &&
      STAGE_INDEX(locked.stage) < STAGE_INDEX("contract_preparation")
    )
      await moveDealStageIn(
        tx,
        { ...locked, agreementId: created.id },
        "contract_preparation",
        { reason: `أُعدّ العقد ${created.code}.` },
        userId,
      );
  });
  await recordAudit({
    entityType: "deal",
    entityId: dealId,
    action: "updated",
    newValue: { agreement_id: created.id, agreement_code: created.code },
    userId,
  });
  return { deal: await getDealDetail(dealId), agreement_id: created.id };
}

/**
 * After a contract is issued: each open deal linked to it that has not
 * reached "contract issued" moves there, recorded with the contract's code.
 */
export async function onAgreementIssued(agreementId: number, userId: number) {
  const linked = await db
    .select({ id: deals.id })
    .from(deals)
    .innerJoin(agreements, eq(deals.agreementId, agreements.id))
    .where(
      and(
        eq(deals.agreementId, agreementId),
        inArray(deals.stage, [...OPEN_STAGES]),
      ),
    );
  for (const { id } of linked)
    await db.transaction(async (tx) => {
      const [deal] = await tx
        .select()
        .from(deals)
        .where(eq(deals.id, id))
        .for("update");
      if (
        !deal ||
        isClosed(deal.stage) ||
        STAGE_INDEX(deal.stage) >= STAGE_INDEX("contract_issued")
      )
        return;
      const [agreement] = await tx
        .select({ code: agreements.code })
        .from(agreements)
        .where(eq(agreements.id, agreementId));
      await moveDealStageIn(
        tx,
        deal,
        "contract_issued",
        { reason: `صدر العقد ${agreement?.code ?? ""}.` },
        userId,
      );
    });
}
