import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { User, ValidationResult } from '@sigi/domain';
import { workspaceApi } from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { canUseGlobalView } from '../utils/global-view';
import {
  DetailList,
  MessageBlock,
  MetricCard,
  MetricGrid,
  Panel,
  StatPill,
} from '../components/section-kit';
import { DataWorkspaceHeader } from '../components/DataWorkspaceHeader';
import { DataTable, StatusBadge } from '../components/data-display';

type ValidationViewModel = ValidationResult & {
  assigneeName: string | null;
  assigneeRole: string | null;
};

function getValidationTone(
  status: ValidationResult['status'],
): 'good' | 'warn' | 'danger' {
  if (status === 'passed') {
    return 'good';
  }

  if (status === 'warning') {
    return 'warn';
  }

  return 'danger';
}

function getValidationSignal(validation: ValidationViewModel): string {
  if (validation.status === 'failed') {
    return 'requiere correccion';
  }

  if (validation.status === 'warning') {
    return 'requiere seguimiento';
  }

  return 'cumple';
}

function getValidationStatusLabel(status: ValidationResult['status']): string {
  return (
    {
      passed: 'Aprobado',
      warning: 'Advertencia',
      failed: 'Fallo',
    }[status] ?? status
  );
}
function formatTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return 'Sin fecha visible';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString('es-CR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function getUserById(users: User[], userId?: string | null): User | null {
  if (!userId) {
    return null;
  }

  return users.find((user) => user.id === userId) ?? null;
}

export function ValidationsPage() {
  const [searchParams] = useSearchParams();
  const { activeEgi, activeEgiId, currentUser, globalViewScope, setGlobalViewScope } = useEgi();
  const allowGlobalView = canUseGlobalView(currentUser);
  const [validations, setValidations] = useState<ValidationViewModel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([workspaceApi.getValidations(globalViewScope), workspaceApi.getUsers()])
      .then(([validationsResponse, usersResponse]) => {
        const users = usersResponse.data.users;
        setValidations(
          validationsResponse.data.validations.map((validation) => {
            const assignee = getUserById(users, validation.assignedToUserId);
            return {
              ...validation,
              assigneeName: assignee?.displayName ?? null,
              assigneeRole: assignee?.roles?.[0] ?? null,
            };
          }),
        );
      })
      .catch((reason: Error) => setError(reason.message));
  }, [allowGlobalView, globalViewScope]);

  const passedValidations = validations.filter((validation) => validation.status === 'passed');
  const warningValidations = validations.filter((validation) => validation.status === 'warning');
  const failedValidations = validations.filter((validation) => validation.status === 'failed');
  const assignedCases = validations.filter((validation) => validation.assigneeName);
  const tracedCases = validations.filter((validation) => validation.updatedAt);
  const requestedStatus = searchParams.get('status');
  const visibleValidations = requestedStatus === 'pending'
    ? validations.filter((validation) => validation.status !== 'passed')
    : requestedStatus && ['passed', 'warning', 'failed'].includes(requestedStatus)
      ? validations.filter((validation) => validation.status === requestedStatus)
      : validations;

  return (
    <section>
      <DataWorkspaceHeader
        description="Calidad y trazabilidad técnica de los datos del EGI, con casos, responsables y señales operativas."
        primaryAction={<Link className="sigi-module-header__configuration" to="/quality">Vista pública</Link>}
      />

      {allowGlobalView ? (
        <div className="sigi-scope-switcher sigi-scope-switcher--tabs">
          <button
            type="button"
            onClick={() => setGlobalViewScope('active')}
            className={globalViewScope === 'active' ? 'is-active' : ''}
          >
            EGI activo
          </button>
          <button
            type="button"
            onClick={() => setGlobalViewScope('global')}
            className={globalViewScope === 'global' ? 'is-active' : ''}
          >
            Vista global
          </button>
          <span>
            {globalViewScope === 'active'
              ? 'La bandeja muestra solo reglas del EGI seleccionado.'
              : 'La bandeja intenta consolidar validaciones entre EGI cuando el backend autoriza modo global.'}
          </span>
        </div>
      ) : null}

      <Panel
        title="Contexto EGI"
        subtitle="La bandeja de reglas y casos técnicos responde al EGI activo; solo un modo global explícito debe consolidar resultados entre espacios."
        action={
          <StatPill tone={activeEgiId ? 'good' : 'warn'}>
            {globalViewScope === 'global' ? 'Vista global' : 'EGI activo'}
          </StatPill>
        }
      >
        <DetailList
          items={[
            { label: 'EGI activo', value: activeEgi?.name ?? 'Sin EGI seleccionado' },
            { label: 'Código', value: activeEgi?.code ?? 'n/d' },
            {
              label: 'Alcance',
              value:
                globalViewScope === 'global'
                  ? 'Consolidado global autorizado'
                  : 'Validación del EGI activo',
            },
          ]}
        />
      </Panel>

      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}

      {!error && validations.length === 0 ? (
        <MessageBlock>Cargando resultados de validacion disponibles...</MessageBlock>
      ) : null}

      {validations.length > 0 ? (
        <>
          <div
            style={{
              display: 'grid',
              gap: 18,
              gridTemplateColumns: 'minmax(0, 1.45fr) minmax(280px, 0.95fr)',
              marginBottom: 20,
            }}
          >
            <section
              style={{
                borderRadius: 28,
                padding: 24,
                border: '1px solid #d7dde5',
                background:
                  'radial-gradient(circle at top left, rgba(20, 83, 45, 0.16), transparent 38%), linear-gradient(135deg, #10233f 0%, #183b5a 56%, #14532d 100%)',
                color: '#f8fbff',
                boxShadow: '0 22px 48px rgba(16, 35, 63, 0.16)',
              }}
            >
              <div style={{ display: 'grid', gap: 14 }}>
                <StatPill tone={failedValidations.length > 0 ? 'warn' : 'good'}>
                  {failedValidations.length > 0 ? 'Con atención' : 'Estable'}
                </StatPill>
                <h3 style={{ margin: 0, fontSize: 30, lineHeight: 1.12 }}>
                  La validación técnica ya tiene una lectura operativa de casos, asignaciones y
                  trazabilidad sobre el corte actual.
                </h3>
                <p style={{ margin: 0, color: 'rgba(248, 251, 255, 0.82)', maxWidth: 760 }}>
                  Esta vista muestra cuántas reglas pasan, cuántas requieren seguimiento y qué
                  casos ya tienen responsable visible en el ciclo de calidad.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    marginTop: 8,
                  }}
                >
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background: 'rgba(255,255,255,0.08)',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <strong style={{ fontSize: 28 }}>{validations.length}</strong>
                    <span style={{ color: 'rgba(248, 251, 255, 0.72)', fontSize: 13 }}>
                      casos visibles
                    </span>
                  </div>
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background: 'rgba(255,255,255,0.08)',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <strong style={{ fontSize: 28 }}>{assignedCases.length}</strong>
                    <span style={{ color: 'rgba(248, 251, 255, 0.72)', fontSize: 13 }}>
                      con responsable
                    </span>
                  </div>
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background: 'rgba(255,255,255,0.08)',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <strong style={{ fontSize: 28 }}>{tracedCases.length}</strong>
                    <span style={{ color: 'rgba(248, 251, 255, 0.72)', fontSize: 13 }}>
                      con rastro de fecha
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <Panel
              title="Lectura rápida"
              subtitle="Resumen ejecutivo para seguimiento de calidad."
              action={
                <StatPill tone={failedValidations.length > 0 ? 'warn' : 'good'}>
                  {failedValidations.length > 0 ? 'Requiere atención' : 'Calidad estable'}
                </StatPill>
              }
            >
              <DetailList
                items={[
                  { label: 'Aprobados', value: String(passedValidations.length) },
                  { label: 'Advertencias', value: String(warningValidations.length) },
                  { label: 'Fallos', value: String(failedValidations.length) },
                  {
                    label: 'Casos asignados',
                    value: String(assignedCases.length),
                  },
                ]}
              />
            </Panel>
          </div>

          <MetricGrid>
            <MetricCard
              label="Resultados cargados"
              value={String(validations.length)}
              hint="Casos visibles desde el backend administrativo."
            />
            <MetricCard
              label="Aprobados"
              value={String(passedValidations.length)}
              hint="Sin observaciones bloqueantes."
            />
            <MetricCard
              label="Advertencias"
              value={String(warningValidations.length)}
              hint="Requieren seguimiento sin detener todo el flujo."
            />
            <MetricCard
              label="Fallos"
              value={String(failedValidations.length)}
              hint="Casos con impacto directo en publicación."
            />
          </MetricGrid>

          <Panel
              title="Casos de validación"
              subtitle={requestedStatus === 'pending' ? 'Bandeja filtrada por pendientes desde Inicio 360.' : 'Bandeja operativa para seguimiento técnico.'}
              action={
                <StatPill tone={failedValidations.length > 0 ? 'warn' : 'good'}>
                  {failedValidations.length > 0 ? 'Con pendientes' : 'Sin bloqueos'}
                </StatPill>
              }
            >
              <DataTable rows={visibleValidations} rowKey={(validation) => validation.id} empty="No hay casos que coincidan con el filtro de la URL." columns={[
                { id: 'rule', header: 'Regla', cell: (validation) => <div className="sigi-table-primary"><strong>{validation.ruleCode ?? 'Regla sin código'}</strong><span>{validation.message}</span></div>, sortValue: (validation) => validation.ruleCode },
                { id: 'assignee', header: 'Responsable', cell: (validation) => <div className="sigi-table-primary"><strong>{validation.assigneeName ?? 'Sin asignar'}</strong><span>{validation.assigneeRole ?? 'Sin rol visible'}</span></div>, sortValue: (validation) => validation.assigneeName },
                { id: 'dataset', header: 'Versión dataset', cell: (validation) => validation.datasetVersionId },
                { id: 'signal', header: 'Señal', cell: (validation) => getValidationSignal(validation) },
                { id: 'updated', header: 'Último rastro', cell: (validation) => formatTimestamp(validation.updatedAt ?? validation.createdAt), sortValue: (validation) => validation.updatedAt ?? validation.createdAt },
                { id: 'status', header: 'Estado', cell: (validation) => <StatusBadge status={validation.status} label={getValidationStatusLabel(validation.status)} tone={getValidationTone(validation.status)} /> },
              ]} />
            </Panel>
        </>
      ) : null}
    </section>
  );
}
