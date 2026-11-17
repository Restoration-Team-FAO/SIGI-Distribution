UPDATE gis.territory_features AS tf
SET
  geometry = ST_Multi(
    ST_GeomFromText(
      CASE t.code
        WHEN 'cr-north' THEN 'POLYGON((-85.30 11.15,-84.75 11.30,-84.15 11.20,-83.85 10.95,-84.05 10.62,-84.45 10.48,-85.05 10.55,-85.35 10.82,-85.30 11.15))'
        WHEN 'cr-central' THEN 'POLYGON((-84.95 10.55,-84.55 10.58,-84.05 10.45,-83.95 10.08,-84.15 9.82,-84.55 9.72,-84.92 9.88,-85.02 10.18,-84.95 10.55))'
        WHEN 'cr-chorotega' THEN 'POLYGON((-86.05 11.15,-85.55 11.25,-85.00 11.10,-85.00 10.85,-85.18 10.55,-85.45 10.35,-85.85 10.40,-86.15 10.65,-86.05 11.15))'
        WHEN 'cr-pacifico-central' THEN 'POLYGON((-85.20 10.32,-84.95 10.22,-84.75 9.95,-84.62 9.55,-84.78 9.15,-85.12 8.98,-85.38 9.25,-85.48 9.72,-85.32 10.05,-85.20 10.32))'
        WHEN 'cr-brunca' THEN 'POLYGON((-84.78 9.55,-84.45 9.72,-83.95 9.62,-83.45 9.32,-83.10 8.95,-82.85 8.48,-83.15 8.08,-83.75 8.15,-84.28 8.35,-84.72 8.78,-84.86 9.18,-84.78 9.55))'
        ELSE NULL
      END,
      4326
    )
  ),
  updated_at = NOW()
FROM core.territories AS t
WHERE tf.territory_id = t.id
  AND t.code IN (
    'cr-north',
    'cr-central',
    'cr-chorotega',
    'cr-pacifico-central',
    'cr-brunca'
  );
