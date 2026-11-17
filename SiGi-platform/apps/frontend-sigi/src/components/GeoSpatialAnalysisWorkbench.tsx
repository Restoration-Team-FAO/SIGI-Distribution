import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GeoFeature, GeoLayer, GeoLayerIntersectionResult } from '@sigi/domain';
import { workspaceApi } from '../services/api';
import { MultiLayerMap, type MultiLayerMapEntry } from './MultiLayerMap';
import { MessageBlock } from './section-kit';

type Props = {
  layers: GeoLayer[];
  canUploadImports: boolean;
};

type LayerContext = {
  source: Awaited<ReturnType<typeof workspaceApi.getGeoLayerFeatures>>['data']['featureCollection'];
  target: Awaited<ReturnType<typeof workspaceApi.getGeoLayerFeatures>>['data']['featureCollection'];
};

function formatNumber(value: number, maximumFractionDigits = 0) {
  return value.toLocaleString('es-CR', { maximumFractionDigits });
}

function geometryFamily(layer: GeoLayer) {
  const value = layer.geometryType?.toLowerCase() ?? '';
  if (value.includes('point')) return 'Puntos';
  if (value.includes('line')) return 'Líneas';
  if (value.includes('polygon')) return 'Polígonos';
  return layer.geometryType || 'Mixta';
}

export function GeoSpatialAnalysisWorkbench({ layers, canUploadImports }: Props) {
  const eligibleLayers = useMemo(
    () => layers.filter((layer) => layer.status === 'published' || layer.status === 'active'),
    [layers],
  );
  const [sourceCode, setSourceCode] = useState(eligibleLayers[0]?.code ?? '');
  const [targetCode, setTargetCode] = useState(eligibleLayers[1]?.code ?? '');
  const [result, setResult] = useState<GeoLayerIntersectionResult | null>(null);
  const [context, setContext] = useState<LayerContext | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<GeoFeature | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceLayer = eligibleLayers.find((layer) => layer.code === sourceCode) ?? null;
  const targetLayer = eligibleLayers.find((layer) => layer.code === targetCode) ?? null;

  useEffect(() => {
    if (!sourceCode && eligibleLayers[0]) setSourceCode(eligibleLayers[0].code);
    if (!targetCode && eligibleLayers[1]) setTargetCode(eligibleLayers[1].code);
  }, [eligibleLayers, sourceCode, targetCode]);

  async function runIntersection() {
    if (!sourceCode || !targetCode || sourceCode === targetCode) {
      setError('Selecciona dos capas diferentes para ejecutar el cruce espacial.');
      return;
    }
    setRunning(true);
    setError(null);
    setSelectedMatch(null);
    try {
      const [analysis, sourceFeatures, targetFeatures] = await Promise.all([
        workspaceApi.intersectGeoLayers(sourceCode, targetCode),
        workspaceApi.getGeoLayerFeatures(sourceCode, { zoom: 9, pageSize: 500 }),
        workspaceApi.getGeoLayerFeatures(targetCode, { zoom: 9, pageSize: 500 }),
      ]);
      setResult(analysis.data.result);
      setContext({
        source: sourceFeatures.data.featureCollection,
        target: targetFeatures.data.featureCollection,
      });
    } catch (reason) {
      setResult(null);
      setContext(null);
      setError(reason instanceof Error ? reason.message : 'No se pudo ejecutar el análisis espacial.');
    } finally {
      setRunning(false);
    }
  }

  const mapLayers = useMemo<MultiLayerMapEntry[]>(() => {
    if (!result) return [];
    return [
      ...(context
        ? [
            { code: sourceCode, name: result.sourceLayer.name, color: '#2563eb', opacity: 0.12, featureCollection: context.source },
            { code: targetCode, name: result.targetLayer.name, color: '#f59e0b', opacity: 0.12, featureCollection: context.target },
          ]
        : []),
      {
        code: 'analysis-intersection',
        name: 'Resultado del cruce',
        color: '#be123c',
        opacity: 0.7,
        featureCollection: result.featureCollection,
      },
    ];
  }, [context, result, sourceCode, targetCode]);

  return (
    <section className="gis-analysis" aria-labelledby="gis-analysis-title">
      <header className="gis-analysis__header">
        <div>
          <span className="gis-analysis__eyebrow">Caja de herramientas espacial</span>
          <h2 id="gis-analysis-title">Cruce de capas y estadísticas</h2>
          <p>Interseca dos capas autorizadas en PostGIS, cuantifica cobertura y revisa el resultado directamente en el mapa.</p>
        </div>
        <span className="gis-analysis__engine">PostGIS · EPSG:4326</span>
      </header>

      <div className="gis-analysis__layout">
        <aside className="gis-analysis__tools" aria-label="Parámetros del análisis">
          <div className="gis-analysis__tool-title">
            <span>01</span>
            <div><strong>Intersección</strong><small>Capa A ∩ Capa B</small></div>
          </div>

          <label>
            <span>Capa de entrada</span>
            <select value={sourceCode} onChange={(event) => { setSourceCode(event.target.value); setResult(null); }}>
              <option value="">Seleccionar capa</option>
              {eligibleLayers.map((layer) => <option key={layer.code} value={layer.code}>{layer.name}</option>)}
            </select>
            {sourceLayer ? <small>{geometryFamily(sourceLayer)} · {sourceLayer.crs} · {sourceLayer.visibility}</small> : null}
          </label>

          <div className="gis-analysis__operator" aria-hidden="true">∩</div>

          <label>
            <span>Capa de superposición</span>
            <select value={targetCode} onChange={(event) => { setTargetCode(event.target.value); setResult(null); }}>
              <option value="">Seleccionar capa</option>
              {eligibleLayers.filter((layer) => layer.code !== sourceCode).map((layer) => <option key={layer.code} value={layer.code}>{layer.name}</option>)}
            </select>
            {targetLayer ? <small>{geometryFamily(targetLayer)} · {targetLayer.crs} · {targetLayer.visibility}</small> : null}
          </label>

          <button className="gis-analysis__run" type="button" onClick={() => void runIntersection()} disabled={running || !sourceCode || !targetCode}>
            {running ? 'Procesando en PostGIS…' : 'Ejecutar cruce espacial'}
          </button>
          <p className="gis-analysis__privacy">Solo se consultan capas visibles para tu perfil. El análisis es de solo lectura y no modifica los datos fuente.</p>

          <div className="gis-analysis__shapefile">
            <div className="gis-analysis__tool-title">
              <span>02</span>
              <div><strong>Incorporar datos</strong><small>Shapefile / GeoJSON</small></div>
            </div>
            <p>Un Shapefile ZIP puede validarse, reproyectarse, cargarse a PostGIS y luego usarse como cualquiera de las capas del cruce.</p>
            <ul>
              <li>Preview de geometrías, atributos, CRS y extensión.</li>
              <li>Control de filas inválidas y límites geográficos.</li>
              <li>Publicación posterior en GeoServer y exportación.</li>
            </ul>
            {canUploadImports ? (
              <Link to="/admin/geospatial-catalog" className="gis-analysis__secondary-action">Importar Shapefile ZIP</Link>
            ) : (
              <small>Requiere el permiso de carga de importaciones.</small>
            )}
          </div>
        </aside>

        <main className="gis-analysis__result">
          {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
          {result ? (
            <>
              <div className="gis-analysis__metrics" aria-label="Estadísticas del cruce">
                <article><span>Coincidencias</span><strong>{formatNumber(result.summary.pairCount)}</strong><small>pares espaciales</small></article>
                <article><span>Entrada afectada</span><strong>{formatNumber(result.summary.intersectingSourceCount)} / {formatNumber(result.summary.sourceFeatureCount)}</strong><small>elementos</small></article>
                <article><span>Superposición afectada</span><strong>{formatNumber(result.summary.intersectingTargetCount)} / {formatNumber(result.summary.targetFeatureCount)}</strong><small>elementos</small></article>
                <article><span>Área intersectada</span><strong>{formatNumber(result.summary.intersectionAreaHa, 2)} ha</strong><small>área geométrica</small></article>
              </div>

              <div className="gis-analysis__map-shell">
                <div className="gis-analysis__legend">
                  <span><i style={{ background: '#2563eb' }} />{result.sourceLayer.name}</span>
                  <span><i style={{ background: '#f59e0b' }} />{result.targetLayer.name}</span>
                  <span><i style={{ background: '#be123c' }} />Intersección</span>
                </div>
                <MultiLayerMap
                  layers={mapLayers}
                  emptyMessage="El cruce no produjo geometrías visibles."
                  onFeatureClick={({ feature }) => setSelectedMatch(feature)}
                />
              </div>

              <div className="gis-analysis__table-wrap">
                <div className="gis-analysis__table-heading">
                  <div><strong>Tabla de resultados</strong><small>{result.matches.length} filas cargadas{result.truncated ? ' · resultado limitado para visualización' : ''}</small></div>
                  {selectedMatch ? <span>Selección: {String(selectedMatch.properties.name ?? '')}</span> : null}
                </div>
                {result.matches.length > 0 ? (
                  <table className="gis-analysis__table">
                    <thead><tr><th>Elemento de entrada</th><th>Elemento superpuesto</th><th>Área intersectada</th></tr></thead>
                    <tbody>{result.matches.slice(0, 50).map((match, index) => (
                      <tr key={`${match.sourceCode}-${match.targetCode}-${index}`}>
                        <td><strong>{match.sourceName}</strong><small>{match.sourceCode}</small></td>
                        <td><strong>{match.targetName}</strong><small>{match.targetCode}</small></td>
                        <td>{formatNumber(match.intersectionAreaHa, 3)} ha</td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : <MessageBlock>Las capas no tienen elementos que se intersecten.</MessageBlock>}
              </div>
            </>
          ) : (
            <div className="gis-analysis__empty">
              <span>∩</span>
              <h3>Configura un análisis espacial</h3>
              <p>Selecciona una capa de entrada y una capa de superposición. SIGI calculará coincidencias, entidades afectadas, área y geometrías resultantes.</p>
              <div><b>Ejemplos</b><span>Proyectos × áreas protegidas</span><span>Fincas × cuencas</span><span>Puntos de campo × límites administrativos</span></div>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}
