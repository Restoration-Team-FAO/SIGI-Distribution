import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cantonsPath = path.join(repoRoot, 'templates', 'cantones.geojson');
const require = createRequire(
  path.join(repoRoot, 'apps', 'sigi-api', 'package.json'),
);
const { Client } = require('pg');

const REGION_DEFINITIONS = {
  'cr-chorotega': {
    name: 'Región Chorotega',
    cantons: new Set([
      'Liberia',
      'Nicoya',
      'Santa Cruz',
      'Bagaces',
      'Carrillo',
      'Cañas',
      'Abangares',
      'Tilarán',
      'Nandayure',
      'La Cruz',
      'Hojancha',
    ]),
  },
  'cr-pacifico-central': {
    name: 'Región Pacífico Central',
    cantons: new Set([
      'Puntarenas',
      'Esparza',
      'Montes de Oro',
      'Orotina',
      'Garabito',
      'Parrita',
      'Quepos',
      'Monteverde',
    ]),
  },
  'cr-brunca': {
    name: 'Región Brunca',
    cantons: new Set([
      'Pérez Zeledón',
      'Buenos Aires',
      'Osa',
      'Golfito',
      'Coto Brus',
      'Corredores',
      'Puerto Jiménez',
    ]),
  },
  'cr-north': {
    name: 'Región Huetar Norte',
    cantons: new Set([
      'San Carlos',
      'Los Chiles',
      'Guatuso',
      'Upala',
      'Río Cuarto',
      'Sarapiquí',
    ]),
  },
  'cr-huetar-caribe': {
    name: 'Región Huetar Caribe',
    cantons: new Set([
      'Limón',
      'Pococí',
      'Siquirres',
      'Talamanca',
      'Matina',
      'Guácimo',
    ]),
  },
};

const PROVINCE_CODE_MAP = new Map([
  ['San José', 'cr-san-jose'],
  ['Alajuela', 'cr-alajuela'],
  ['Cartago', 'cr-cartago'],
  ['Heredia', 'cr-heredia'],
  ['Guanacaste', 'cr-guanacaste'],
  ['Puntarenas', 'cr-puntarenas'],
  ['Limón', 'cr-limon'],
]);

function inferRegion(cantonName) {
  for (const [code, definition] of Object.entries(REGION_DEFINITIONS)) {
    if (definition.cantons.has(cantonName)) {
      return { code, name: definition.name };
    }
  }

  return { code: 'cr-central', name: 'Región Central' };
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

const rawGeoJson = fs.readFileSync(cantonsPath, 'utf8');
const featureCollection = JSON.parse(rawGeoJson);
const features = Array.isArray(featureCollection.features)
  ? featureCollection.features
  : [];

if (features.length === 0) {
  throw new Error('No se encontraron features en templates/cantones.geojson');
}

const cantonRows = features.map((feature, index) => {
  const properties = feature?.properties ?? {};
  const cantonName = String(properties.adm2_name ?? '').trim();
  const provinceName = String(properties.adm1_name ?? '').trim();
  const provinceCode = PROVINCE_CODE_MAP.get(provinceName);
  if (!cantonName || !provinceName || !provinceCode || !feature?.geometry) {
    throw new Error(
      `Feature inválido en posición ${index}: faltan adm2_name, adm1_name, provinceCode o geometry.`,
    );
  }

  const region = inferRegion(cantonName);
  return {
    provinceCode,
    provinceName,
    cantonCode: String(properties.adm2_pcode ?? `CR-${index + 1}`).trim(),
    cantonName,
    regionCode: region.code,
    regionName: region.name,
    geometry: JSON.stringify(feature.geometry),
    areaSqKm: Number(properties.area_sqkm ?? 0) || 0,
  };
});

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://sigi_user:sigi_password@127.0.0.1:5432/sigi_db',
});

const groupedGeometryExpression =
  "ST_Multi(ST_CollectionExtract(ST_UnaryUnion(ST_Collect(ST_SetSRID(ST_GeomFromGeoJSON(tmp.geometry::text), 4326))), 3))";

async function upsertTerritory(code, name, level, parentId) {
  const result = await client.query(
    `
      INSERT INTO core.territories (
        code,
        name,
        level,
        parent_territory_id,
        status
      )
      VALUES ($1, $2, $3, $4::uuid, 'active')
      ON CONFLICT (code) DO UPDATE
      SET
        name = EXCLUDED.name,
        level = EXCLUDED.level,
        parent_territory_id = EXCLUDED.parent_territory_id,
        status = 'active',
        updated_at = NOW()
      RETURNING id
    `,
    [code, name, level, parentId],
  );

  return result.rows[0].id;
}

async function main() {
  await client.connect();

  try {
    await client.query(`
      CREATE TEMP TABLE tmp_cr_cantons (
        province_code text NOT NULL,
        province_name text NOT NULL,
        canton_code text NOT NULL,
        canton_name text NOT NULL,
        region_code text NOT NULL,
        region_name text NOT NULL,
        geometry jsonb NOT NULL,
        area_sqkm numeric NULL
      )
    `);

    for (const batch of chunk(cantonRows, 25)) {
      const values = [];
      const params = [];
      batch.forEach((row, index) => {
        const offset = index * 8;
        values.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb, $${offset + 8})`,
        );
        params.push(
          row.provinceCode,
          row.provinceName,
          row.cantonCode,
          row.cantonName,
          row.regionCode,
          row.regionName,
          row.geometry,
          row.areaSqKm,
        );
      });

      await client.query(
        `
          INSERT INTO tmp_cr_cantons (
            province_code,
            province_name,
            canton_code,
            canton_name,
            region_code,
            region_name,
            geometry,
            area_sqkm
          )
          VALUES ${values.join(', ')}
        `,
        params,
      );
    }

    const layerResult = await client.query(
      `
        INSERT INTO gis.geo_layers (code, name, layer_type, visibility, status)
        VALUES ('territories', 'Territorios públicos SIGI', 'vector', 'public', 'active')
        ON CONFLICT (code) DO UPDATE
        SET
          name = EXCLUDED.name,
          layer_type = EXCLUDED.layer_type,
          visibility = EXCLUDED.visibility,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING id
      `,
    );
    const layerId = layerResult.rows[0].id;

    const countryId = await upsertTerritory('cr', 'Costa Rica', 'country', null);

    const provinceRows = await client.query(
      `
        SELECT DISTINCT province_code, province_name
        FROM tmp_cr_cantons
        ORDER BY province_name ASC
      `,
    );
    for (const row of provinceRows.rows) {
      await upsertTerritory(row.province_code, row.province_name, 'province', countryId);
    }

    const regionRows = await client.query(
      `
        SELECT DISTINCT region_code, region_name
        FROM tmp_cr_cantons
        ORDER BY region_name ASC
      `,
    );
    for (const row of regionRows.rows) {
      await upsertTerritory(row.region_code, row.region_name, 'region', countryId);
    }

    await client.query(
      `
        DELETE FROM gis.territory_features tf
        USING core.territories t
        WHERE tf.territory_id = t.id
          AND tf.layer_id = $1::uuid
          AND t.level IN ('country', 'province', 'region')
      `,
      [layerId],
    );

    await client.query(
      `
        INSERT INTO gis.territory_features (
          territory_id,
          layer_id,
          geometry,
          area_ha,
          properties_json
        )
        SELECT
          t.id,
          $1::uuid,
          ${groupedGeometryExpression},
          ROUND((ST_Area((${groupedGeometryExpression})::geography) / 10000.0)::numeric, 2),
          jsonb_build_object(
            'source', 'templates/cantones.geojson',
            'scope', 'country',
            'authority', 'Costa Rica DTA',
            'code', t.code
          )
        FROM tmp_cr_cantons tmp
        JOIN core.territories t ON t.code = 'cr'
        GROUP BY t.id
      `,
      [layerId],
    );

    await client.query(
      `
        INSERT INTO gis.territory_features (
          territory_id,
          layer_id,
          geometry,
          area_ha,
          properties_json
        )
        SELECT
          t.id,
          $1::uuid,
          ${groupedGeometryExpression},
          ROUND((ST_Area((${groupedGeometryExpression})::geography) / 10000.0)::numeric, 2),
          jsonb_build_object(
            'source', 'templates/cantones.geojson',
            'scope', 'province',
            'provinceCode', tmp.province_code,
            'authority', 'Costa Rica DTA'
          )
        FROM tmp_cr_cantons tmp
        JOIN core.territories t ON t.code = tmp.province_code
        GROUP BY t.id, tmp.province_code
      `,
      [layerId],
    );

    await client.query(
      `
        INSERT INTO gis.territory_features (
          territory_id,
          layer_id,
          geometry,
          area_ha,
          properties_json
        )
        SELECT
          t.id,
          $1::uuid,
          ${groupedGeometryExpression},
          ROUND((ST_Area((${groupedGeometryExpression})::geography) / 10000.0)::numeric, 2),
          jsonb_build_object(
            'source', 'templates/cantones.geojson',
            'scope', 'region',
            'regionCode', tmp.region_code,
            'authority', 'MIDEPLAN'
          )
        FROM tmp_cr_cantons tmp
        JOIN core.territories t ON t.code = tmp.region_code
        GROUP BY t.id, tmp.region_code
      `,
      [layerId],
    );

    const counts = await client.query(
      `
        SELECT t.level, COUNT(*)::int AS total
        FROM gis.territory_features tf
        JOIN core.territories t ON t.id = tf.territory_id
        WHERE tf.layer_id = $1::uuid
        GROUP BY t.level
        ORDER BY t.level ASC
      `,
      [layerId],
    );

    console.log(
      JSON.stringify(
        {
          layer: 'territories',
          levels: counts.rows,
          regionsLoaded: regionRows.rowCount,
          provincesLoaded: provinceRows.rowCount,
          source: 'templates/cantones.geojson',
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
