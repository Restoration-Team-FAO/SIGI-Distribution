import { useEffect, useState } from 'react';
import type { Publication } from '@sigi/domain';
import { workspaceApi } from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { hasPermission } from '../utils/permissions';
import { AdministrationWorkspaceHeader } from '../components/AdministrationWorkspaceHeader';
import { DataTable, StatusBadge } from '../components/data-display';
import {
  MessageBlock,
  MetricCard,
  MetricGrid,
  PageLead,
  Panel,
  StatPill,
} from '../components/section-kit';

function getPublicationTone(
  status: Publication['status'],
): 'neutral' | 'good' | 'warn' | 'danger' {
  if (status === 'published') {
    return 'good';
  }

  if (status === 'queued') {
    return 'warn';
  }

  if (status === 'failed') {
    return 'danger';
  }

  return 'neutral';
}

export function PublicationsPage() {
  const { currentUser, globalViewScope } = useEgi();
  const canReadPublications = hasPermission(currentUser, 'publications.read');
  const [publications, setPublications] = useState<Publication[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canReadPublications) {
      setPublications([]);
      return;
    }
    workspaceApi
      .getPublications(globalViewScope)
      .then((response) => setPublications(response.data.publications))
      .catch((reason: Error) => setError(reason.message));
  }, [canReadPublications, globalViewScope]);

  const publishedPublications = publications.filter(
    (publication) => publication.status === 'published',
  );
  const queuedPublications = publications.filter(
    (publication) => publication.status === 'queued',
  );
  const failedPublications = publications.filter(
    (publication) => publication.status === 'failed',
  );

  return (
    <section>
      <AdministrationWorkspaceHeader description="Canales, colas y salidas del EGI activo." />
      <PageLead
        eyebrow="Publicación"
        title="Salidas y canales de publicación"
        description="Estado de publicaciones y destinos."
        icon="publication"
      />

      {error ? <MessageBlock tone="danger" icon="alert">{error}</MessageBlock> : null}
      {!canReadPublications ? (
        <MessageBlock tone="danger" icon="alert">
          Tu sesión no tiene permiso para consultar publicaciones desde esta consola.
        </MessageBlock>
      ) : null}

      {!error && canReadPublications && publications.length === 0 ? (
        <MessageBlock icon="publication">Cargando publicaciones registradas en el entorno...</MessageBlock>
      ) : null}

      {canReadPublications && publications.length > 0 ? (
        <>
          <MetricGrid>
            <MetricCard
              label="Salidas registradas"
              value={String(publications.length)}
              hint="Publicaciones visibles desde el backend."
              icon="publication"
              tone="neutral"
            />
            <MetricCard
              label="Publicadas"
              value={String(publishedPublications.length)}
              hint="Ya visibles o entregadas al destino objetivo."
              icon="status"
              tone="good"
            />
            <MetricCard
              label="En cola"
              value={String(queuedPublications.length)}
              hint="Pendientes de procesamiento o confirmación."
              icon="flow"
              tone="warn"
            />
            <MetricCard
              label="Con fallo"
              value={String(failedPublications.length)}
              hint="Requieren atención antes de reintentar."
              icon="alert"
              tone={failedPublications.length > 0 ? 'danger' : 'neutral'}
            />
          </MetricGrid>

            <Panel
              title="Canales publicados"
              subtitle="Estado por salida y por destino operativo."
              action={<StatPill tone="good">{publishedPublications.length} publicadas</StatPill>}
              icon="publication"
              tone="good"
            >
              <DataTable rows={publications} rowKey={(publication) => publication.id} empty="No hay publicaciones configuradas." columns={[
                { id: 'target', header: 'Destino', cell: (publication) => <strong>{publication.target}</strong>, sortValue: (publication) => publication.target },
                { id: 'dataset', header: 'Dataset asociado', cell: (publication) => publication.datasetId ?? 'Sin dataset visible' },
                { id: 'updated', header: 'Actualización', cell: (publication) => publication.updatedAt ? new Date(publication.updatedAt).toLocaleString('es-CR') : 'Sin fecha', sortValue: (publication) => publication.updatedAt },
                { id: 'status', header: 'Estado', cell: (publication) => <StatusBadge status={publication.status} tone={getPublicationTone(publication.status)} /> },
              ]} />
            </Panel>
        </>
      ) : null}
    </section>
  );
}
