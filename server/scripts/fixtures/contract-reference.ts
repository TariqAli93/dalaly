import type { ContractDocument } from "../../src/modules/contracts/legal-content.engine.js";
import { brandingSchema, layoutSchema, type VisualSnapshot } from "../../src/modules/contracts/contract-visual.engine.js";

// Explicit demonstration data. These documents are never saved or issued.
export function referenceFixture(kind: "sale" | "rental", lengthy = false): ContractDocument {
  const rental = kind === "rental";
  const roles = rental ? [["lessor", "المؤجر"], ["lessee", "المستأجر"]] : [["seller", "البائع"], ["buyer", "المشتري"]];
  return {
    schema_version: 1, ready: true, warnings: [], legal_versions: [],
    data: {
      code: rental ? "DEMO-RENT-002" : "DEMO-SALE-001", contract_type: kind,
      title: rental ? "اتفاق إيجار عقار — بيانات تجريبية" : "اتفاق بيع عقار — بيانات تجريبية", agreement_mode: "office",
      office: { name: "مكتب المعاينة التجريبي", role: "للوساطة العقارية", address: "عنوان تجريبي — بغداد", phone: "0770 000 0000", phone_secondary: "0780 000 0000", email: "office@example.test", license_number: "DEMO-ONLY", additional_contact: "نموذج معاينة تجريبي" },
      parties: roles.map(([role, label], i) => ({ role, label, name: i ? "اسم الطرف الثاني للاختبار" : "اسم الطرف الأول للاختبار", identity_number: `DEMO-ID-${i + 1}`, residence_card_number: `DEMO-RC-${i + 1}`, phone: "0770 000 0000", address: "عنوان سكن تجريبي — بغداد" })),
      assets: [{ id: 1, property_type: "house", details: [
        { label: "العقار", value: "عقار المعاينة التجريبي" }, { label: "جنس العقار", value: "دار سكنية" },
        { label: "العنوان", value: "عنوان عقار تجريبي — بغداد" }, { label: "رقم القطعة", value: "DEMO-45" },
        { label: "المساحة", value: "٣٠٠ متر" }, { label: "نوع السند", value: "معلومات تجريبية غير صالحة للإصدار" },
      ] }],
      financial: [
        { label: rental ? "الأجرة الشهرية المتفق عليها" : "سعر البيع المتفق عليه", value: rental ? "٧٥٠٬٠٠٠ د.ع" : "١٥٠٬٠٠٠٬٠٠٠ د.ع" },
        { label: rental ? "الدفعة المقدمة" : "المدفوع عند التوقيع", value: rental ? "٢٥٠٬٠٠٠ د.ع" : "٥٠٬٠٠٠٬٠٠٠ د.ع" },
        { label: "المتبقي", value: rental ? "٥٠٠٬٠٠٠ د.ع" : "١٠٠٬٠٠٠٬٠٠٠ د.ع" },
        { label: "معلومات الدفع", value: "جدول الدفع: بيانات تجريبية — دون تنفيذ دفع فعلي" },
      ],
      dates: [{ label: "تاريخ العقد", value: "٢٠٢٦/١٠/١٢" }, ...(rental ? [{ label: "بداية المدة", value: "٢٠٢٦/١١/٠١" }, { label: "نهاية المدة", value: "٢٠٢٧/١٠/٣١" }] : [])],
      attachments: roles.flatMap(([, label], i) => [{ party: label, name: "البطاقة الوطنية", number: `DEMO-ID-${i + 1}` }, { party: label, name: "بطاقة السكن", number: `DEMO-RC-${i + 1}` }]),
      legal_context: {}, additional_conditions: "شروط إضافية تجريبية للمراجعة فقط. EXTRA-END",
      explanation: "اتفاق المكتب العقاري لا يغني عن إجراءات التصديق أو التسجيل الرسمية المطلوبة.",
    },
    sections: [{ asset_id: 1, property_type: "house", template_id: 1, version: 1, approval_status: "approved", title: "الصيغة التجريبية — ليست للاستخدام القانوني", legal_basis: "اختبار", applicability_notes: "اختبار", clauses: Array.from({ length: lengthy ? 8 : 2 }, (_, i) => ({
      code: `demo_clause_${i + 1}`, title: `بند المعاينة التجريبي ${i + 1}`, version: 1, required: true,
      text: `${"هذا نص تجريبي لاختبار تصميم المستند ووضوح القراءة، وليس بنداً قانونياً للاستخدام الفعلي. يحافظ الاختبار على النص وترتيبه وتفاصيله كاملة دون حذف أو تلخيص. ".repeat(lengthy ? 12 : 1)}\nCLAUSE-${i + 1}-END`,
    })) }],
  };
}

export function referenceVisual(overrides: Partial<VisualSnapshot["layout_config"]> = {}): VisualSnapshot {
  return { id: 1, template_code: "sale_01", name: "معاينة تجريبية", version: 1, renderer_version: 2,
    layout_config: layoutSchema.parse({ font_size: 13, margin_mm: 10, line_height: 1.55, paragraph_spacing: 6, ...overrides }),
    branding_config: brandingSchema.parse({}) };
}
