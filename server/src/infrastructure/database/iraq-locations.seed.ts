import { and, eq, sql } from "drizzle-orm";
import { db } from "./db.js";
import { districts, governorates } from "./schema.js";

/**
 * Iraq's 18 governorates and their qada'a (districts).
 *
 * Names are stored in Arabic/Kurdish script because that is the canonical
 * display language used by the locations UI. The district coverage follows
 * the 2024 census table published by Iraq's Ministry of Planning / Central
 * Organization for Statistics. Halabja remains a district of Sulaymaniyah
 * here, not a separate governorate, to match the app's 18-governorate model.
 */
export const IRAQ_GOVERNORATES = [
  {
    name: "الأنبار",
    districts: [
      "الرمادي",
      "الفلوجة",
      "هيت",
      "الكرمة",
      "الحبانية",
      "القائم",
      "حديثة",
      "العامرية",
      "العبور",
      "الرطبة",
      "عانة",
      "راوة",
    ],
  },
  {
    name: "بابل",
    districts: [
      "الحلة",
      "المسيب",
      "الهاشمية",
      "المحاويل",
      "القاسم",
      "الكفل (النخيلة)",
      "كوثى",
    ],
  },
  {
    name: "بغداد",
    districts: [
      "الكرخ",
      "الرصافة",
      "الأعظمية",
      "المدائن",
      "سما الكاظمية",
      "المحمودية",
      "الصدر الأولى",
      "الزوراء",
      "أبي غريب",
      "الصدر الثانية",
      "الزهور",
      "الكاظمية",
      "فضاء الكاظمية",
      "الطارمية",
      "الراشدية",
    ],
  },
  {
    name: "البصرة",
    districts: [
      "البصرة",
      "أبو الخصيب",
      "الزبير",
      "شط العرب",
      "القرنة",
      "المدينة",
      "الهارثة",
      "الدير",
      "الصادق",
      "سفوان",
      "الفاو",
    ],
  },
  {
    name: "ديالى",
    districts: [
      "بعقوبة",
      "الخالص",
      "خانقين",
      "المقدادية",
      "بلدروز",
      "المنصورية",
      "كفري",
      "مندلي",
    ],
  },
  {
    name: "كربلاء",
    districts: [
      "كربلاء",
      "الحر",
      "الهندية",
      "الحسينية",
      "الجدول الغربي",
      "عين تمر",
    ],
  },
  {
    name: "دهوك",
    districts: [
      "دهوك",
      "سميل",
      "زاخو",
      "باتيفا",
      "العمادية",
      "عقرة",
      "الشيخان",
      "بردرش",
    ],
  },
  {
    name: "كركوك",
    districts: ["كركوك", "الحويجة", "داقوق", "دبس"],
  },
  {
    name: "ميسان",
    districts: [
      "العمارة",
      "علي الغربي",
      "الميمونة",
      "قلعة صالح",
      "المجر الكبير",
      "الكحلاء",
      "كميت",
    ],
  },
  {
    name: "المثنى",
    districts: [
      "السماوة",
      "الخضر",
      "الرميثة",
      "الوركاء",
      "السوير",
      "المجد",
      "الهلال",
      "النجمي",
      "السلمان",
    ],
  },
  {
    name: "أربيل",
    districts: [
      "أربيل",
      "بنصلاوة",
      "سوران",
      "خبات",
      "كوية",
      "بيرمام",
      "هرير",
      "ميركسور",
      "قوش تبة",
      "شقلاوة",
      "عنكاوة",
      "خليفان",
      "جومان",
      "رواندوز",
      "سيدكان",
    ],
  },
  {
    name: "النجف",
    districts: ["النجف", "الكوفة", "المناذرة", "المشخاب"],
  },
  {
    name: "نينوى",
    districts: [
      "الموصل",
      "تلعفر",
      "مخمور",
      "تلكيف",
      "الحمدانية",
      "سنجار",
      "البعاج",
      "الشيخان",
      "الحضر",
    ],
  },
  {
    name: "القادسية",
    districts: [
      "الديوانية",
      "عفك",
      "الشامية",
      "الحمزة",
      "آل بدير",
      "الدغارة",
      "غماس (الخورنق)",
      "الشافعية",
      "السنية",
      "سومر",
      "السدير",
      "المهناوية",
      "الشنافية",
    ],
  },
  {
    name: "صلاح الدين",
    districts: [
      "سامراء",
      "الشرقاط",
      "تكريت",
      "بلد",
      "بيجي",
      "طوز خورماتو",
      "الدجيل",
      "العلم",
      "الضلوعية",
      "الدور",
      "آمرلي",
    ],
  },
  {
    name: "السليمانية",
    districts: [
      "السليمانية",
      "كلار",
      "رانية",
      "بشدر",
      "حلبجة",
      "جمجمال",
      "سيد صادق",
      "دوكان",
      "شهرزور",
      "حاجياوا",
      "دربندخان",
      "بازيان",
      "بنجوين",
      "كفري",
      "شاربازير",
      "خانقين",
      "قره داغ",
      "ماوت",
    ],
  },
  {
    name: "ذي قار",
    districts: [
      "الناصرية",
      "الشطرة",
      "الغراف",
      "الرفاعي",
      "قلعة سكر",
      "النصر",
      "كرمة بني سعيد",
      "الدواية",
      "الفجر",
      "سيد دخيل",
      "الجبايش",
      "الفهود",
      "البطحاء",
      "الإصلاح",
      "سوق الشيوخ",
    ],
  },
  {
    name: "واسط",
    districts: [
      "الكوت",
      "الصويرة",
      "العزيزية",
      "الحي",
      "النعمانية",
      "بدرة",
      "الزبيدية",
      "الموفقية",
      "الأحرار",
    ],
  },
] as const;

export type IraqLocationSeedResult = {
  governoratesCreated: number;
  governoratesSkipped: number;
  districtsCreated: number;
  districtsSkipped: number;
};

/**
 * Inserts the reference locations atomically and idempotently.
 * The advisory lock closes the select-then-insert race because districts do
 * not currently have a composite unique constraint in the legacy schema.
 */
export async function seedIraqLocations(): Promise<IraqLocationSeedResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7342918)`);

    const result: IraqLocationSeedResult = {
      governoratesCreated: 0,
      governoratesSkipped: 0,
      districtsCreated: 0,
      districtsSkipped: 0,
    };

    for (const governorateSeed of IRAQ_GOVERNORATES) {
      const [existingGovernorate] = await tx
        .select({ id: governorates.id })
        .from(governorates)
        .where(eq(governorates.name, governorateSeed.name))
        .limit(1);

      let governorateId = existingGovernorate?.id;
      if (governorateId) {
        result.governoratesSkipped += 1;
      } else {
        const [createdGovernorate] = await tx
          .insert(governorates)
          .values({ name: governorateSeed.name })
          .returning({ id: governorates.id });
        governorateId = createdGovernorate.id;
        result.governoratesCreated += 1;
      }

      for (const districtName of governorateSeed.districts) {
        const [existingDistrict] = await tx
          .select({ id: districts.id })
          .from(districts)
          .where(
            and(
              eq(districts.governorateId, governorateId),
              eq(districts.name, districtName),
            ),
          )
          .limit(1);

        if (existingDistrict) {
          result.districtsSkipped += 1;
          continue;
        }

        await tx.insert(districts).values({
          governorateId,
          name: districtName,
        });
        result.districtsCreated += 1;
      }
    }

    return result;
  });
}
