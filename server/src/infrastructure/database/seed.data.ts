/**
 * بيانات البذر التجريبية (Demo Seed Data).
 *
 * كل الأسماء والأرقام هنا وهمية وللتطوير والاختبار فقط — لا تُشغّل على
 * قاعدة بيانات إنتاج. الهيكل: محافظات → مناطق → أحياء، ثم عروض تشير إليها
 * بالاسم عبر `location` (يُحوَّل إلى معرّفات عند البذر).
 */

/** المستخدمون التجريبيون بأدوارهم. الـ PIN بصيغة نصية كما يدخله المستخدم. */
export const SEED_ROLES = [
  {
    name: "مدير المكتب",
    description: "يدير العروض والمستخدمين والمتابعات دون صلاحيات حذف حرجة.",
    permissions: [
      "properties.read",
      "properties.create",
      "properties.update",
      "properties.archive",
      "properties.restore",
      "properties.images.manage",
      "properties.export",
      "users.read",
      "roles.read",
      "settings.read",
      "locations.manage",
      "audit.read",
      "security.change_pin",
      "backups.read",
      "backups.create",
      "followups.read",
      "followups.create",
      "followups.update",
      "followups.delete"
    ]
  },
  {
    name: "موظف مبيعات",
    description: "يضيف ويتابع العروض فقط.",
    permissions: [
      "properties.read",
      "properties.create",
      "properties.update",
      "properties.images.manage",
      "properties.export",
      "security.change_pin",
      "followups.read",
      "followups.create",
      "followups.update"
    ]
  }
] as const;

export const SEED_USERS = [
  {
    username: "manager",
    displayName: "أبو أحمد — مدير المكتب",
    pin: "2222",
    roles: ["مدير المكتب"]
  },
  {
    username: "agent",
    displayName: "سيف — موظف مبيعات",
    pin: "3333",
    roles: ["موظف مبيعات"]
  },
  {
    username: "agent2",
    displayName: "نور — موظفة مبيعات",
    pin: "4444",
    roles: ["موظف مبيعات"]
  }
] as const;

/** المحافظات ← المناطق ← الأحياء. */
export const SEED_LOCATIONS = [
  {
    name: "بغداد",
    districts: [
      { name: "المنصور", neighborhoods: ["حي الجامعة", "اليرموك", "الداودي"] },
      { name: "الكرادة", neighborhoods: ["كرادة داخل", "الجادرية", "زيونة"] },
      { name: "الدورة", neighborhoods: ["الميكانيك", "حي العسكري"] }
    ]
  },
  {
    name: "البصرة",
    districts: [
      { name: "شط العرب", neighborhoods: ["الأندلس", "حي الحسين"] },
      { name: "الزبير", neighborhoods: ["حي الرافدين", "البرجسية"] }
    ]
  },
  {
    name: "أربيل",
    districts: [
      { name: "عينكاوا", neighborhoods: ["حي المسيحيين", "الشلالات"] },
      { name: "شقلاوة", neighborhoods: ["حي الجبل"] }
    ]
  }
] as const;

type SeedLocation = {
  governorate: string;
  district: string;
  neighborhood: string;
};

export type SeedProperty = {
  location: SeedLocation;
  /** يُمرَّر إلى propertyPayloadSchema بعد إضافة معرّفات الموقع. */
  payload: Record<string, unknown>;
  /** متابعات تُنشأ للعرض، بإزاحة أيام عن الآن (سالبة = ماضية). */
  followups?: { type: string; notes: string; inDays?: number }[];
};

const BAGHDAD_MANSOUR = {
  governorate: "بغداد",
  district: "المنصور",
  neighborhood: "حي الجامعة"
};
const BAGHDAD_YARMOUK = {
  governorate: "بغداد",
  district: "المنصور",
  neighborhood: "اليرموك"
};
const BAGHDAD_KARRADA = {
  governorate: "بغداد",
  district: "الكرادة",
  neighborhood: "كرادة داخل"
};
const BAGHDAD_ZAYOUNA = {
  governorate: "بغداد",
  district: "الكرادة",
  neighborhood: "زيونة"
};
const BAGHDAD_DORA = {
  governorate: "بغداد",
  district: "الدورة",
  neighborhood: "الميكانيك"
};
const BASRA_SHATT = {
  governorate: "البصرة",
  district: "شط العرب",
  neighborhood: "الأندلس"
};
const BASRA_ZUBAIR = {
  governorate: "البصرة",
  district: "الزبير",
  neighborhood: "البرجسية"
};
const ERBIL_ANKAWA = {
  governorate: "أربيل",
  district: "عينكاوا",
  neighborhood: "الشلالات"
};
const ERBIL_SHAQLAWA = {
  governorate: "أربيل",
  district: "شقلاوة",
  neighborhood: "حي الجبل"
};

export const SEED_PROPERTIES: SeedProperty[] = [
  {
    location: BAGHDAD_MANSOUR,
    payload: {
      property_type: "بيت",
      legal_type: "طابو ملك صرف",
      area_value: 300,
      area_unit: "متر",
      pricing_method: "سعر على المتر",
      unit_price: 1_500_000,
      owner_name: "حسن عبد الرزاق",
      owner_phone: "07701234567",
      status: "available",
      plot_number: "1245",
      plot_letter: "أ",
      mahalla: "605",
      alley: "12",
      house_number: "8",
      street_width: "12 م",
      frontage: "15 م",
      nazal: "20 م",
      rooms_count: 4,
      bathrooms_count: 3,
      is_negotiable: true,
      nearest_landmark: "قرب جامع أم الطبول",
      notes: "بيت طابقين، تشطيب جيد، مؤجر سابقاً."
    },
    followups: [
      { type: "phone_call", notes: "المالك يريد بيعاً سريعاً.", inDays: -6 },
      { type: "visit", notes: "معاينة مع زبون مهتم.", inDays: 3 }
    ]
  },
  {
    location: BAGHDAD_YARMOUK,
    payload: {
      property_type: "فيلا",
      legal_type: "طابو ملك صرف",
      area_value: 600,
      area_unit: "متر",
      pricing_method: "سعر على المتر",
      unit_price: 2_100_000,
      owner_name: "سعاد الجبوري",
      owner_phone: "07801112233",
      status: "negotiating",
      plot_number: "77",
      mahalla: "631",
      alley: "5",
      house_number: "22",
      street_width: "20 م",
      frontage: "20 م",
      rooms_count: 6,
      bathrooms_count: 4,
      is_negotiable: true,
      nearest_landmark: "خلف مول اليرموك",
      notes: "فيلا مع مسبح وحديقة أمامية."
    },
    followups: [
      { type: "negotiation", notes: "الزبون عرض 1.9 مليون للمتر.", inDays: -2 }
    ]
  },
  {
    location: BAGHDAD_KARRADA,
    payload: {
      property_type: "بيت",
      legal_type: "طابو ملك صرف",
      area_value: 200,
      area_unit: "متر",
      pricing_method: "سعر إجمالي مباشر",
      total_price: 275_000_000,
      owner_name: "علي كاظم",
      owner_phone: "07709876543",
      status: "reserved",
      plot_number: "3312",
      plot_letter: "ب",
      mahalla: "909",
      street_width: "10 م",
      rooms_count: 3,
      bathrooms_count: 2,
      nearest_landmark: "قرب شارع 62",
      notes: "محجوز بعربون حتى نهاية الشهر."
    },
    followups: [{ type: "meeting", notes: "توقيع العربون في المكتب.", inDays: -1 }]
  },
  {
    location: BAGHDAD_ZAYOUNA,
    payload: {
      property_type: "بيت",
      legal_type: "طابو ملك صرف",
      area_value: 250,
      area_unit: "متر",
      pricing_method: "سعر على المتر",
      unit_price: 1_250_000,
      owner_name: "مصطفى الخفاجي",
      owner_phone: "07512223344",
      status: "available",
      plot_number: "8801",
      mahalla: "714",
      alley: "3",
      house_number: "14",
      street_width: "8 م",
      frontage: "12 م",
      rooms_count: 3,
      bathrooms_count: 2,
      is_negotiable: false,
      notes: "يحتاج صيانة داخلية."
    }
  },
  {
    location: BAGHDAD_DORA,
    payload: {
      property_type: "بيت",
      legal_type: "طابو ملك صرف",
      area_value: 150,
      area_unit: "متر",
      pricing_method: "سعر إجمالي مباشر",
      total_price: 95_000_000,
      owner_name: "زينب ناصر",
      owner_phone: "07733445566",
      status: "sold",
      plot_number: "402",
      mahalla: "836",
      rooms_count: 2,
      bathrooms_count: 1,
      notes: "تم البيع الشهر الماضي — محفوظ للسجل."
    }
  },
  {
    location: BAGHDAD_DORA,
    payload: {
      property_type: "بيت",
      legal_type: "طابو ملك صرف",
      area_value: 180,
      area_unit: "متر",
      pricing_method: "سعر على المتر",
      unit_price: 700_000,
      owner_name: "كريم داود",
      owner_phone: "07811223344",
      status: "rented",
      plot_number: "415",
      plot_letter: "ج",
      mahalla: "836",
      rooms_count: 3,
      bathrooms_count: 2,
      notes: "مؤجر بعقد سنوي."
    }
  },
  {
    location: BASRA_SHATT,
    payload: {
      property_type: "أرض",
      legal_type: "طابو زراعي ملك صرف",
      area_value: 5,
      area_unit: "دونم",
      pricing_method: "سعر على الدونم",
      unit_price: 180_000_000,
      owner_name: "جبار الساعدي",
      owner_phone: "07701119988",
      status: "available",
      plot_number: "21",
      subdistrict_number: "44",
      subdistrict_name: "مقاطعة شط العرب",
      is_negotiable: true,
      nearest_landmark: "على طريق كورنيش شط العرب",
      notes: "أرض بواجهة نهرية."
    },
    followups: [
      { type: "phone_call", notes: "متابعة سعر السوق للدونم.", inDays: 7 }
    ]
  },
  {
    location: BASRA_ZUBAIR,
    payload: {
      property_type: "مزرعة",
      legal_type: "عقد زراعي 117",
      area_value: 40,
      area_unit: "دونم",
      pricing_method: "سعر على الدونم",
      unit_price: 25_000_000,
      owner_name: "شركة الوفاء الزراعية",
      owner_phone: "07800001122",
      status: "available",
      plot_number: "9",
      subdistrict_number: "12",
      subdistrict_name: "مقاطعة البرجسية",
      is_negotiable: true,
      notes: "بئر ارتوازي ومنظومة ري بالتنقيط."
    }
  },
  {
    location: BASRA_ZUBAIR,
    payload: {
      property_type: "أرض",
      legal_type: "طابو زراعي مملوك للدولة سند 25",
      area_value: 12,
      area_unit: "دونم",
      pricing_method: "سعر على الدونم",
      unit_price: 30_000_000,
      owner_name: "هيثم الموسوي",
      owner_phone: "07705556677",
      status: "negotiating",
      plot_number: "9",
      plot_letter: "د",
      subdistrict_number: "12",
      notes: "بحاجة إلى تدقيق سند الملكية."
    }
  },
  {
    location: ERBIL_ANKAWA,
    payload: {
      property_type: "فيلا",
      legal_type: "طابو ملك صرف",
      area_value: 450,
      area_unit: "متر",
      pricing_method: "سعر إجمالي مباشر",
      total_price: 620_000_000,
      owner_name: "ريبوار عبدالله",
      owner_phone: "07501234567",
      status: "available",
      plot_number: "512",
      street_width: "16 م",
      frontage: "18 م",
      rooms_count: 5,
      bathrooms_count: 4,
      is_negotiable: false,
      nearest_landmark: "داخل مجمع سكني مغلق",
      notes: "ضمن مجمع بخدمات وحراسة."
    },
    followups: [{ type: "other", notes: "طلب صور إضافية من المالك.", inDays: 2 }]
  },
  {
    location: ERBIL_SHAQLAWA,
    payload: {
      property_type: "أرض",
      legal_type: "طابو ملك صرف",
      area_value: 800,
      area_unit: "متر",
      pricing_method: "سعر على المتر",
      unit_price: 400_000,
      owner_name: "دلشاد كريم",
      owner_phone: "07509998877",
      status: "available",
      plot_number: "88",
      plot_letter: "أ",
      frontage: "25 م",
      nazal: "32 م",
      is_negotiable: true,
      nearest_landmark: "إطلالة على جبل سفين",
      notes: "صالحة لبناء استراحة صيفية."
    }
  },
  {
    location: BAGHDAD_MANSOUR,
    payload: {
      property_type: "أرض",
      legal_type: "طابو ملك صرف",
      area_value: 400,
      area_unit: "متر",
      pricing_method: "سعر على المتر",
      unit_price: 1_800_000,
      owner_name: "ورثة عبد الكريم",
      owner_phone: "07701010101",
      status: "archived",
      plot_number: "1290",
      mahalla: "605",
      notes: "سُحب العرض مؤقتاً بطلب الورثة."
    }
  }
];
