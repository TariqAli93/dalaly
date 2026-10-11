ALTER TABLE properties
  ADD COLUMN latitude numeric(10,8),
  ADD COLUMN longitude numeric(11,8),
  ADD COLUMN location_link text,
  ADD CONSTRAINT properties_location_range CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  );

ALTER TABLE rentals
  ADD COLUMN latitude numeric(10,8),
  ADD COLUMN longitude numeric(11,8),
  ADD COLUMN location_link text,
  ADD CONSTRAINT rentals_location_range CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  );
