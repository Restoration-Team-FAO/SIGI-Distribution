# GIS service migrations

This folder is reserved for gis-service migrations.

- Scope: `gis` schema only.
- Ownership: derived geospatial layers, materialized views, and PostGIS-heavy read models.
- Rule: avoid placing core transactional entities in this schema.
