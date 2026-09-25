export type RentalPropertyType =
  | "house"
  | "apartment"
  | "shop"
  | "warehouse"
  | "other";
export type RentPeriod = "monthly" | "semi_annual" | "annual";
export type RentalStatus =
  | "available"
  | "reserved"
  | "negotiating"
  | "rented"
  | "sold"
  | "closed"
  | "open"
  | "matched"
  | "archived"
  | "unavailable"
  | "pending"
  | "draft"
  | "rejected"
  | "approved"
  | "inactive"
  | "active"
  | "deleted"
  | "expired"
  | "suspended"
  | "terminated"
  | "cancelled"
  | "completed"
  | "in_progress"
  | "on_hold"
  | "under_review"
  | "awaiting_payment"
  | "payment_received"
  | "payment_failed"
  | "shipped"
  | "delivered"
  | "returned"
  | "refunded"
  | "unknown"
  | "custom";
export type RentalImage = {
  id: number;
  rental_id: number;
  file_path: string;
  original_name: string | null;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
};
export type RentalRecord = {
  id: number;
  image: string;
  name: string | null;
  code: string;
  property_type: RentalPropertyType;
  rent_price: string | number;
  rent_period: RentPeriod;
  area_value: string | number;
  area_unit: string;
  floors_count: number | null;
  rooms_count: number | null;
  bathrooms_count: number | null;
  amenities: Record<string, unknown>;
  other_details: string | null;
  governorate_id: number | null;
  district_id: number | null;
  neighborhood_id: number | null;
  governorate: string | null;
  district: string | null;
  neighborhood: string | null;
  address_details: string | null;
  owner_customer_id: number | null;
  owner_name: string;
  owner_phone: string;
  owner_notes: string | null;
  status: RentalStatus;
  is_negotiable: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};
export type RentalForm = {
  name: string;
  property_type: RentalPropertyType;
  rent_price: string | number;
  rent_period: RentPeriod;
  area_value: string | number;
  area_unit: string;
  floors_count: number | null;
  rooms_count: number | null;
  bathrooms_count: number | null;
  amenities: Record<string, unknown>;
  other_details: string;
  governorate_id: number | null;
  district_id: number | null;
  neighborhood_id: number | null;
  governorate: string;
  district: string;
  neighborhood: string;
  address_details: string;
  owner_customer_id: number | null;
  owner_name: string;
  owner_phone: string;
  owner_notes: string;
  status: RentalStatus;
  is_negotiable: boolean;
  notes: string;
};
export type RentalFilters = {
  property_type: RentalPropertyType | "";
  rent_period: RentPeriod | "";
  rent_price_min: string;
  rent_price_max: string;
  area_min: string;
  area_max: string;
  rooms_count: string;
  bathrooms_count: string;
  floors_count: string;
  governorate_id: number | null;
  district_id: number | null;
  neighborhood_id: number | null;
  status: RentalStatus | "";
  negotiable: "" | "true" | "false";
  amenities: string;
  q: string;
};
