#!/bin/sh
set -eu

GEOSERVER_URL="${GEOSERVER_URL:-http://geoserver:8080/geoserver}"
GEOSERVER_REST_URL="${GEOSERVER_URL%/}/rest"
GEOSERVER_ADMIN_USER="${GEOSERVER_ADMIN_USER:-admin}"
GEOSERVER_ADMIN_PASSWORD="${GEOSERVER_ADMIN_PASSWORD:?GEOSERVER_ADMIN_PASSWORD must be configured}"
GEOSERVER_WORKSPACE="${GEOSERVER_WORKSPACE:-sigi}"
GEOSERVER_DATASTORE="${GEOSERVER_DATASTORE:-sigi_postgis}"
GEOSERVER_DB_HOST="${GEOSERVER_DB_HOST:-postgres}"
GEOSERVER_DB_PORT="${GEOSERVER_DB_PORT:-5432}"
GEOSERVER_DB_NAME="${GEOSERVER_DB_NAME:-sigi_db}"
GEOSERVER_DB_SCHEMA="${GEOSERVER_DB_SCHEMA:-gis}"
GEOSERVER_DB_USER="${GEOSERVER_DB_USER:-sigi_user}"
GEOSERVER_DB_PASSWORD="${GEOSERVER_DB_PASSWORD:?GEOSERVER_DB_PASSWORD must be configured}"
GEOSERVER_PUBLISH_PUBLIC_TERRITORIES="${GEOSERVER_PUBLISH_PUBLIC_TERRITORIES:-true}"
GEOSERVER_PUBLIC_FEATURE_NAME="${GEOSERVER_PUBLIC_FEATURE_NAME:-public_territories}"
GEOSERVER_PUBLIC_VIEW_NAME="${GEOSERVER_PUBLIC_VIEW_NAME:-v_public_territories}"
GEOSERVER_PUBLISH_PUBLIC_PROJECT_POLYGONS="${GEOSERVER_PUBLISH_PUBLIC_PROJECT_POLYGONS:-true}"
GEOSERVER_PUBLIC_PROJECT_FEATURE_NAME="${GEOSERVER_PUBLIC_PROJECT_FEATURE_NAME:-public_project_polygons}"
GEOSERVER_PUBLIC_PROJECT_VIEW_NAME="${GEOSERVER_PUBLIC_PROJECT_VIEW_NAME:-v_public_project_polygons}"
GEOSERVER_PUBLISH_PUBLIC_PROJECT_CENTROIDS="${GEOSERVER_PUBLISH_PUBLIC_PROJECT_CENTROIDS:-true}"
GEOSERVER_PUBLIC_PROJECT_CENTROID_FEATURE_NAME="${GEOSERVER_PUBLIC_PROJECT_CENTROID_FEATURE_NAME:-public_project_centroids}"
GEOSERVER_PUBLIC_PROJECT_CENTROID_VIEW_NAME="${GEOSERVER_PUBLIC_PROJECT_CENTROID_VIEW_NAME:-v_public_project_centroids}"

environment_name="$(printf '%s' "${APP_ENV:-${NODE_ENV:-development}}" | tr '[:upper:]' '[:lower:]')"
admin_password_normalized="$(printf '%s' "${GEOSERVER_ADMIN_PASSWORD}" | tr '[:upper:]' '[:lower:]')"
if [ "${environment_name}" = "production" ] && [ "${admin_password_normalized}" = "geoserver" ]; then
  echo "Refusing to start GeoServer bootstrap with the factory admin password in production." >&2
  exit 1
fi

if [ "${GEOSERVER_VALIDATE_ONLY:-false}" = "true" ]; then
  echo "GeoServer environment validation passed."
  exit 0
fi

echo "Waiting for GeoServer REST at ${GEOSERVER_REST_URL}..."
attempt=0
until curl -fsS -u "${GEOSERVER_ADMIN_USER}:${GEOSERVER_ADMIN_PASSWORD}" \
  "${GEOSERVER_REST_URL}/about/version.xml" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 90 ]; then
    echo "GeoServer REST did not become ready in time."
    exit 1
  fi
  sleep 5
done

workspace_status="$(curl -s -o /dev/null -w "%{http_code}" \
  -u "${GEOSERVER_ADMIN_USER}:${GEOSERVER_ADMIN_PASSWORD}" \
  "${GEOSERVER_REST_URL}/workspaces/${GEOSERVER_WORKSPACE}.xml")"

if [ "${workspace_status}" = "200" ]; then
  echo "Workspace ${GEOSERVER_WORKSPACE} already exists."
else
  echo "Creating workspace ${GEOSERVER_WORKSPACE}..."
  curl -fsS -u "${GEOSERVER_ADMIN_USER}:${GEOSERVER_ADMIN_PASSWORD}" \
    -X POST \
    -H "Content-Type: text/xml" \
    -d "<workspace><name>${GEOSERVER_WORKSPACE}</name></workspace>" \
    "${GEOSERVER_REST_URL}/workspaces"
fi

datastore_status="$(curl -s -o /dev/null -w "%{http_code}" \
  -u "${GEOSERVER_ADMIN_USER}:${GEOSERVER_ADMIN_PASSWORD}" \
  "${GEOSERVER_REST_URL}/workspaces/${GEOSERVER_WORKSPACE}/datastores/${GEOSERVER_DATASTORE}.xml")"

datastore_method="POST"
datastore_endpoint="${GEOSERVER_REST_URL}/workspaces/${GEOSERVER_WORKSPACE}/datastores"
if [ "${datastore_status}" = "200" ]; then
  echo "Updating datastore ${GEOSERVER_DATASTORE} credentials and policy..."
  datastore_method="PUT"
  datastore_endpoint="${datastore_endpoint}/${GEOSERVER_DATASTORE}.xml"
else
  echo "Creating datastore ${GEOSERVER_DATASTORE}..."
fi
curl -fsS -u "${GEOSERVER_ADMIN_USER}:${GEOSERVER_ADMIN_PASSWORD}" \
  -X "${datastore_method}" \
  -H "Content-Type: text/xml" \
  -d @- \
  "${datastore_endpoint}" <<EOF
<dataStore>
  <name>${GEOSERVER_DATASTORE}</name>
  <enabled>true</enabled>
  <connectionParameters>
    <entry key="dbtype">postgis</entry>
    <entry key="host">${GEOSERVER_DB_HOST}</entry>
    <entry key="port">${GEOSERVER_DB_PORT}</entry>
    <entry key="database">${GEOSERVER_DB_NAME}</entry>
    <entry key="schema">${GEOSERVER_DB_SCHEMA}</entry>
    <entry key="user">${GEOSERVER_DB_USER}</entry>
    <entry key="passwd">${GEOSERVER_DB_PASSWORD}</entry>
    <entry key="Expose primary keys">true</entry>
    <entry key="validate connections">true</entry>
    <entry key="Connection timeout">20</entry>
    <entry key="min connections">1</entry>
    <entry key="max connections">10</entry>
  </connectionParameters>
</dataStore>
EOF

publish_feature_type() {
  feature_name="$1"
  native_name="$2"
  feature_title="$3"
  feature_status="$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${GEOSERVER_ADMIN_USER}:${GEOSERVER_ADMIN_PASSWORD}" \
    "${GEOSERVER_REST_URL}/workspaces/${GEOSERVER_WORKSPACE}/datastores/${GEOSERVER_DATASTORE}/featuretypes/${feature_name}.xml")"

  if [ "${feature_status}" = "200" ]; then
    echo "Feature type ${feature_name} already exists."
  else
    echo "Publishing feature type ${feature_name} from ${native_name}..."
    curl -fsS -u "${GEOSERVER_ADMIN_USER}:${GEOSERVER_ADMIN_PASSWORD}" \
      -X POST \
      -H "Content-Type: text/xml" \
      -d @- \
      "${GEOSERVER_REST_URL}/workspaces/${GEOSERVER_WORKSPACE}/datastores/${GEOSERVER_DATASTORE}/featuretypes" <<EOF
<featureType>
  <name>${feature_name}</name>
  <nativeName>${native_name}</nativeName>
  <title>${feature_title}</title>
  <srs>EPSG:4326</srs>
</featureType>
EOF
  fi
}

publish_style() {
  style_name="$1"
  style_file="/bootstrap/styles/${style_name}.sld"
  style_status="$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${GEOSERVER_ADMIN_USER}:${GEOSERVER_ADMIN_PASSWORD}" \
    "${GEOSERVER_REST_URL}/workspaces/${GEOSERVER_WORKSPACE}/styles/${style_name}.json")"

  if [ "${style_status}" = "200" ]; then
    echo "Updating style ${style_name}..."
    curl -fsS -u "${GEOSERVER_ADMIN_USER}:${GEOSERVER_ADMIN_PASSWORD}" \
      -X PUT -H "Content-Type: application/vnd.ogc.sld+xml" \
      --data-binary "@${style_file}" \
      "${GEOSERVER_REST_URL}/workspaces/${GEOSERVER_WORKSPACE}/styles/${style_name}.sld"
  else
    echo "Creating style ${style_name}..."
    curl -fsS -u "${GEOSERVER_ADMIN_USER}:${GEOSERVER_ADMIN_PASSWORD}" \
      -X POST -H "Content-Type: application/vnd.ogc.sld+xml" \
      --data-binary "@${style_file}" \
      "${GEOSERVER_REST_URL}/workspaces/${GEOSERVER_WORKSPACE}/styles?name=${style_name}"
  fi
}

assign_default_style() {
  feature_name="$1"
  style_name="$2"
  curl -fsS -u "${GEOSERVER_ADMIN_USER}:${GEOSERVER_ADMIN_PASSWORD}" \
    -X PUT -H "Content-Type: text/xml" -d @- \
    "${GEOSERVER_REST_URL}/layers/${GEOSERVER_WORKSPACE}:${feature_name}.xml" <<EOF
<layer><defaultStyle><name>${GEOSERVER_WORKSPACE}:${style_name}</name></defaultStyle></layer>
EOF
}

publish_style "sigi_territories"
publish_style "sigi_project_polygons"
publish_style "sigi_project_centroids"

if [ "${GEOSERVER_PUBLISH_PUBLIC_TERRITORIES}" = "true" ]; then
  publish_feature_type \
    "${GEOSERVER_PUBLIC_FEATURE_NAME}" \
    "${GEOSERVER_PUBLIC_VIEW_NAME}" \
    "Public Territories"
  assign_default_style "${GEOSERVER_PUBLIC_FEATURE_NAME}" "sigi_territories"
fi

if [ "${GEOSERVER_PUBLISH_PUBLIC_PROJECT_POLYGONS}" = "true" ]; then
  publish_feature_type \
    "${GEOSERVER_PUBLIC_PROJECT_FEATURE_NAME}" \
    "${GEOSERVER_PUBLIC_PROJECT_VIEW_NAME}" \
    "Public Project Polygons"
  assign_default_style "${GEOSERVER_PUBLIC_PROJECT_FEATURE_NAME}" "sigi_project_polygons"
fi

if [ "${GEOSERVER_PUBLISH_PUBLIC_PROJECT_CENTROIDS}" = "true" ]; then
  publish_feature_type \
    "${GEOSERVER_PUBLIC_PROJECT_CENTROID_FEATURE_NAME}" \
    "${GEOSERVER_PUBLIC_PROJECT_CENTROID_VIEW_NAME}" \
    "Public Project Centroids"
  assign_default_style "${GEOSERVER_PUBLIC_PROJECT_CENTROID_FEATURE_NAME}" "sigi_project_centroids"
fi

echo "GeoServer bootstrap completed."
