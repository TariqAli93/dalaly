import { statusLabel } from "../constants/domain";
import { platform } from "../platform";
import * as imagesService from "../services/images.service";
import * as rentalsService from "../services/rentals.service";
import { formatMoney, formatPlot } from "./format";
import { amenitiesText } from "./amenities";
import { neighborhoodOf } from "./exportProperty";
import type {
  PropertyImage,
  PropertyRecord,
  RentalImage,
  RentalRecord,
} from "../types";
import type { FolderExportFile, SaveResult } from "../platform/types";

function line(label: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return `${label}: ${value}\n`;
}

function fileExtension(filePath: string) {
  return filePath.match(/\.[a-z0-9]+$/i)?.[0] ?? ".jpg";
}

function safeFileName(value: string, fallback: string) {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized || fallback;
}

function uniqueFileName(name: string, used: Set<string>) {
  const extension = name.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
  const stem = extension ? name.slice(0, -extension.length) : name;
  let candidate = name;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem}-${counter}${extension}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

async function imageFiles(
  images: Array<PropertyImage | RentalImage>,
  imageUrl: (image: PropertyImage | RentalImage) => string,
): Promise<FolderExportFile[]> {
  const usedNames = new Set<string>(["details.txt"]);
  return Promise.all(
    images.map(async (image, index) => {
      const response = await fetch(imageUrl(image));
      if (!response.ok) throw new Error(`تعذر تنزيل الصورة رقم ${index + 1}.`);
      const data = new Uint8Array(await response.arrayBuffer());
      const fallback = `photo-${String(index + 1).padStart(2, "0")}${fileExtension(image.file_path)}`;
      const originalName = image.original_name?.trim() || fallback;
      const name = uniqueFileName(
        safeFileName(originalName, fallback),
        usedNames,
      );
      return { name, data };
    }),
  );
}

function textFile(text: string): FolderExportFile {
  return {
    name: "details.txt",
    data: new TextEncoder().encode(`\uFEFF${text.trim()}\n`),
  };
}

function propertyText(property: PropertyRecord) {
  let text = "";
  text += line("الاسم", property.name ?? `properties ${property.code}`);
  text += line("كود العرض", property.code);
  text += line("نوع العقار", property.property_type);
  text += line("المحافظة", property.governorate || property.governorate_text);
  text += line("المنطقة", property.district || property.district_text);
  text += line("الحي", neighborhoodOf(property));
  text += line("الجنس", property.legal_type);
  text += line("المساحة", `${property.area_value} ${property.area_unit}`);
  text += line("السعر الكلي", `${formatMoney(property.total_price)} دينار`);
  text += line(
    "سعر الوحدة",
    property.unit_price ? formatMoney(property.unit_price) : "",
  );
  text += line("الحالة", statusLabel(property.status));
  text += line("قابل للتفاوض", property.is_negotiable ? "نعم" : "لا");
  text += line("الواجهة", property.frontage);
  text += line("النزال / العمق", property.nazal);
  text += line("عرض الشارع", property.street_width);
  text += line("عدد الغرف", property.rooms_count);
  text += line("عدد الحمامات", property.bathrooms_count);
  text += line(
    "رقم القطعة",
    formatPlot(property.plot_number, property.plot_letter),
  );
  text += line("المقاطعة", property.subdistrict_name);
  text += line("المحلة", property.mahalla);
  text += line("الزقاق", property.alley);
  text += line("الدار", property.house_number);
  text += line("أقرب نقطة دالة", property.nearest_landmark);
  text += line("العنوان التفصيلي", property.address_details);
  text += line("المميزات", amenitiesText(property.amenities));
  text += line("اسم المالك", property.owner_name);
  text += line("هاتف المالك", property.owner_phone);
  text += line("ملاحظات المالك", property.owner_notes);
  text += line("ملاحظات", property.notes);
  return text;
}

function rentalText(rental: RentalRecord) {
  let text = "";
  text += line("الاسم", rental.name ?? `rentals ${rental.code}`);
  text += line("كود الإيجار", rental.code);
  text += line("نوع العقار", rental.property_type);
  text += line("سعر الإيجار", `${formatMoney(rental.rent_price)} دينار`);
  text += line("نوع الإيجار", rental.rent_period);
  text += line("المساحة", `${rental.area_value} ${rental.area_unit}`);
  text += line("عدد الطوابق", rental.floors_count);
  text += line("عدد الغرف", rental.rooms_count);
  text += line("عدد الحمامات", rental.bathrooms_count);
  text += line("المحافظة", rental.governorate);
  text += line("المنطقة", rental.district);
  text += line("الحي", rental.neighborhood);
  text += line("العنوان التفصيلي", rental.address_details);
  text += line("المميزات", amenitiesText(rental.amenities));
  text += line("تفاصيل أخرى", rental.other_details);
  text += line("اسم المالك", rental.owner_name);
  text += line("هاتف المالك", rental.owner_phone);
  text += line("ملاحظات المالك", rental.owner_notes);
  text += line("الحالة", rental.status);
  text += line("قابل للتفاوض", rental.is_negotiable ? "نعم" : "لا");
  text += line("ملاحظات", rental.notes);
  return text;
}

export async function exportPropertyFolder(
  property: PropertyRecord,
): Promise<SaveResult> {
  const images = await imagesService.listImages(property.id);
  const files = [
    textFile(propertyText(property)),
    ...(await imageFiles(images, (image) =>
      imagesService.imageFileUrl(property.id, image.id),
    )),
  ];
  return platform.exportFolder({
    files,
    suggestedFolderName: property.name ?? `properties ${property.code}`,
    title: `تصدير ${property.name ?? property.code}`,
  });
}

export async function exportRentalFolder(
  rental: RentalRecord,
): Promise<SaveResult> {
  const images = await rentalsService.listRentalImages(rental.id);
  const files = [
    textFile(rentalText(rental)),
    ...(await imageFiles(images, (image) =>
      rentalsService.rentalImageUrl(rental.id, image.id),
    )),
  ];
  return platform.exportFolder({
    files,
    suggestedFolderName: rental.name ?? `rentals ${rental.code}`,
    title: `تصدير ${rental.name ?? rental.code}`,
  });
}
