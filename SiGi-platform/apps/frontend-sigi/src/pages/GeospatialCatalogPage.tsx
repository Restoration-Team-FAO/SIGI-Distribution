import { useEffect, useState } from 'react';
import {
  workspaceApi,
  adminGeoServerConfig,
  getAdminSessionUser,
  type GeoServerPublishedLayer,
  type GeospatialCatalogEntry,
  type GeospatialProjectPublication,
  type ShapefilePreview,
  type LayerVisibility,
} from '../services/api';
import { hasPermission } from '../utils/permissions';
import {
  DetailList,
  MessageBlock,
  MetricCard,
  MetricGrid,
  PageLead,
  Panel,
  PanelGrid,
  StatPill,
} from '../components/section-kit';

type GeospatialCatalogModel = {
  summary: {
    catalogEntries: number;
    managedLayers: number;
    derivedLayers: number;
    publicLayers: number;
    publishedInGeoServer: number;
  };
  geoserver: {
    workspace: string | null;
    wmsUrl: string;
    wfsUrl: string;
    capabilitiesUrl: string;
    publishedLayers: GeoServerPublishedLayer[];
  };
  workbench: {
    connectors: {
      postgis: {
        host: string;
        port: string;
        database: string;
        schema: string;
        user: string;
        connectionName: string;
        qgisUriSample: string;
        sampleLayers: string[];
      };
      geoserver: {
        workspace: string | null;
        datastore: string;
        wmsUrl: string;
        wfsUrl: string;
        capabilitiesUrl: string;
      };
    };
    imports: {
      supportedFormats: string[];
      geometrySupport: string;
      notes: string;
    };
    exports: {
      supportedFormats: string[];
      notes: string;
    };
    projectPublications: GeospatialProjectPublication[];
  };
  entries: GeospatialCatalogEntry[];
};

type ImportFormState = {
  file: File | null;
  code: string;
  name: string;
  layerType: string;
  visibility: LayerVisibility;
  status: 'draft' | 'active' | 'published';
  territoryLevel: string;
};

// V2-02: visibilidad fail-closed. Por defecto Interna; publicar exige elegir "Pública" explícitamente.
const LAYER_VISIBILITY_OPTIONS: Array<{ value: LayerVisibility; label: string }> = [
  { value: 'internal', label: 'Interna (usuarios autenticados con permiso)' },
  { value: 'institutional', label: 'Institucional' },
  { value: 'restricted', label: 'Restringida' },
  { value: 'private', label: 'Privada' },
  { value: 'public', label: 'Pública (WMS/WFS y API sin sesión)' },
];

const initialImportForm: ImportFormState = {
  file: null,
  code: '',
  name: '',
  layerType: 'polygon',
  visibility: 'internal',
  status: 'published',
  territoryLevel: 'custom',
};

const SHAPEFILE_IMPORT_MODE_OPTIONS = [
  {
    value: 'reference-layer' as const,
    label: 'Capa de referencia',
    hint: 'No exige project_code. Ideal para bordes, suelos, clima y capas base.',
  },
  {
    value: 'project-linked' as const,
    label: 'Ligada a proyecto',
    hint: 'Exige project_code para integrar la geometría con proyectos SIGI/Odoo.',
  },
];

type GeospatialIntakeKind =
  | 'geojson'
  | 'shapefile-zip'
  | 'filegdb-zip'
  | 'unknown';

type GeoJsonPreviewState = {
  kind: 'FeatureCollection' | 'Feature';
  featureCount: number;
  geometryTypes: string[];
  polygonFeatures: number;
  nonPolygonFeatures: number;
  samplePropertyKeys: string[];
  warnings: string[];
};

function detectGeospatialIntakeKind(file: File | null) {
  if (!file) {
    return 'unknown' as const;
  }
  const normalized = file.name.trim().toLowerCase();
  if (
    normalized.endsWith('.geojson') ||
    normalized.endsWith('.json')
  ) {
    return 'geojson' as const;
  }
  if (normalized.endsWith('.gdb.zip') || normalized.includes('.gdb')) {
    return 'filegdb-zip' as const;
  }
  if (normalized.endsWith('.zip')) {
    return 'shapefile-zip' as const;
  }
  return 'unknown' as const;
}

function geospatialIntakeLabel(kind: GeospatialIntakeKind) {
  return (
    {
      geojson: 'GeoJSON',
      'shapefile-zip': 'Shapefile ZIP',
      'filegdb-zip': 'FileGDB / GDB comprimida',
      unknown: 'No identificado',
    }[kind] ?? kind
  );
}

function geospatialIntakeGuidance(kind: GeospatialIntakeKind) {
  if (kind === 'filegdb-zip') {
    return 'La GDB aún no se ingesta de forma nativa en SIGI. Usa QGIS/ogr2ogr para exportarla a GeoJSON o Shapefile ZIP antes de continuar.';
  }
  if (kind === 'shapefile-zip') {
    return 'Formato correcto para el flujo Shapefile. Asegúrate de incluir .shp, .shx, .dbf y preferiblemente .prj.';
  }
  if (kind === 'geojson') {
    return 'Formato correcto para la carga rápida GeoJSON hacia PostGIS y el catálogo SIGI.';
  }
  return 'Verifica el formato del archivo antes de continuar. Para esta consola se recomienda GeoJSON o Shapefile ZIP.';
}

function getShapefileCrsAssessment(crs: string | null | undefined) {
  const normalized = String(crs ?? '').toLowerCase();
  if (!normalized) {
    return { tone: 'warn' as const, label: 'CRS no informado' };
  }
  if (normalized.includes('4326') || normalized.includes('wgs84') || normalized.includes('wgs 84')) {
    return { tone: 'good' as const, label: 'CRS compatible' };
  }
  if (normalized.includes('assumed')) {
    return { tone: 'warn' as const, label: 'CRS asumido' };
  }
  return { tone: 'warn' as const, label: 'Revisar proyección' };
}

function getShapefilePreviewCountries(preview: ShapefilePreview | null) {
  if (!preview) {
    return [] as string[];
  }
  return Array.from(
    new Set(
      preview.previewRows
        .map((row) => (typeof row.country === 'string' ? row.country.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  );
}

function formatPreviewBbox(
  bbox:
    | {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
      }
    | null
    | undefined,
) {
  if (!bbox) {
    return 'No disponible';
  }
  return `${bbox.minLon}, ${bbox.minLat} → ${bbox.maxLon}, ${bbox.maxLat}`;
}

function getShapefileIssueGuidance(code: string) {
  return {
    territory_code_not_found_in_catalog:
      'El código territorial no existe aún en SIGI. Revísalo o regístralo antes de publicar definitivamente.',
    territory_name_mismatch:
      'El nombre territorial no coincide con el catálogo SIGI. Conviene homologarlo para evitar duplicidades.',
    territory_level_mismatch:
      'El nivel territorial no coincide con SIGI. Corrige el nivel antes de promover esta capa.',
    geometry_outside_national_bounds:
      'La geometría cae fuera del bbox nacional configurado. Verifica país, proyección o archivo.',
    project_code_required:
      'Falta project_code para este modo de importación ligado a proyecto.',
  }[code] ?? 'Revisa este hallazgo antes de continuar con la promoción.';
}

function hasBlockingShapefileIssues(preview: ShapefilePreview | null) {
  if (!preview) {
    return false;
  }
  return preview.validationIssues.some((issue) => issue.severity === 'error');
}

export function GeospatialCatalogPage() {
  const currentUser = getAdminSessionUser();
  const canReadCatalog = hasPermission(currentUser, 'connectors.read');
  const canReadProjects = hasPermission(currentUser, 'projects.read');
  const canUploadImports = hasPermission(currentUser, 'imports.upload');
  const canPublishOutputs = hasPermission(currentUser, 'publications.publish');
  const [model, setModel] = useState<GeospatialCatalogModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishingCode, setPublishingCode] = useState<string | null>(null);
  const [publishingProjectId, setPublishingProjectId] = useState<string | null>(null);
  const [exportingCode, setExportingCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [previewingGeoJson, setPreviewingGeoJson] = useState(false);
  const [geojsonPreview, setGeojsonPreview] = useState<GeoJsonPreviewState | null>(null);
  const [previewingShapefile, setPreviewingShapefile] = useState(false);
  const [importingShapefile, setImportingShapefile] = useState(false);
  const [shapefilePreview, setShapefilePreview] = useState<ShapefilePreview | null>(null);
  const [importForm, setImportForm] = useState<ImportFormState>(initialImportForm);
  const [shapefileFile, setShapefileFile] = useState<File | null>(null);
  const [shapefileCode, setShapefileCode] = useState('');
  const [shapefileName, setShapefileName] = useState('');
  const [shapefileMappingJson, setShapefileMappingJson] = useState('');
  const [shapefileCountry, setShapefileCountry] = useState('');
  const [shapefileVisibility, setShapefileVisibility] = useState<LayerVisibility>('internal');
  const [shapefileImportMode, setShapefileImportMode] = useState<
    'project-linked' | 'reference-layer'
  >('reference-layer');
  const geojsonFileKind = detectGeospatialIntakeKind(importForm.file);
  const shapefileFileKind = detectGeospatialIntakeKind(shapefileFile);
  const shapefilePreviewCountries = getShapefilePreviewCountries(shapefilePreview);
  const shapefileCrsAssessment = getShapefileCrsAssessment(shapefilePreview?.crs);
  const shapefileHasBlockingIssues = hasBlockingShapefileIssues(shapefilePreview);

  async function loadModel() {
    if (!canReadCatalog) {
      setModel(null);
      return;
    }
    const response = await workspaceApi.getGeospatialCatalog();
    setModel(response.data);
  }

  useEffect(() => {
    loadModel().catch((reason: Error) => setError(reason.message));
  }, [canReadCatalog]);

  function toPublicGeoServerUrl(value: string) {
    if (!adminGeoServerConfig?.wmsUrl) {
      return value;
    }

    try {
      const publicUrl = new URL(adminGeoServerConfig.wmsUrl);
      const targetUrl = new URL(value);
      if (targetUrl.hostname !== 'geoserver') {
        return value;
      }
      targetUrl.protocol = publicUrl.protocol;
      targetUrl.hostname = publicUrl.hostname;
      targetUrl.port = publicUrl.port;
      return targetUrl.toString();
    } catch {
      return value;
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copiado al portapapeles.`);
      window.setTimeout(() => setNotice(null), 2200);
    } catch {
      setNotice(`No se pudo copiar ${label.toLowerCase()}.`);
      window.setTimeout(() => setNotice(null), 2200);
    }
  }

  async function publishLayer(entry: GeospatialCatalogEntry) {
    setPublishingCode(entry.code);
    setError(null);
    try {
      const response = await workspaceApi.publishGeospatialLayer(entry.code);
      setNotice(response.data.message);
      await loadModel();
      window.setTimeout(() => setNotice(null), 3200);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'No se pudo publicar la capa.';
      setError(message);
    } finally {
      setPublishingCode(null);
    }
  }

  async function publishProject(project: GeospatialProjectPublication) {
    setPublishingProjectId(project.id);
    setError(null);
    try {
      const response = await workspaceApi.publishGeospatialProject(project.id);
      setNotice(response.data.message);
      await loadModel();
      window.setTimeout(() => setNotice(null), 3200);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'No se pudo publicar el proyecto.';
      setError(message);
    } finally {
      setPublishingProjectId(null);
    }
  }

  async function exportLayer(entry: GeospatialCatalogEntry) {
    setExportingCode(entry.code);
    setError(null);
    try {
      const response = await workspaceApi.exportGeospatialLayer(entry.code);
      const blob = new Blob(
        [JSON.stringify(response.data.featureCollection, null, 2)],
        { type: 'application/geo+json' },
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = response.data.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(`${response.data.fileName} descargado.`);
      window.setTimeout(() => setNotice(null), 2200);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'No se pudo exportar la capa.';
      setError(message);
    } finally {
      setExportingCode(null);
    }
  }

  async function deleteLayer(entry: GeospatialCatalogEntry) {
    const confirmed = window.confirm(
      `Eliminar la capa ${entry.title} del catálogo y de PostGIS?`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingCode(entry.code);
    setError(null);
    try {
      const response = await workspaceApi.deleteGeospatialLayer(entry.code);
      setNotice(response.data.message);
      await loadModel();
      window.setTimeout(() => setNotice(null), 2200);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'No se pudo eliminar la capa.';
      setError(message);
    } finally {
      setDeletingCode(null);
    }
  }

  async function submitImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importForm.file) {
      setError('Selecciona un archivo GeoJSON antes de importar.');
      return;
    }
    if (geojsonFileKind === 'filegdb-zip') {
      setError(
        'Se detectó un paquete FileGDB/GDB. Este flujo todavía no soporta ingestión nativa de GDB; exporta primero a GeoJSON.',
      );
      return;
    }
    if (geojsonFileKind !== 'geojson') {
      setError(
        'El archivo seleccionado no parece GeoJSON. Usa el flujo de shapefile si cargas un .zip o convierte el insumo al formato GeoJSON.',
      );
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const response = await workspaceApi.importGeospatialLayer({
        file: importForm.file,
        code: importForm.code,
        name: importForm.name,
        layerType: importForm.layerType,
        visibility: importForm.visibility,
        status: importForm.status,
        territoryLevel: importForm.territoryLevel,
      });
      setNotice(response.data.message);
      setImportForm(initialImportForm);
      await loadModel();
      window.setTimeout(() => setNotice(null), 3200);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'No se pudo importar el GeoJSON.';
      setError(message);
    } finally {
      setImporting(false);
    }
  }

  async function previewGeoJson() {
    if (!importForm.file) {
      setError('Selecciona un archivo GeoJSON antes de validar.');
      return;
    }
    if (geojsonFileKind !== 'geojson') {
      setError('El archivo seleccionado no parece GeoJSON válido para esta validación previa.');
      return;
    }

    setPreviewingGeoJson(true);
    setError(null);
    try {
      const text = await importForm.file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const preview = buildGeoJsonPreview(parsed);
      setGeojsonPreview(preview);
      setNotice(`Validación previa generada para ${importForm.file.name}.`);
      window.setTimeout(() => setNotice(null), 2200);
    } catch (reason) {
      setGeojsonPreview(null);
      setError(
        reason instanceof Error
          ? reason.message
          : 'No se pudo validar el GeoJSON localmente.',
      );
    } finally {
      setPreviewingGeoJson(false);
    }
  }

  async function previewShapefile() {
    if (!shapefileFile) {
      setError('Selecciona un shapefile .zip para previsualizar.');
      return;
    }
    if (shapefileFileKind === 'filegdb-zip') {
      setError(
        'Se detectó un paquete GDB. La previsualización actual procesa shapefile ZIP; exporta la GDB a shapefile o GeoJSON antes de reintentar.',
      );
      return;
    }
    if (shapefileFileKind !== 'shapefile-zip') {
      setError('El archivo seleccionado no corresponde a un shapefile .zip soportado.');
      return;
    }
    setPreviewingShapefile(true);
    setError(null);
    try {
      const response = await workspaceApi.previewGeospatialShapefile({
        file: shapefileFile,
        mappingJson: shapefileMappingJson,
        country: shapefileCountry,
        importMode: shapefileImportMode,
      });
      setShapefilePreview(response.data);
      setNotice(`Preview generado para ${response.data.fileName}.`);
      window.setTimeout(() => setNotice(null), 2200);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'No se pudo generar el preview.';
      setError(message);
    } finally {
      setPreviewingShapefile(false);
    }
  }

  async function importShapefile() {
    if (!shapefileFile) {
      setError('Selecciona un shapefile .zip antes de importar.');
      return;
    }
    if (shapefileFileKind === 'filegdb-zip') {
      setError(
        'La importación directa de FileGDB/GDB aún no está habilitada. Convierte el paquete a shapefile ZIP o GeoJSON para mantener trazabilidad compatible.',
      );
      return;
    }
    if (shapefileFileKind !== 'shapefile-zip') {
      setError('El archivo seleccionado no corresponde a un shapefile .zip soportado.');
      return;
    }
    if (!shapefileCode.trim() || !shapefileName.trim()) {
      setError('Define código y nombre para la capa shapefile.');
      return;
    }
    setImportingShapefile(true);
    setError(null);
    try {
      const response = await workspaceApi.importGeospatialShapefile({
        file: shapefileFile,
        code: shapefileCode,
        name: shapefileName,
        layerType: 'polygon',
        visibility: shapefileVisibility,
        status: 'published',
        mappingJson: shapefileMappingJson,
        country: shapefileCountry,
        importMode: shapefileImportMode,
      });
      setNotice(response.data.message);
      setShapefilePreview(null);
      setShapefileFile(null);
      setShapefileCode('');
      setShapefileName('');
      setShapefileMappingJson('');
      setShapefileCountry('');
      setShapefileVisibility('internal');
      setShapefileImportMode('reference-layer');
      await loadModel();
      window.setTimeout(() => setNotice(null), 3200);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'No se pudo importar el shapefile.';
      setError(message);
    } finally {
      setImportingShapefile(false);
    }
  }

  function buildWmsUrl(layerName: string) {
    if (!model) {
      return '';
    }
    const url = new URL(toPublicGeoServerUrl(model.geoserver.wmsUrl));
    url.searchParams.set('service', 'WMS');
    url.searchParams.set('version', '1.1.1');
    url.searchParams.set('request', 'GetMap');
    url.searchParams.set('layers', layerName);
    url.searchParams.set('styles', '');
    url.searchParams.set('format', 'image/png');
    url.searchParams.set('transparent', 'true');
    url.searchParams.set('srs', 'EPSG:4326');
    url.searchParams.set('width', '1024');
    url.searchParams.set('height', '768');
    url.searchParams.set('bbox', '-86,8,-82,12');
    return url.toString();
  }

  function buildWfsUrl(layerName: string) {
    if (!model) {
      return '';
    }
    const url = new URL(toPublicGeoServerUrl(model.geoserver.wfsUrl));
    url.searchParams.set('service', 'WFS');
    url.searchParams.set('version', '1.0.0');
    url.searchParams.set('request', 'GetFeature');
    url.searchParams.set('typeName', layerName);
    url.searchParams.set('outputFormat', 'application/json');
    url.searchParams.set('maxFeatures', '50');
    return url.toString();
  }

  return (
    <section>
      <PageLead
        eyebrow="Geoespacial"
        title="Catálogo Geoespacial"
        description="Superficie geoespacial de trabajo para gobernar capas SIGI, conectarlas con PostGIS y GeoServer, importar GeoJSON, exportar capas y publicar proyectos desde una sola consola administrativa."
        icon="globe"
      />

      {error ? <MessageBlock tone="danger" icon="alert">{error}</MessageBlock> : null}
      {notice ? <MessageBlock icon="status">{notice}</MessageBlock> : null}
      {!canReadCatalog ? (
        <MessageBlock tone="danger" icon="alert">
          Tu perfil no tiene permiso para consultar el catálogo geoespacial.
        </MessageBlock>
      ) : null}

      {canReadCatalog && !error && !model ? (
        <MessageBlock icon="globe">Cargando el catálogo geoespacial gobernado por SIGI...</MessageBlock>
      ) : null}

      {canReadCatalog && model ? (
        <>
          <MetricGrid>
            <MetricCard
              label="Capas catalogadas"
              value={String(model.summary.catalogEntries)}
              hint="Capas gobernadas o derivadas visibles en el catálogo."
              icon="map"
              tone="neutral"
            />
            <MetricCard
              label="Capas gestionadas"
              value={String(model.summary.managedLayers)}
              hint="Capas registradas directamente sobre el modelo geoespacial SIGI."
              icon="database"
              tone="good"
            />
            <MetricCard
              label="Capas derivadas"
              value={String(model.summary.derivedLayers)}
              hint="Publicaciones seguras generadas desde vistas especializadas."
              icon="flow"
              tone="warn"
            />
            <MetricCard
              label="Publicadas en GeoServer"
              value={String(model.summary.publishedInGeoServer)}
              hint="Capas que ya cuentan con exposición WMS/WFS activa."
              icon="publication"
              tone="good"
            />
          </MetricGrid>

          <PanelGrid>
            <Panel
              title="Conector PostGIS"
              subtitle="Datos listos para conectar QGIS Desktop o clientes GIS externos."
              action={<StatPill tone="good">SIGI a PostGIS</StatPill>}
              icon="database"
              tone="good"
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <DetailList
                  items={[
                    { label: 'Host', value: model.workbench.connectors.postgis.host },
                    { label: 'Puerto', value: model.workbench.connectors.postgis.port },
                    { label: 'Base', value: model.workbench.connectors.postgis.database },
                    { label: 'Esquema', value: model.workbench.connectors.postgis.schema },
                    { label: 'Usuario', value: model.workbench.connectors.postgis.user },
                  ]}
                />
                <div style={heroNoteStyle}>
                  {model.workbench.connectors.postgis.connectionName}
                  <br />
                  <code style={codeStyle}>{model.workbench.connectors.postgis.qgisUriSample}</code>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(
                        model.workbench.connectors.postgis.qgisUriSample,
                        'URI PostGIS',
                      )
                    }
                    style={endpointButtonStyle}
                  >
                    Copiar URI QGIS
                  </button>
                  {model.workbench.connectors.postgis.sampleLayers.map((layer) => (
                    <button
                      key={layer}
                      type="button"
                      onClick={() => void copyText(layer, `vista ${layer}`)}
                      style={endpointButtonStyle}
                    >
                      Copiar {layer}
                    </button>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel
              title="Conector GeoServer"
              subtitle="Endpoints OGC para visor, interoperabilidad y clientes GIS."
              action={<StatPill tone="good">SIGI a GeoServer</StatPill>}
              icon="globe"
              tone="good"
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <DetailList
                  items={[
                    {
                      label: 'Workspace',
                      value: model.workbench.connectors.geoserver.workspace ?? 'sigi',
                    },
                    { label: 'Datastore', value: model.workbench.connectors.geoserver.datastore },
                    {
                      label: 'WMS',
                      value: toPublicGeoServerUrl(model.workbench.connectors.geoserver.wmsUrl),
                    },
                    {
                      label: 'WFS',
                      value: toPublicGeoServerUrl(model.workbench.connectors.geoserver.wfsUrl),
                    },
                  ]}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(
                        toPublicGeoServerUrl(model.workbench.connectors.geoserver.wmsUrl),
                        'WMS',
                      )
                    }
                    style={endpointButtonStyle}
                  >
                    Copiar WMS
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(
                        toPublicGeoServerUrl(model.workbench.connectors.geoserver.wfsUrl),
                        'WFS',
                      )
                    }
                    style={endpointButtonStyle}
                  >
                    Copiar WFS
                  </button>
                  <a
                    href={toPublicGeoServerUrl(model.workbench.connectors.geoserver.capabilitiesUrl)}
                    target="_blank"
                    rel="noreferrer"
                    style={endpointLinkStyle}
                  >
                    Abrir capacidades
                  </a>
                </div>
              </div>
            </Panel>
          </PanelGrid>

          <div style={{ height: 18 }} />

          <PanelGrid>
            <Panel
              title="Importación estilo QGIS"
              subtitle="Carga rápida de GeoJSON poligonal hacia PostGIS y el catálogo SIGI."
              action={<StatPill tone="warn">{model.workbench.imports.supportedFormats.join(', ')}</StatPill>}
            >
              <form onSubmit={submitImport} style={{ display: 'grid', gap: 12 }}>
                <div style={warningNoteStyle}>{model.workbench.imports.notes}</div>
                {!canUploadImports ? (
                  <MessageBlock tone="danger" icon="alert">
                    Tu perfil puede ver el módulo, pero no importar capas geoespaciales.
                  </MessageBlock>
                ) : null}
                <label style={fieldStyle}>
                  <span>Archivo GeoJSON</span>
                  <input
                    type="file"
                    accept=".geojson,.json,application/geo+json,application/json"
                    onChange={(event) =>
                      setImportForm((current) => ({
                        ...current,
                        file: event.target.files?.[0] ?? null,
                      }))
                    }
                    disabled={!canUploadImports || importing}
                  />
                </label>
                {importForm.file ? (
                  <div style={heroNoteStyle}>
                    Formato detectado: {geospatialIntakeLabel(geojsonFileKind)}.
                    <br />
                    {geospatialIntakeGuidance(geojsonFileKind)}
                  </div>
                ) : null}
                <div style={formGridStyle}>
                  <label style={fieldStyle}>
                    <span>Código</span>
                    <input
                      value={importForm.code}
                      onChange={(event) =>
                        setImportForm((current) => ({ ...current, code: event.target.value }))
                      }
                      disabled={!canUploadImports || importing}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>Nombre</span>
                    <input
                      value={importForm.name}
                      onChange={(event) =>
                        setImportForm((current) => ({ ...current, name: event.target.value }))
                      }
                      disabled={!canUploadImports || importing}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>Tipo</span>
                    <input
                      value={importForm.layerType}
                      onChange={(event) =>
                        setImportForm((current) => ({
                          ...current,
                          layerType: event.target.value,
                        }))
                      }
                      disabled={!canUploadImports || importing}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>Nivel territorial</span>
                    <input
                      value={importForm.territoryLevel}
                      onChange={(event) =>
                        setImportForm((current) => ({
                          ...current,
                          territoryLevel: event.target.value,
                        }))
                      }
                      disabled={!canUploadImports || importing}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>Visibilidad</span>
                    <select
                      value={importForm.visibility}
                      onChange={(event) => setImportForm((current) => ({ ...current, visibility: event.target.value as LayerVisibility }))}
                      disabled={!canUploadImports || importing}
                    >
                      {LAYER_VISIBILITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    style={endpointButtonStyle}
                    disabled={!canUploadImports || previewingGeoJson || importing}
                    onClick={() => void previewGeoJson()}
                  >
                    {previewingGeoJson ? 'Validando...' : 'Validar GeoJSON'}
                  </button>
                  <button
                    type="submit"
                    style={publishButtonStyle}
                    disabled={!canUploadImports || importing}
                  >
                    {importing ? 'Importando...' : 'Importar GeoJSON'}
                  </button>
                </div>
                {geojsonPreview ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <DetailList
                      items={[
                        { label: 'Estructura', value: geojsonPreview.kind },
                        { label: 'Features', value: String(geojsonPreview.featureCount) },
                        {
                          label: 'Geometrías',
                          value: geojsonPreview.geometryTypes.join(', ') || 'n/a',
                        },
                        {
                          label: 'Polygon/MultiPolygon',
                          value: String(geojsonPreview.polygonFeatures),
                        },
                        {
                          label: 'No soportadas',
                          value: String(geojsonPreview.nonPolygonFeatures),
                        },
                        {
                          label: 'Propiedades detectadas',
                          value: geojsonPreview.samplePropertyKeys.join(', ') || 'sin propiedades',
                        },
                      ]}
                    />
                    {geojsonPreview.warnings.length > 0 ? (
                      <div style={warningNoteStyle}>
                        {geojsonPreview.warnings.join(' | ')}
                      </div>
                    ) : (
                      <div style={heroNoteStyle}>
                        El archivo cumple la prevalidación local para la fase actual: estructura GeoJSON y geometrías poligonales.
                      </div>
                    )}
                  </div>
                ) : null}
              </form>
            </Panel>

            <Panel
              title="Importación de Shapefile"
              subtitle="Preview y transformación segura de shapefile .zip usando GIS Service."
              action={<StatPill tone="warn">Fase 2</StatPill>}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={warningNoteStyle}>
                  Requiere archivo `.zip` con `.shp`, `.shx`, `.dbf` y preferiblemente `.prj`.
                </div>
                {!canUploadImports ? (
                  <MessageBlock tone="danger" icon="alert">
                    La previsualización y la importación shapefile requieren permiso de carga.
                  </MessageBlock>
                ) : null}
                <label style={fieldStyle}>
                  <span>Modo de importación</span>
                  <select
                    value={shapefileImportMode}
                    onChange={(event) =>
                      setShapefileImportMode(
                        event.target.value as 'project-linked' | 'reference-layer',
                      )
                    }
                    disabled={!canUploadImports || previewingShapefile || importingShapefile}
                  >
                    {SHAPEFILE_IMPORT_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={heroNoteStyle}>
                  {
                    SHAPEFILE_IMPORT_MODE_OPTIONS.find(
                      (option) => option.value === shapefileImportMode,
                    )?.hint
                  }
                </div>
                <label style={fieldStyle}>
                  <span>Archivo shapefile zip</span>
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(event) => setShapefileFile(event.target.files?.[0] ?? null)}
                    disabled={!canUploadImports || previewingShapefile || importingShapefile}
                  />
                </label>
                {shapefileFile ? (
                  <div
                    style={
                      shapefileFileKind === 'filegdb-zip'
                        ? warningNoteStyle
                        : heroNoteStyle
                    }
                  >
                    Formato detectado: {geospatialIntakeLabel(shapefileFileKind)}.
                    <br />
                    {geospatialIntakeGuidance(shapefileFileKind)}
                  </div>
                ) : null}
                <div style={formGridStyle}>
                  <label style={fieldStyle}>
                    <span>Código capa</span>
                    <input
                      value={shapefileCode}
                      onChange={(event) => setShapefileCode(event.target.value)}
                      disabled={!canUploadImports || importingShapefile}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>Nombre capa</span>
                    <input
                      value={shapefileName}
                      onChange={(event) => setShapefileName(event.target.value)}
                      disabled={!canUploadImports || importingShapefile}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>Country fallback</span>
                    <input
                      value={shapefileCountry}
                      onChange={(event) => setShapefileCountry(event.target.value)}
                      disabled={!canUploadImports || importingShapefile}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>Visibilidad</span>
                    <select
                      value={shapefileVisibility}
                      onChange={(event) => setShapefileVisibility(event.target.value as LayerVisibility)}
                      disabled={!canUploadImports || importingShapefile}
                    >
                      {LAYER_VISIBILITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label style={fieldStyle}>
                  <span>Mapping JSON opcional</span>
                  <textarea
                    value={shapefileMappingJson}
                    onChange={(event) => setShapefileMappingJson(event.target.value)}
                    rows={5}
                    style={textareaStyle}
                    placeholder='{"project_code":"COD_PROY","territory_name":"NOMBRE"}'
                    disabled={!canUploadImports || previewingShapefile || importingShapefile}
                  />
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    style={endpointButtonStyle}
                    disabled={!canUploadImports || previewingShapefile}
                    onClick={() => void previewShapefile()}
                  >
                    {previewingShapefile ? 'Previsualizando...' : 'Previsualizar shapefile'}
                  </button>
                  <button
                    type="button"
                    style={publishButtonStyle}
                    disabled={
                      !canUploadImports ||
                      importingShapefile ||
                      !shapefilePreview ||
                      shapefileHasBlockingIssues
                    }
                    onClick={() => void importShapefile()}
                  >
                    {importingShapefile ? 'Importando...' : 'Importar shapefile'}
                  </button>
                </div>
                {shapefilePreview ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <StatPill tone={shapefileCrsAssessment.tone}>
                        {shapefileCrsAssessment.label}
                      </StatPill>
                      <StatPill tone={shapefilePreview.validationSummary.invalidRows > 0 ? 'warn' : 'good'}>
                        {shapefileHasBlockingIssues
                          ? 'Bloquea promoción'
                          : shapefilePreview.validationSummary.invalidRows > 0
                            ? 'Requiere revisión'
                            : 'Listo para promoción'}
                      </StatPill>
                    </div>
                    <DetailList
                      items={[
                        { label: 'Archivo', value: shapefilePreview.fileName },
                        {
                          label: 'Modo',
                          value:
                            shapefilePreview.importMode === 'project-linked'
                              ? 'Ligada a proyecto'
                              : 'Capa de referencia',
                        },
                        { label: 'Elementos', value: String(shapefilePreview.featureCount) },
                        { label: 'Geometría', value: shapefilePreview.geometryType },
                        { label: 'CRS', value: shapefilePreview.crs },
                        {
                          label: 'País de validación',
                          value: shapefileCountry.trim() || 'Fallback del servicio',
                        },
                        {
                          label: 'País detectado',
                          value:
                            shapefilePreview.countries?.join(', ') ||
                            shapefilePreviewCountries.join(', ') ||
                            'No detectado en muestra',
                        },
                        {
                          label: 'Cobertura / bbox',
                          value: formatPreviewBbox(shapefilePreview.bbox),
                        },
                        {
                          label: 'Niveles territoriales',
                          value:
                            shapefilePreview.territoryLevels?.join(', ') || 'No detectados',
                        },
                        {
                          label: 'Filas fuera del bbox nacional',
                          value: String(
                            shapefilePreview.geographicSummary?.outsideNationalBoundsRows ?? 0,
                          ),
                        },
                        {
                          label: 'BBox nacional configurado',
                          value: formatPreviewBbox(
                            shapefilePreview.geographicSummary?.configuredNationalBBox,
                          ),
                        },
                        {
                          label: 'Filas válidas',
                          value: String(shapefilePreview.validationSummary.validRows),
                        },
                        {
                          label: 'Filas inválidas',
                          value: String(shapefilePreview.validationSummary.invalidRows),
                        },
                      ]}
                    />
                    <div style={heroNoteStyle}>
                      Columnas detectadas: {shapefilePreview.detectedColumns.join(', ') || 'n/a'}
                    </div>
                    {shapefilePreview.validationIssues.length > 0 ? (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {shapefilePreview.validationIssues.slice(0, 4).map((issue) => (
                          <article
                            key={`${issue.rowNumber}-${issue.code}-${issue.message}`}
                            style={{
                              border:
                                issue.severity === 'error'
                                  ? '1px solid #f3d6d4'
                                  : '1px solid #fcd6a4',
                              borderRadius: 10,
                              padding: 10,
                              background: issue.severity === 'error' ? '#fff4f3' : '#fff7ed',
                              display: 'grid',
                              gap: 4,
                            }}
                          >
                            <strong
                              style={{
                                color: issue.severity === 'error' ? '#b42318' : '#b45309',
                                fontSize: 13,
                              }}
                            >
                              fila {issue.rowNumber} · {issue.code}
                            </strong>
                            <span
                              style={{
                                color: issue.severity === 'error' ? '#7a271a' : '#92400e',
                                fontSize: 13,
                              }}
                            >
                              {issue.message}
                            </span>
                            <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                              {getShapefileIssueGuidance(issue.code)}
                            </span>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Panel>

            <Panel
              title="Publicación por proyecto"
              subtitle="Expone proyectos públicos publicados como capas dedicadas en GeoServer."
              action={<StatPill tone="good">{model.workbench.projectPublications.length} proyectos</StatPill>}
              icon="publication"
              tone="good"
            >
              {!canReadProjects ? (
                <MessageBlock tone="danger" icon="alert">
                  Tu perfil no tiene permiso para consultar proyectos del catálogo geoespacial.
                </MessageBlock>
              ) : null}
              <div style={{ display: 'grid', gap: 12 }}>
                {canReadProjects ? model.workbench.projectPublications.map((project) => (
                  <article key={project.id} style={entryCardStyle}>
                    <div style={entryHeaderStyle}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <strong style={{ color: '#10233f' }}>{project.title}</strong>
                        <span style={metaStyle}>{project.code}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <StatPill tone={project.publishedInGeoServer ? 'good' : 'neutral'}>
                          {project.publishedInGeoServer ? 'Publicado' : 'Pendiente'}
                        </StatPill>
                      </div>
                    </div>
                    <DetailList
                      items={[
                        { label: 'Visibilidad', value: project.visibility },
                        { label: 'Estado', value: project.status },
                        { label: 'Vista', value: project.nativeViewName },
                        { label: 'Capa', value: project.geoserverLayerName },
                      ]}
                    />
                    {!project.publicationEligible ? (
                      <div style={warningNoteStyle}>
                        {project.publicationEligibilityReason ?? 'Proyecto no elegible para publicación.'}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={publishButtonStyle}
                        disabled={
                          !canPublishOutputs ||
                          !project.publicationEligible ||
                          publishingProjectId === project.id
                        }
                        onClick={() => void publishProject(project)}
                      >
                        {publishingProjectId === project.id
                          ? 'Publicando...'
                          : project.publishedInGeoServer
                            ? 'Republicar proyecto'
                            : 'Publicar proyecto'}
                      </button>
                      <button
                        type="button"
                        style={endpointButtonStyle}
                        onClick={() => void copyText(project.nativeViewName, 'vista del proyecto')}
                      >
                        Copiar vista
                      </button>
                    </div>
                  </article>
                )) : null}
              </div>
            </Panel>
          </PanelGrid>

          <div style={{ height: 18 }} />

          <Panel
            title="Inventario de capas"
            subtitle="Catálogo maestro de capas SIGI, listo para exportación y publicación."
            action={<StatPill tone="good">{model.entries.length} entradas</StatPill>}
            icon="map"
            tone="neutral"
          >
            <div style={{ display: 'grid', gap: 12 }}>
              {model.entries.map((entry) => (
                <article key={entry.id} style={entryCardStyle}>
                  <div style={entryHeaderStyle}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <strong style={{ color: '#10233f' }}>{entry.title}</strong>
                      <span style={metaStyle}>
                        {entry.code} · {entry.layerType}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <StatPill tone={entry.publishedInGeoServer ? 'good' : 'neutral'}>
                        {entry.publishedInGeoServer ? 'Publicado' : 'No publicado'}
                      </StatPill>
                      <StatPill tone={entry.sourceMode === 'derived' ? 'warn' : 'neutral'}>
                        {entry.sourceMode === 'derived' ? 'Derivada' : 'Gestionada'}
                      </StatPill>
                    </div>
                  </div>

                  <DetailList
                    items={[
                      { label: 'Visibilidad', value: entry.visibility },
                      { label: 'Estado', value: entry.status },
                      { label: 'Elementos', value: String(entry.featureCount) },
                      { label: 'Área', value: `${entry.totalAreaHa.toLocaleString('es-CR')} ha` },
                      { label: 'Espacio de trabajo', value: entry.geoserverWorkspace ?? 'No detectado' },
                      { label: 'Vista nativa', value: entry.nativeViewName ?? 'n/a' },
                    ]}
                  />

                  <div style={{ color: '#5f6b7a', fontSize: 13 }}>{entry.notes}</div>

                  {!entry.publicationEligible ? (
                    <div style={warningNoteStyle}>
                      {entry.publicationEligibilityReason ?? 'La capa no es elegible para publicación.'}
                    </div>
                  ) : null}

                  {entry.geoserverLayerName ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => void publishLayer(entry)}
                        style={publishButtonStyle}
                        disabled={
                          !canPublishOutputs ||
                          publishingCode === entry.code ||
                          !entry.publicationEligible
                        }
                      >
                        {publishingCode === entry.code
                          ? 'Publicando...'
                          : entry.publishedInGeoServer
                            ? 'Republicar en GeoServer'
                            : 'Publicar en GeoServer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void exportLayer(entry)}
                        style={endpointButtonStyle}
                        disabled={exportingCode === entry.code}
                      >
                        {exportingCode === entry.code ? 'Exportando...' : 'Descargar GeoJSON'}
                      </button>
                      <a
                        href={buildWmsUrl(entry.geoserverLayerName)}
                        target="_blank"
                        rel="noreferrer"
                        style={endpointLinkStyle}
                      >
                        Preview WMS
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          void copyText(
                            buildWmsUrl(entry.geoserverLayerName ?? ''),
                            `WMS de ${entry.title}`,
                          )
                        }
                        style={endpointButtonStyle}
                      >
                        Copiar WMS
                      </button>
                      <a
                        href={buildWfsUrl(entry.geoserverLayerName)}
                        target="_blank"
                        rel="noreferrer"
                        style={endpointLinkStyle}
                      >
                        Preview WFS
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          void copyText(
                            buildWfsUrl(entry.geoserverLayerName ?? ''),
                            `WFS de ${entry.title}`,
                          )
                        }
                        style={endpointButtonStyle}
                      >
                        Copiar WFS
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteLayer(entry)}
                        style={dangerButtonStyle}
                        disabled={
                          !canPublishOutputs ||
                          deletingCode === entry.code ||
                          entry.publishedInGeoServer ||
                          ['territories', 'project_polygons', 'project_centroids', 'dnea_activity_points', 'odoo_project_territories'].includes(entry.code)
                        }
                      >
                        {deletingCode === entry.code ? 'Eliminando...' : 'Eliminar capa'}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </Panel>
        </>
      ) : null}
    </section>
  );
}

const heroNoteStyle = {
  borderRadius: 18,
  padding: 16,
  background: '#f8fbff',
  border: '1px solid #d7dde5',
  color: '#475569',
  fontSize: 14,
  lineHeight: 1.65,
};

const entryCardStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 18,
  padding: 16,
  display: 'grid',
  gap: 12,
  background: 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(245,247,251,1) 100%)',
};

const entryHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
};

const metaStyle = {
  color: '#5f6b7a',
  fontSize: 13,
};

const endpointLinkStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '8px 12px',
  background: '#ffffff',
  color: '#14532d',
  fontWeight: 700,
  fontSize: 12,
  textDecoration: 'none',
};

const endpointButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '8px 12px',
  background: '#f8fbff',
  color: '#10233f',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
};

const publishButtonStyle = {
  border: '1px solid #14532d',
  borderRadius: 999,
  padding: '8px 12px',
  background: '#14532d',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
};

const warningNoteStyle = {
  borderRadius: 12,
  padding: '10px 12px',
  background: '#fff8e6',
  border: '1px solid #f3d38a',
  color: '#7c5a12',
  fontSize: 13,
};

const fieldStyle = {
  display: 'grid',
  gap: 6,
  color: '#10233f',
  fontSize: 13,
};

const formGridStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
};

const codeStyle = {
  display: 'block',
  marginTop: 8,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
  color: '#10233f',
};

const textareaStyle = {
  borderRadius: 12,
  border: '1px solid #d7dde5',
  padding: 10,
  fontFamily: 'monospace',
  fontSize: 12,
};

const dangerButtonStyle = {
  border: '1px solid #b42318',
  borderRadius: 999,
  padding: '8px 12px',
  background: '#fff5f4',
  color: '#b42318',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
};

function buildGeoJsonPreview(payload: Record<string, unknown>): GeoJsonPreviewState {
  const kind =
    payload.type === 'FeatureCollection'
      ? 'FeatureCollection'
      : payload.type === 'Feature'
        ? 'Feature'
        : null;

  if (!kind) {
    throw new Error('El GeoJSON debe ser tipo FeatureCollection o Feature.');
  }

  const features =
    kind === 'FeatureCollection'
      ? Array.isArray(payload.features)
        ? payload.features
        : []
      : [payload];

  if (features.length === 0) {
    throw new Error('El GeoJSON no contiene features importables.');
  }

  const geometryTypes = new Set<string>();
  const propertyKeys = new Set<string>();
  let polygonFeatures = 0;
  let nonPolygonFeatures = 0;

  features.forEach((feature, index) => {
    if (!feature || typeof feature !== 'object') {
      throw new Error(`La feature ${index + 1} no tiene una estructura válida.`);
    }
    const geometry = (feature as { geometry?: { type?: unknown } }).geometry;
    const geometryType =
      geometry && typeof geometry === 'object' && typeof geometry.type === 'string'
        ? geometry.type
        : 'Sin geometría';
    geometryTypes.add(geometryType);

    if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
      polygonFeatures += 1;
    } else {
      nonPolygonFeatures += 1;
    }

    const properties = (feature as { properties?: unknown }).properties;
    if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
      Object.keys(properties)
        .slice(0, 12)
        .forEach((key) => propertyKeys.add(key));
    }
  });

  const warnings: string[] = [];
  if (nonPolygonFeatures > 0) {
    warnings.push(
      `Se detectaron ${nonPolygonFeatures} geometría(s) no soportada(s) en esta fase. Solo Polygon/MultiPolygon son válidas.`,
    );
  }
  if (propertyKeys.size === 0) {
    warnings.push('No se detectaron propiedades en las features; revisa código, nombre y atributos territoriales.');
  }

  return {
    kind,
    featureCount: features.length,
    geometryTypes: [...geometryTypes],
    polygonFeatures,
    nonPolygonFeatures,
    samplePropertyKeys: [...propertyKeys],
    warnings,
  };
}
