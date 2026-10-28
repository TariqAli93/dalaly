/**
 * What stands between a draft and issuing it: missing parties, property or
 * terms, and fields the document shows that have no value. The API refuses
 * to issue while any remain; the renderer lists the same issues with a link
 * to the step that fixes each.
 */
import { formatContractDate } from "./format.js";
import {
  PARTY_ROLE_LABELS,
  TEMPLATES,
  rolesOf,
  type AgreementContext,
  type AgreementTerms,
  type ContractDocument,
  type TemplateKey,
} from "./model.js";
import { usedFields } from "./rich-text.js";
import {
  FIELD_BY_KEY,
  fieldsFor,
  fieldLabel,
  type FieldValues,
} from "./variables.js";

export type IssueStep = "parties" | "property" | "details" | "content";

export type ContractIssue = {
  code: string;
  message: string;
  step: IssueStep;
  field?: string;
  block_id?: string;
  clause_id?: string;
};

const positive = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function findIssues(
  template: TemplateKey,
  document: ContractDocument,
  context: AgreementContext,
  terms: AgreementTerms,
  values: FieldValues,
): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const kind = TEMPLATES[template].kind;

  for (const role of rolesOf(template)) {
    if (!context.parties[role])
      issues.push({
        code: "PARTY_MISSING",
        message: `لم يُحدَّد ${PARTY_ROLE_LABELS[role]}.`,
        step: "parties",
        field: role,
      });
  }
  if (!context.listing)
    issues.push({
      code: "PROPERTY_MISSING",
      message: "لم يُحدَّد العقار موضوع العقد.",
      step: "property",
    });

  const term = (field: keyof AgreementTerms, message: string) =>
    issues.push({ code: "TERM_MISSING", message, step: "details", field });

  if (!formatContractDate(terms.contract_date))
    term("contract_date", "تاريخ العقد مطلوب.");
  if (kind === "sale") {
    if (!positive(terms.sale_price)) term("sale_price", "ثمن البيع مطلوب.");
  }
  if (template === "installment_sale") {
    if (terms.down_payment === null || terms.down_payment < 0)
      term("down_payment", "الدفعة المقدمة مطلوبة (صفر إن لم توجد).");
    else if (
      positive(terms.sale_price) &&
      terms.down_payment >= (terms.sale_price ?? 0)
    )
      term("down_payment", "الدفعة المقدمة يجب أن تكون أقل من ثمن البيع.");
    if (
      !positive(terms.installment_count) ||
      !Number.isInteger(terms.installment_count)
    )
      term("installment_count", "عدد الأقساط مطلوب (عدد صحيح).");
    if (!formatContractDate(terms.first_due_date))
      term("first_due_date", "تاريخ استحقاق أول قسط مطلوب.");
  }
  if (kind === "rent") {
    if (!positive(terms.rent_amount)) term("rent_amount", "بدل الإيجار مطلوب.");
    if (!formatContractDate(terms.start_date))
      term("start_date", "تاريخ بدء الإيجار مطلوب.");
    if (!formatContractDate(terms.end_date))
      term("end_date", "تاريخ انتهاء الإيجار مطلوب.");
    else if (
      terms.start_date &&
      terms.end_date &&
      terms.end_date <= terms.start_date
    )
      term("end_date", "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.");
  }
  if (template === "commercial_rent" && !terms.permitted_use?.trim())
    term("permitted_use", "الغرض المسموح من الإيجار التجاري مطلوب.");

  if (
    !document.blocks.some(
      (block) => block.type === "clauses" && !block.hidden,
    ) ||
    !document.clauses.some((clause) => !clause.hidden)
  )
    issues.push({
      code: "NO_CLAUSES",
      message: "لا توجد بنود ظاهرة في العقد.",
      step: "content",
    });

  const offered = new Set(fieldsFor(template).map((field) => field.key));
  const reported = new Set<string>();
  for (const use of usedFields(document)) {
    const where = { block_id: use.block_id, clause_id: use.clause_id };
    // One issue per field, pointing at the first place it appears.
    if (reported.has(use.key)) continue;
    reported.add(use.key);
    if (!offered.has(use.key)) {
      issues.push({
        code: "UNKNOWN_FIELD",
        message: `الحقل «${fieldLabel(use.key)}» لا ينتمي إلى هذا النوع من العقود. احذفه من النص.`,
        step: "content",
        field: use.key,
        ...where,
      });
      continue;
    }
    if (values[use.key] !== undefined || FIELD_BY_KEY.get(use.key)?.optional)
      continue;
    issues.push({
      code: "FIELD_EMPTY",
      message: `لا توجد قيمة لـ«${fieldLabel(use.key)}».`,
      step: stepForField(use.key),
      field: use.key,
      ...where,
    });
  }
  return issues;
}

function stepForField(key: string): IssueStep {
  const group = key.split(".")[0]!;
  if (["seller", "buyer", "landlord", "tenant"].includes(group))
    return "parties";
  if (group === "property") return "property";
  // Office details are edited in Settings; the content step says so.
  if (group === "company") return "content";
  return "details";
}
