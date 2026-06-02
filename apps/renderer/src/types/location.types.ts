export type Governorate = {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type District = {
  id: number;
  governorate_id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Neighborhood = {
  id: number;
  district_id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LocationsResponse = {
  governorates: Governorate[];
  districts: District[];
  neighborhoods: Neighborhood[];
};
