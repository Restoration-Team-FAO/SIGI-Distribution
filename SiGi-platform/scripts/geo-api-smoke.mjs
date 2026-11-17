#!/usr/bin/env node
/**
 * Regression smoke for the /geo/* API (Mapa SIGI — P0-3).
 *
 * Exercises GET /geo/layers, /geo/layers/:code, /:code/metadata,
 * /:code/schema and /:code/features (bbox, pagination, zoom-based
 * simplification, filters) against real data, plus the same visibility
 * boundary P0-1's geo-visibility-smoke.mjs guards — this module is a new
 * surface for that same rule, so it needs its own regression coverage
 * rather than relying on the older route's test alone.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_BASE_URL =
  process.env.SIGI_SMOKE_API_URL ?? 'http://localhost:3000/api';
const SUPERADMIN_EMAIL =
  process.env.SIGI_SMOKE_SUPERADMIN_EMAIL ?? 'superadmin@sigi.local';
const SUPERADMIN_PASSWORD =
  process.env.SIGI_SMOKE_SUPERADMIN_PASSWORD ?? process.env.SIGI_BOOTSTRAP_PASSWORD_SUPERADMIN ?? 'superadmin-dev-token';

const PUBLIC_LAYER_CODE = 'sigi_release_public';
const RESTRICTED_LAYER_CODE = 'sigi_release_private';
const PUBLIC_FEATURE_COUNT = 7;
const RESTRICTED_FEATURE_COUNT = 2;

async function main() {
  applyFixture('geo-api-smoke.setup.sql');
  try {
    const checks = [];
    const token = await login(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);

    // 1. Catalog listing respects visibility both ways.
    const anonymousLayers = await getJson('/geo/layers');
    checks.push({
      check: 'anonymous_layers_exclude_restricted',
      ok:
        anonymousLayers.status === 200 &&
        !anonymousLayers.body?.data?.layers?.some(
          (layer) => layer.code === RESTRICTED_LAYER_CODE,
        ),
    });

    const authorizedLayers = await getJson('/geo/layers', token);
    checks.push({
      check: 'authorized_layers_include_restricted',
      ok:
        authorizedLayers.status === 200 &&
        authorizedLayers.body?.data?.layers?.some(
          (layer) => layer.code === RESTRICTED_LAYER_CODE,
        ),
    });

    // 2. Layer detail: 404 (not 200/403) for a non-visible layer, both when it
    //    exists-but-restricted and when it plain does not exist — an anonymous
    //    caller must not be able to tell the two apart.
    const anonymousDetail = await getJson(
      `/geo/layers/${RESTRICTED_LAYER_CODE}`,
    );
    checks.push({
      check: 'anonymous_detail_404_for_restricted',
      ok: anonymousDetail.status === 404,
    });

    const missingDetail = await getJson('/geo/layers/does-not-exist-at-all');
    checks.push({
      check: 'detail_404_for_missing_layer',
      ok: missingDetail.status === 404,
    });

    const authorizedDetail = await getJson(
      `/geo/layers/${RESTRICTED_LAYER_CODE}`,
      token,
    );
    checks.push({
      check: 'authorized_detail_200_for_restricted',
      ok: authorizedDetail.status === 200,
    });

    // 3. Metadata endpoint: "No disponible" is represented as metadata: null,
    //    never an invented value, when no gis.geo_layer_metadata row exists.
    const metadata = await getJson(`/geo/layers/${PUBLIC_LAYER_CODE}/metadata`);
    checks.push({
      check: 'metadata_null_when_absent',
      ok: metadata.status === 200 && metadata.body?.data?.metadata === null,
    });

    // 4. Schema derivation: fields are actually observed in the data, not a
    //    hardcoded list — assert a field this dataset is known to carry.
    const schema = await getJson(`/geo/layers/${PUBLIC_LAYER_CODE}/schema`);
    const fieldNames = (schema.body?.data?.fields ?? []).map(
      (field) => field.name,
    );
    checks.push({
      check: 'schema_derives_known_field',
      ok:
        schema.status === 200 &&
        fieldNames.includes('province') &&
        fieldNames.includes('areaHa'),
    });

    // 5. Features: pagination is always bounded, bbox filters correctly, and
    //    zoom-based simplification measurably shrinks the payload — the fix
    //    for the 59.1 MB finding in docs/geo/postgis.md §4.
    const unpaged = await getJson(`/geo/layers/${PUBLIC_LAYER_CODE}/features`);
    checks.push({
      check: 'features_default_page_is_bounded',
      ok:
        unpaged.status === 200 &&
        unpaged.body?.data?.featureCollection?.features?.length <=
          unpaged.body?.data?.pageSize,
    });

    const paged = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?pageSize=3&page=2`,
    );
    checks.push({
      check: 'features_respects_page_size',
      ok:
        paged.status === 200 &&
        paged.body?.data?.featureCollection?.features?.length === 3,
    });

    const rawSize = await getRawSize(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?pageSize=50`,
    );
    const simplifiedSize = await getRawSize(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?pageSize=50&zoom=5`,
    );
    checks.push({
      check: 'zoom_simplification_shrinks_payload',
      ok: rawSize > 0 && simplifiedSize > 0 && simplifiedSize < rawSize / 10,
    });

    const malformedBbox = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?bbox=not-a-bbox`,
    );
    checks.push({
      check: 'malformed_bbox_rejected',
      ok: malformedBbox.status === 400,
    });

    // 6. Filters: correct result for a known value, and unsafe input rejected
    //    rather than reaching the database as anything but a bound parameter.
    const filterMatch = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?${filtersQuery([
        { field: 'province', operator: 'eq', value: 'Alajuela' },
      ])}`,
    );
    const provinces = (
      filterMatch.body?.data?.featureCollection?.features ?? []
    ).map((feature) => feature.properties.province);
    checks.push({
      check: 'filter_eq_returns_matching_rows_only',
      ok:
        filterMatch.status === 200 &&
        filterMatch.body?.data?.totalFeatures > 0 &&
        provinces.every((value) => value === 'Alajuela'),
    });

    const unknownField = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?${filtersQuery([
        { field: 'not_a_real_field', operator: 'eq', value: 'x' },
      ])}`,
    );
    checks.push({
      check: 'filter_unknown_field_rejected',
      ok: unknownField.status === 400,
    });

    const injectionAttempt = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?${filtersQuery([
        {
          field: "x'); DROP TABLE gis.geo_layers; --",
          operator: 'eq',
          value: '1',
        },
      ])}`,
    );
    checks.push({
      check: 'filter_injection_attempt_rejected_not_500',
      ok: injectionAttempt.status === 400,
    });

    const layersStillThere = await getJson('/geo/layers');
    checks.push({
      check: 'catalog_intact_after_injection_attempt',
      ok:
        layersStillThere.status === 200 &&
        (layersStillThere.body?.data?.layers?.length ?? 0) > 0,
    });

    const badOperatorType = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?${filtersQuery([
        { field: 'province', operator: 'gt', value: 'A' },
      ])}`,
    );
    checks.push({
      check: 'filter_type_mismatched_operator_rejected',
      ok: badOperatorType.status === 400,
    });

    // 7. Sort (P0-7 attribute table): both directions actually order the
    //    result, an unknown field is rejected, and an invalid direction is
    //    rejected — same safety posture as filters, reusing the same
    //    field-resolution code (geo-filter-sql.ts's resolveFieldExpression).
    const sortedDesc = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?pageSize=5&sort=areaHa&order=desc`,
    );
    const descValues = (
      sortedDesc.body?.data?.featureCollection?.features ?? []
    ).map((feature) => feature.properties.areaHa);
    checks.push({
      check: 'sort_desc_orders_results',
      ok:
        sortedDesc.status === 200 &&
        descValues.length > 1 &&
        descValues.every(
          (value, index) => index === 0 || value <= descValues[index - 1],
        ),
    });

    const sortedAsc = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?pageSize=5&sort=areaHa&order=asc`,
    );
    const ascValues = (
      sortedAsc.body?.data?.featureCollection?.features ?? []
    ).map((feature) => feature.properties.areaHa);
    checks.push({
      check: 'sort_asc_orders_results',
      ok:
        sortedAsc.status === 200 &&
        ascValues.length > 1 &&
        ascValues.every(
          (value, index) => index === 0 || value >= ascValues[index - 1],
        ),
    });

    const sortUnknownField = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?sort=not_a_real_field`,
    );
    checks.push({
      check: 'sort_unknown_field_rejected',
      ok: sortUnknownField.status === 400,
    });

    const sortInvalidOrder = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/features?sort=areaHa&order=sideways`,
    );
    checks.push({
      check: 'sort_invalid_order_rejected',
      ok: sortInvalidOrder.status === 400,
    });

    // 8. Export (P0-8): each format downloads with the right content-type and
    //    the whole layer's row count; filters narrow the export the same way
    //    they narrow /features; format is required, not defaulted; visibility
    //    still applies; every call — success or failure — is audited.
    const csvExport = await getRaw(
      `/geo/layers/${PUBLIC_LAYER_CODE}/export?format=csv`,
    );
    checks.push({
      check: 'export_csv_has_metadata_header_and_rows',
      ok:
        csvExport.status === 200 &&
        csvExport.headers.get('content-type')?.includes('text/csv') &&
        csvExport.text.startsWith('# SIGI - Exportación geoespacial') &&
        csvExport.text.includes('\ncode,name,level'),
    });

    const xlsxExport = await getRaw(
      `/geo/layers/${PUBLIC_LAYER_CODE}/export?format=xlsx`,
    );
    checks.push({
      check: 'export_xlsx_downloads_with_correct_content_type',
      ok:
        xlsxExport.status === 200 &&
        xlsxExport.headers
          .get('content-type')
          ?.includes(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ) &&
        Number(xlsxExport.headers.get('x-sigi-export-exported')) ===
          PUBLIC_FEATURE_COUNT,
    });

    const geojsonExport = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/export?format=geojson`,
    );
    checks.push({
      check: 'export_geojson_has_metadata_foreign_member',
      ok:
        geojsonExport.status === 200 &&
        geojsonExport.body?.type === 'FeatureCollection' &&
        geojsonExport.body?.features?.length === PUBLIC_FEATURE_COUNT &&
        geojsonExport.body?.metadata?.totalExportado === PUBLIC_FEATURE_COUNT,
    });

    const filteredExport = await getRaw(
      `/geo/layers/${PUBLIC_LAYER_CODE}/export?format=csv&${filtersQuery([
        { field: 'areaHa', operator: 'gt', value: 100 },
      ])}`,
    );
    checks.push({
      check: 'export_respects_filters',
      ok:
        filteredExport.status === 200 &&
        Number(filteredExport.headers.get('x-sigi-export-total')) <
          PUBLIC_FEATURE_COUNT,
    });

    const missingFormat = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/export`,
    );
    checks.push({
      check: 'export_missing_format_rejected',
      ok: missingFormat.status === 400,
    });

    const invalidFormat = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/export?format=pdf`,
    );
    checks.push({
      check: 'export_invalid_format_rejected',
      ok: invalidFormat.status === 400,
    });

    const anonymousRestrictedExport = await getJson(
      `/geo/layers/${RESTRICTED_LAYER_CODE}/export?format=csv`,
    );
    checks.push({
      check: 'export_anonymous_restricted_layer_404',
      ok: anonymousRestrictedExport.status === 404,
    });

    const authorizedRestrictedExport = await getRaw(
      `/geo/layers/${RESTRICTED_LAYER_CODE}/export?format=csv`,
      token,
    );
    checks.push({
      check: 'export_authorized_restricted_layer_200',
      ok:
        authorizedRestrictedExport.status === 200 &&
        Number(
          authorizedRestrictedExport.headers.get('x-sigi-export-exported'),
        ) === RESTRICTED_FEATURE_COUNT,
    });

    // 8. Territorial search (P1-1, spec §18) — cross-layer, same visibility
    //    boundary as everything else in this module.
    const searchMissingQ = await getJson('/geo/search');
    checks.push({
      check: 'search_missing_q_rejected',
      ok: searchMissingQ.status === 400,
    });

    const searchShortQ = await getJson('/geo/search?q=a');
    checks.push({
      check: 'search_short_q_rejected',
      ok: searchShortQ.status === 400,
    });

    const searchByName = await getJson(
      `/geo/search?q=${encodeURIComponent('San Vito Release')}`,
    );
    checks.push({
      check: 'search_matches_by_name',
      ok:
        searchByName.status === 200 &&
        searchByName.body?.data?.results?.some(
          (result) => result.territoryCode === 'R7-PUBLIC-01',
        ),
    });

    const searchByCode = await getJson('/geo/search?q=R7-PUBLIC-01');
    checks.push({
      check: 'search_matches_by_code',
      ok:
        searchByCode.status === 200 &&
        searchByCode.body?.data?.results?.some(
          (result) => result.territoryCode === 'R7-PUBLIC-01',
        ),
    });

    // A territory name in the restricted fixture exercises the exact same
    // "anonymous never sees the non-public layer" boundary as §1, applied to
    // search results instead of the catalog list.
    const searchTerm = 'Oscar Alfredo Release';
    const anonymousSearch = await getJson(
      `/geo/search?q=${encodeURIComponent(searchTerm)}`,
    );
    checks.push({
      check: 'search_anonymous_excludes_restricted_layer',
      ok:
        anonymousSearch.status === 200 &&
        !anonymousSearch.body?.data?.results?.some(
          (result) => result.layerCode === RESTRICTED_LAYER_CODE,
        ),
    });

    const authorizedSearch = await getJson(
      `/geo/search?q=${encodeURIComponent(searchTerm)}`,
      token,
    );
    checks.push({
      check: 'search_authorized_includes_restricted_layer',
      ok:
        authorizedSearch.status === 200 &&
        authorizedSearch.body?.data?.results?.some(
          (result) => result.layerCode === RESTRICTED_LAYER_CODE,
        ),
    });

    // 9. Layer profile (P1-2, spec §11) — cached stats, same visibility boundary.
    const profileOk = await getJson(`/geo/layers/${PUBLIC_LAYER_CODE}/profile`);
    checks.push({
      check: 'profile_returns_cached_stats_for_public_layer',
      ok:
        profileOk.status === 200 &&
        profileOk.body?.data?.profile?.featureCount === PUBLIC_FEATURE_COUNT,
    });

    const profileMissingLayer = await getJson(
      '/geo/layers/does-not-exist-at-all/profile',
    );
    checks.push({
      check: 'profile_404_for_missing_layer',
      ok: profileMissingLayer.status === 404,
    });

    const profileAnonymousRestricted = await getJson(
      `/geo/layers/${RESTRICTED_LAYER_CODE}/profile`,
    );
    checks.push({
      check: 'profile_anonymous_404_for_restricted_layer',
      ok: profileAnonymousRestricted.status === 404,
    });

    const profileAuthorizedRestricted = await getJson(
      `/geo/layers/${RESTRICTED_LAYER_CODE}/profile`,
      token,
    );
    checks.push({
      check: 'profile_authorized_200_for_restricted_layer',
      ok: profileAuthorizedRestricted.status === 200,
    });

    // 10. Saved views (P1-4, spec §19) — the only routes in this module that
    // require a real signed-in user, not just a visibility tier.
    const savedViewsAnonymousList = await getJson('/geo/saved-views');
    checks.push({
      check: 'saved_views_anonymous_401',
      ok: savedViewsAnonymousList.status === 401,
    });

    const savedViewsAnonymousCreate = await postJson('/geo/saved-views', {
      name: 'x',
      viewState: { activeLayers: [] },
    });
    checks.push({
      check: 'saved_views_anonymous_create_401',
      ok: savedViewsAnonymousCreate.status === 401,
    });

    const savedViewCreate = await postJson(
      '/geo/saved-views',
      {
        name: 'geo-api-smoke saved view',
        viewState: {
          activeLayers: [
            {
              code: PUBLIC_LAYER_CODE,
              color: '#0f766e',
              opacity: 0.6,
              filters: [],
            },
          ],
        },
      },
      token,
    );
    checks.push({
      check: 'saved_views_create_201',
      ok:
        savedViewCreate.status === 201 &&
        savedViewCreate.body?.data?.view?.name === 'geo-api-smoke saved view',
    });
    const savedViewId = savedViewCreate.body?.data?.view?.id;

    const savedViewInvalidOpacity = await postJson(
      '/geo/saved-views',
      {
        name: 'bad',
        viewState: {
          activeLayers: [{ code: 'x', color: '#fff', opacity: 5, filters: [] }],
        },
      },
      token,
    );
    checks.push({
      check: 'saved_views_invalid_opacity_rejected',
      ok: savedViewInvalidOpacity.status === 400,
    });

    const savedViewMissingName = await postJson(
      '/geo/saved-views',
      { viewState: { activeLayers: [] } },
      token,
    );
    checks.push({
      check: 'saved_views_missing_name_rejected',
      ok: savedViewMissingName.status === 400,
    });

    const savedViewsListAfterCreate = await getJson('/geo/saved-views', token);
    checks.push({
      check: 'saved_views_list_includes_created',
      ok:
        savedViewsListAfterCreate.status === 200 &&
        savedViewsListAfterCreate.body?.data?.views?.some(
          (view) => view.id === savedViewId,
        ),
    });

    const savedViewDelete = await deleteJson(
      `/geo/saved-views/${savedViewId}`,
      token,
    );
    checks.push({
      check: 'saved_views_delete_200',
      ok: savedViewDelete.status === 200,
    });

    const savedViewDeleteAgain = await deleteJson(
      `/geo/saved-views/${savedViewId}`,
      token,
    );
    checks.push({
      check: 'saved_views_delete_missing_404',
      ok: savedViewDeleteAgain.status === 404,
    });

    // 11. Field distribution stats (P1-5, spec §12) — always the whole
    // filtered set, never a table page.
    const statsMissingField = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/stats`,
    );
    checks.push({
      check: 'stats_missing_field_rejected',
      ok: statsMissingField.status === 400,
    });

    const statsUnknownField = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/stats?field=no-such-field`,
    );
    checks.push({
      check: 'stats_unknown_field_rejected',
      ok: statsUnknownField.status === 400,
    });

    const statsGrouped = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/stats?field=activityGeneral`,
    );
    checks.push({
      check: 'stats_grouped_field',
      ok:
        statsGrouped.status === 200 &&
        statsGrouped.body?.data?.stats?.kind === 'grouped' &&
        Array.isArray(statsGrouped.body?.data?.stats?.groups) &&
        statsGrouped.body.data.stats.groups.length > 1,
    });

    const statsNumeric = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/stats?field=areaHa`,
    );
    checks.push({
      check: 'stats_numeric_field',
      ok:
        statsNumeric.status === 200 &&
        statsNumeric.body?.data?.stats?.kind === 'numeric' &&
        typeof statsNumeric.body?.data?.stats?.count === 'number',
    });

    const statsWithFilter = await getJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/stats?field=activityGeneral&${filtersQuery(
        [{ field: 'province', operator: 'eq', value: 'Alajuela' }],
      )}`,
    );
    const statsWithoutFilter = statsGrouped;
    checks.push({
      check: 'stats_respects_filters',
      ok:
        statsWithFilter.status === 200 &&
        JSON.stringify(statsWithFilter.body?.data?.stats?.groups) !==
          JSON.stringify(statsWithoutFilter.body?.data?.stats?.groups),
    });

    const statsAnonymousRestricted = await getJson(
      `/geo/layers/${RESTRICTED_LAYER_CODE}/stats?field=level`,
    );
    checks.push({
      check: 'stats_anonymous_404_for_restricted_layer',
      ok: statsAnonymousRestricted.status === 404,
    });

    const statsAuthorizedRestricted = await getJson(
      `/geo/layers/${RESTRICTED_LAYER_CODE}/stats?field=level`,
      token,
    );
    checks.push({
      check: 'stats_authorized_200_for_restricted_layer',
      ok: statsAuthorizedRestricted.status === 200,
    });

    // 12. Proximity search (P1-6, spec §10) — a real centroid from the public
    // layer's own data (verified via psql), not a synthetic coordinate.
    const NEARBY_POINT = { type: 'Point', coordinates: [-83.995, 10] };
    const RESTRICTED_LAYER_POINT = {
      type: 'Point',
      coordinates: [-84.1, 10.1],
    };

    const nearbyMissingGeometry = await postJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/nearby`,
      { radiusMeters: 1000 },
    );
    checks.push({
      check: 'nearby_missing_geometry_rejected',
      ok: nearbyMissingGeometry.status === 400,
    });

    const nearbyInvalidRadius = await postJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/nearby`,
      {
        geometry: NEARBY_POINT,
        radiusMeters: -5,
      },
    );
    checks.push({
      check: 'nearby_invalid_radius_rejected',
      ok: nearbyInvalidRadius.status === 400,
    });

    const nearbyRadiusTooLarge = await postJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/nearby`,
      {
        geometry: NEARBY_POINT,
        radiusMeters: 9999999,
      },
    );
    checks.push({
      check: 'nearby_radius_too_large_rejected',
      ok: nearbyRadiusTooLarge.status === 400,
    });

    const nearbyInvalidGeometryType = await postJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/nearby`,
      {
        geometry: { type: 'NotAType', coordinates: [] },
        radiusMeters: 1000,
      },
    );
    checks.push({
      check: 'nearby_invalid_geometry_type_rejected',
      ok: nearbyInvalidGeometryType.status === 400,
    });

    const nearbySmallRadius = await postJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/nearby`,
      {
        geometry: NEARBY_POINT,
        radiusMeters: 100,
      },
    );
    const nearbyLargeRadius = await postJson(
      `/geo/layers/${PUBLIC_LAYER_CODE}/nearby`,
      {
        geometry: NEARBY_POINT,
        radiusMeters: 10000,
      },
    );
    checks.push({
      check: 'nearby_returns_results_sorted_by_distance',
      ok:
        nearbySmallRadius.status === 201 &&
        nearbyLargeRadius.status === 201 &&
        Array.isArray(nearbyLargeRadius.body?.data?.results) &&
        nearbyLargeRadius.body.data.results.length >=
          nearbySmallRadius.body.data.results.length &&
        nearbyLargeRadius.body.data.results.every(
          (result, index, all) =>
            index === 0 ||
            result.distanceMeters >= all[index - 1].distanceMeters,
        ),
    });

    const nearbyAnonymousRestricted = await postJson(
      `/geo/layers/${RESTRICTED_LAYER_CODE}/nearby`,
      {
        geometry: RESTRICTED_LAYER_POINT,
        radiusMeters: 1000,
      },
    );
    checks.push({
      check: 'nearby_anonymous_404_for_restricted_layer',
      ok: nearbyAnonymousRestricted.status === 404,
    });

    const nearbyAuthorizedRestricted = await postJson(
      `/geo/layers/${RESTRICTED_LAYER_CODE}/nearby`,
      { geometry: RESTRICTED_LAYER_POINT, radiusMeters: 1000 },
      token,
    );
    checks.push({
      check: 'nearby_authorized_201_for_restricted_layer',
      ok: nearbyAuthorizedRestricted.status === 201,
    });

    // Layer-on-layer analysis is bounded and applies visibility to both
    // inputs, including when only the target is restricted.
    const anonymousIntersection = await postJson('/geo/analysis/intersection', {
      sourceLayerCode: PUBLIC_LAYER_CODE,
      targetLayerCode: RESTRICTED_LAYER_CODE,
    });
    checks.push({
      check: 'intersection_anonymous_404_when_one_layer_is_restricted',
      ok: anonymousIntersection.status === 404,
    });

    const authorizedIntersection = await postJson(
      '/geo/analysis/intersection',
      { sourceLayerCode: PUBLIC_LAYER_CODE, targetLayerCode: RESTRICTED_LAYER_CODE },
      token,
    );
    checks.push({
      check: 'intersection_authorized_returns_metrics_and_bounded_geojson',
      ok:
        authorizedIntersection.status === 201 &&
        Number.isInteger(authorizedIntersection.body?.data?.result?.summary?.pairCount) &&
        authorizedIntersection.body?.data?.result?.featureCollection?.type === 'FeatureCollection' &&
        authorizedIntersection.body.data.result.featureCollection.features.length <= 200,
    });

    const identicalIntersection = await postJson(
      '/geo/analysis/intersection',
      { sourceLayerCode: PUBLIC_LAYER_CODE, targetLayerCode: PUBLIC_LAYER_CODE },
      token,
    );
    checks.push({
      check: 'intersection_rejects_identical_layers',
      ok: identicalIntersection.status === 400,
    });

    const passedChecks = checks.filter((item) => item.ok).length;
    console.log(
      JSON.stringify(
        {
          gate: 'sigi.geo.api',
          apiBaseUrl: API_BASE_URL,
          passedChecks,
          totalChecks: checks.length,
          checks,
        },
        null,
        2,
      ),
    );

    if (passedChecks !== checks.length) {
      process.exitCode = 1;
    }
  } finally {
    applyFixture('geo-api-smoke.cleanup.sql');
  }
}

function applyFixture(fileName) {
  const sql = readFileSync(resolve('tests', 'fixtures', fileName));
  const postgresContainer = resolvePostgresContainer();
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      postgresContainer,
      'psql',
      '-U',
      process.env.POSTGRES_USER ?? 'sigi_user',
      '-d',
      process.env.POSTGRES_DB ?? 'sigi_db',
    ],
    { input: sql, stdio: ['pipe', 'ignore', 'pipe'] },
  );
}

function resolvePostgresContainer() {
  if (process.env.SIGI_SMOKE_POSTGRES_CONTAINER) {
    return process.env.SIGI_SMOKE_POSTGRES_CONTAINER;
  }
  const project = process.env.SIGI_COMPOSE_PROJECT_NAME?.trim();
  const args = ['ps', '--filter', 'label=com.docker.compose.service=postgres'];
  if (project) {
    args.push('--filter', `label=com.docker.compose.project=${project}`);
  }
  args.push('--format', '{{.Names}}');
  const names = execFileSync('docker', args, { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length !== 1) {
    throw new Error(
      `No se pudo resolver un único PostgreSQL activo; define SIGI_SMOKE_POSTGRES_CONTAINER (${names.length} encontrados).`,
    );
  }
  return names[0];
}

function filtersQuery(filters) {
  return `filters=${encodeURIComponent(JSON.stringify(filters))}`;
}

async function login(email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(
      `No se pudo iniciar sesión para ${email}: ${payload?.message ?? response.status}`,
    );
  }

  return payload?.data?.accessToken;
}

async function getJson(path, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await safeJson(response);
  return { status: response.status, body };
}

async function getRaw(path, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text };
}

async function postJson(path, body, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const responseBody = await safeJson(response);
  return { status: response.status, body: responseBody };
}

async function deleteJson(path, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await safeJson(response);
  return { status: response.status, body };
}

async function getRawSize(path, token) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  return text.length;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
