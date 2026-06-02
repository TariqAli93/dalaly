export type PropertyStatus =
  | "available"
  | "reserved"
  | "negotiating"
  | "sold"
  | "rented"
  | "archived";

export type PropertyRecord = {
  id: number;
  code: string;
  property_type: string;
  legal_type: string;
  area_value: string | number;
  area_unit: string;
  pricing_method: string;
  unit_price: string | number | null;
  total_price: string | number;
  governorate: string | null;
  city: string | null;
  district: string | null;
  governorate_id: number | null;
  district_id: number | null;
  governorate_text: string | null;
  district_text: string | null;
  address_details: string | null;
  owner_name: string;
  owner_phone: string;
  owner_notes: string | null;
  status: PropertyStatus;
  notes: string | null;
  // حقول عراقية اختيارية إضافية
  plot_number: string | null;
  subdistrict_number: string | null;
  subdistrict_name: string | null;
  mahalla: string | null;
  alley: string | null;
  house_number: string | null;
  nearest_landmark: string | null;
  street_width: string | null;
  frontage: string | null;
  rooms_count: number | null;
  bathrooms_count: number | null;
  is_negotiable: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PropertyForm = {
  property_type: string;
  legal_type: string;
  area_value: string | number;
  area_unit: string;
  pricing_method: string;
  unit_price: string | number | null;
  total_price: string | number;
  city: string | null;
  governorate_id: number | null;
  district_id: number | null;
  governorate_text: string;
  district_text: string;
  address_details: string | null;
  owner_name: string;
  owner_phone: string;
  owner_notes: string | null;
  status: PropertyStatus;
  notes: string | null;
  plot_number: string;
  subdistrict_number: string;
  subdistrict_name: string;
  mahalla: string;
  alley: string;
  house_number: string;
  nearest_landmark: string;
  street_width: string;
  frontage: string;
  rooms_count: number | null;
  bathrooms_count: number | null;
  is_negotiable: boolean;
};

export type PropertyFilters = {
  property_type: string;
  legal_type: string;
  area_unit: string;
  pricing_method: string;
  status: string;
  district: string;
  governorate_id: number | null;
  district_id: number | null;
  price_min: string;
  price_max: string;
  q: string;
};

export type StatsSummary = {
  total: number;
  available: number;
  sold: number;
  archived: number;
  by_type: Array<{ name: string; count: number }>;
  by_legal_type: Array<{ name: string; count: number }>;
  by_pricing_method: Array<{ name: string; count: number }>;
};
