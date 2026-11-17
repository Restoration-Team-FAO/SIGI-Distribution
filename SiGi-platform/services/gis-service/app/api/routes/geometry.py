import json

from fastapi import APIRouter, Query

from app.core.db import fetch_all

router = APIRouter()

@router.get('/')
async def geometry(
    layer: str = Query(default='territories'),
    level: str | None = Query(default=None),
    include_internal: bool = Query(default=False),
):
    """Return a layer as GeoJSON.

    Visibility is enforced here, at the data source, and never in the caller.
    Unless ``include_internal`` is set the query is restricted to layers that are
    both public and published, per ``gis.geo_visibility_is_public`` — the single
    SQL-level definition of "public" shared with sigi-api's geo-bi module, see
    docs/geo/permissions.md. ``include_internal`` is only reachable by callers
    holding the internal service token (see ``app.main``); sigi-api decides
    whether the end user is authorised to set it.
    """
    rows = fetch_all(
        """
        SELECT
          tf.id,
          t.code AS territory_code,
          t.name AS territory_name,
          t.level AS territory_level,
          tf.area_ha,
          tf.properties_json,
          ST_AsGeoJSON(tf.geometry) AS geometry_geojson
        FROM gis.territory_features tf
        INNER JOIN core.territories t ON t.id = tf.territory_id
        INNER JOIN gis.geo_layers gl ON gl.id = tf.layer_id
        WHERE gl.code = %s
          AND (%s::text IS NULL OR t.level = %s)
          AND (%s OR (gis.geo_visibility_is_public(gl.visibility) AND gl.status = 'published'))
          AND (%s OR gis.project_geometry_is_public(gl.code, tf.territory_id))
        ORDER BY t.name ASC
        """,
        (layer, level, level, include_internal, include_internal),
    )

    return {
        'type': 'FeatureCollection',
        'features': [
            {
                'type': 'Feature',
                'id': row['id'],
                'geometry': json.loads(row['geometry_geojson']),
                'properties': {
                    'code': row['territory_code'],
                    'name': row['territory_name'],
                    'level': row['territory_level'],
                    'areaHa': float(row['area_ha']) if row['area_ha'] is not None else None,
                    **(row['properties_json'] or {}),
                },
            }
            for row in rows
        ],
    }


@router.get('/layers')
async def layers(include_internal: bool = Query(default=False)):
    rows = fetch_all(
        """
        SELECT id, code, name, layer_type, visibility, status
        FROM gis.geo_layers
        WHERE (%s OR (gis.geo_visibility_is_public(visibility) AND status = 'published'))
        ORDER BY name ASC
        """,
        (include_internal,),
    )

    return {
        'layers': rows,
    }
