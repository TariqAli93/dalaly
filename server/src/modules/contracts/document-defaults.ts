import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  contractTemplates,
  legalFormulations,
} from "../../infrastructure/database/schema.js";
import { saveManagedFile } from "../documents/documents.storage.js";
import { DEFAULT_DOCX } from "./default-docx.assets.js";
import { DOCX_MIME, inspectDocx } from "./docx.engine.js";

export const DEFAULT_FORMULATIONS = {
  sale: {
    systemKey: "dalaly_formulation_sale_v1",
    title: "صيغة البيع الأساسية",
    content:
      "اتفق {{seller_name}} بصفته البائع مع {{buyer_name}} بصفته المشتري على بيع العقار المبين في {{property_address}} بمبلغ إجمالي قدره {{contract_amount}} دينار عراقي.\nأقر الطرفان بأن المدفوع عند توقيع الاتفاق هو {{paid_amount}} دينار عراقي والمتبقي {{remaining_amount}} دينار عراقي، ويستكمل وفق شروط الدفع المتفق عليها.\nيلتزم الطرفان بتقديم المستندات والبيانات الصحيحة وتنفيذ شروط التسليم المتفق عليها.\nحرر هذا الاتفاق بتاريخ {{contract_date}}. يستكمل نقل الملكية لدى الجهات المختصة وفق الإجراءات المطلوبة، ولا تمثل هذه الوثيقة وحدها سند نقل ملكية.",
  },
  rental: {
    systemKey: "dalaly_formulation_rental_v1",
    title: "صيغة الإيجار الأساسية",
    content:
      "اتفق {{landlord_name}} بصفته المؤجر مع {{tenant_name}} بصفته المستأجر على إيجار العقار المبين في {{property_address}} خلال المدة المحددة في العقد وبأجرة متفق عليها قدرها {{contract_amount}} دينار عراقي للدورية المبينة.\nالدفعة المقدمة {{paid_amount}} دينار عراقي والمتبقي من المبلغ المتفق عليه {{remaining_amount}} دينار عراقي.\nيلتزم المستأجر بالمحافظة على العقار واستخدامه للغرض المتفق عليه، وتحدد مسؤوليات الخدمات والتسليم وفق الشروط المكتوبة في العقد.\nحرر هذا الاتفاق بتاريخ {{contract_date}}، ويقر الطرفان بصحة البيانات والشروط والتواقيع المثبتة فيه.",
  },
} as const;

// Inserts only. A repeated seed never resets wording, default choice, versions,
// uploaded files or a user's deliberate deletion of a system formulation.
export async function seedDocumentDefaults(executor: any = db) {
  await executor.transaction(async (tx: any) => {
    await tx.execute(sql`select pg_advisory_xact_lock(192820)`);
    for (const kind of ["sale", "rental"] as const) {
      const wording = DEFAULT_FORMULATIONS[kind];
      const existing = await tx
        .select()
        .from(legalFormulations)
        .where(eq(legalFormulations.systemKey, wording.systemKey));
      if (!existing.length) {
        const chosen = await tx
          .select()
          .from(legalFormulations)
          .where(
            and(
              eq(legalFormulations.contractType, kind),
              eq(legalFormulations.isDefault, true),
              isNull(legalFormulations.deletedAt),
            ),
          );
        await tx
          .insert(legalFormulations)
          .values({ ...wording, contractType: kind, isDefault: !chosen.length })
          .onConflictDoNothing();
      }
      const templateCode = `dalaly_docx_${kind}_v1`;
      const templates = await tx
        .select()
        .from(contractTemplates)
        .where(eq(contractTemplates.templateCode, templateCode));
      if (!templates.length) {
        const data = DEFAULT_DOCX[kind];
        const inspected = inspectDocx(Buffer.from(data, "base64"), true);
        const file = saveManagedFile(
          "contract-templates",
          data,
          `${kind}.docx`,
          DOCX_MIME,
        );
        const chosen = await tx
          .select()
          .from(contractTemplates)
          .where(
            and(
              eq(contractTemplates.contractType, kind),
              eq(contractTemplates.isDefault, true),
              eq(contractTemplates.isActive, true),
            ),
          );
        await tx
          .insert(contractTemplates)
          .values({
            contractType: kind,
            templateCode,
            name: kind === "sale" ? "قالب عقد البيع" : "قالب عقد الإيجار",
            body: "{{document}}",
            docxFilePath: file.filePath,
            docxFileName: `${kind}.docx`,
            docxHash: inspected.hash,
            docxVariables: inspected.variables,
            isDefault: !chosen.length,
          })
          .onConflictDoNothing();
      }
    }
  });
}
