import { useMemo, useState, type FormEvent } from 'react';
import type { ProjectBudgetItem, ProjectDetail, ProjectRisk, ProjectTask } from '@sigi/domain';
import { workspaceApi } from '../services/api';
import { MessageBlock, MetricCard, MetricGrid, Panel, StatPill } from './section-kit';

type PlanningView = 'planning' | 'schedule' | 'budget' | 'risks';
type EditorState = { kind: 'task'; item?: ProjectTask } | { kind: 'budget'; item?: ProjectBudgetItem } | { kind: 'risk'; item?: ProjectRisk } | { kind: 'funding' } | { kind: 'version' } | { kind: 'movement' } | null;

export function ProjectPlanningWorkspace({ detail, view, canUpdate, canManageBudget = canUpdate, canManageFinance = canUpdate, onChanged }: { detail: ProjectDetail; view: PlanningView; canUpdate: boolean; canManageBudget?: boolean; canManageFinance?: boolean; onChanged: () => Promise<void> }) {
  const [editor, setEditor] = useState<EditorState>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taskSummary = useMemo(() => summarizeTasks(detail.tasks), [detail.tasks]);
  const riskSummary = useMemo(() => summarizeRisks(detail.risks), [detail.risks]);

  async function remove(kind: 'task' | 'budget' | 'risk', id: string, label: string) {
    if (!window.confirm(`Se eliminará “${label}”. ¿Deseas continuar?`)) return;
    setError(null);
    try {
      if (kind === 'task') await workspaceApi.deleteProjectTask(detail.project.id, id);
      if (kind === 'budget') await workspaceApi.deleteProjectBudgetItem(detail.project.id, id);
      if (kind === 'risk') await workspaceApi.deleteProjectRisk(detail.project.id, id);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      taskType: String(data.get('taskType')),
      code: String(data.get('code')).trim(),
      title: String(data.get('title')).trim(),
      description: String(data.get('description')).trim() || null,
      parentTaskId: String(data.get('parentTaskId') || '') || null,
      ownerActorId: String(data.get('ownerActorId') || '') || null,
      startDate: String(data.get('startDate') || '') || null,
      endDate: String(data.get('endDate') || '') || null,
      status: String(data.get('status')),
      progressPct: Number(data.get('progressPct')),
      weight: Number(data.get('weight')),
      sortOrder: Number(data.get('sortOrder')),
      predecessorIds: data.getAll('predecessorIds').map(String),
    };
    await persist(async () => editor?.kind === 'task' && editor.item
      ? workspaceApi.updateProjectTask(detail.project.id, editor.item.id, payload)
      : workspaceApi.createProjectTask(detail.project.id, payload));
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      taskId: String(data.get('taskId') || '') || null,
      code: String(data.get('code')).trim(),
      category: String(data.get('category')).trim(),
      name: String(data.get('name')).trim(),
      fundingSource: String(data.get('fundingSource')).trim() || null,
      currency: String(data.get('currency')).trim().toUpperCase(),
      plannedAmount: Number(data.get('plannedAmount')),
      notes: String(data.get('notes')).trim() || null,
    };
    await persist(async () => editor?.kind === 'budget' && editor.item
      ? workspaceApi.updateProjectBudgetItem(detail.project.id, editor.item.id, payload)
      : workspaceApi.createProjectBudgetItem(detail.project.id, payload));
  }

  async function saveRisk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      ownerActorId: String(data.get('ownerActorId') || '') || null,
      code: String(data.get('code')).trim(),
      title: String(data.get('title')).trim(),
      description: String(data.get('description')).trim() || null,
      category: String(data.get('category')).trim() || null,
      probability: Number(data.get('probability')),
      impact: Number(data.get('impact')),
      status: String(data.get('status')),
      responseStrategy: String(data.get('responseStrategy')),
      mitigation: String(data.get('mitigation')).trim() || null,
      reviewDate: String(data.get('reviewDate') || '') || null,
    };
    await persist(async () => editor?.kind === 'risk' && editor.item
      ? workspaceApi.updateProjectRisk(detail.project.id, editor.item.id, payload)
      : workspaceApi.createProjectRisk(detail.project.id, payload));
  }

  async function saveFunding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data=new FormData(event.currentTarget); await persist(()=>workspaceApi.createProjectFundingSource(detail.project.id,{code:String(data.get('code')),name:String(data.get('name')),sourceType:String(data.get('sourceType')),funder:String(data.get('funder'))||null,currency:String(data.get('currency')),approvedAmount:Number(data.get('approvedAmount')),receivedAmount:Number(data.get('receivedAmount')),validFrom:String(data.get('validFrom'))||null,validTo:String(data.get('validTo'))||null,restrictions:String(data.get('restrictions'))||null}));
  }
  async function saveVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data=new FormData(event.currentTarget); await persist(()=>workspaceApi.createProjectBudgetVersion(detail.project.id,{versionNumber:Number(data.get('versionNumber')),name:String(data.get('name')),reason:String(data.get('reason'))||null,effectiveDate:String(data.get('effectiveDate')),totalAmount:Number(data.get('totalAmount')),changeAmount:Number(data.get('changeAmount'))}));
  }
  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data=new FormData(event.currentTarget); await persist(()=>workspaceApi.createProjectFinancialMovement(detail.project.id,{budgetItemId:String(data.get('budgetItemId'))||null,fundingSourceId:String(data.get('fundingSourceId'))||null,taskId:String(data.get('taskId'))||null,movementType:String(data.get('movementType')),budgetEffect:String(data.get('budgetEffect')),movementDate:String(data.get('movementDate')),amount:Number(data.get('amount')),currency:String(data.get('currency')),exchangeRate:Number(data.get('exchangeRate')),supplierOrBeneficiary:String(data.get('supplierOrBeneficiary'))||null,concept:String(data.get('concept')),externalReference:String(data.get('externalReference'))||null,documentNumber:String(data.get('documentNumber'))||null,status:'approved'}));
  }

  async function persist(action: () => Promise<unknown>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      await onChanged();
      setEditor(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  return <div className="project-planning">
    {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
    {view === 'planning' ? <>
      <MetricGrid>
        <MetricCard label="Avance ponderado" value={`${taskSummary.progress}%`} hint="Calculado desde la estructura de trabajo" />
        <MetricCard label="Elementos del plan" value={String(detail.tasks.length)} hint={`${taskSummary.done} completados`} />
        <MetricCard label="En curso" value={String(taskSummary.inProgress)} hint={`${taskSummary.blocked} bloqueados`} />
        <MetricCard label="Sin responsable" value={String(taskSummary.unassigned)} hint="Requieren asignación" />
      </MetricGrid>
      <Panel title="Estructura de trabajo" subtitle="Descompón el proyecto en fases, actividades y tareas con responsables y dependencias." action={canUpdate ? <button className="reports-button reports-button--primary" type="button" onClick={() => setEditor({ kind: 'task' })}>Nueva actividad</button> : undefined}>
        <TaskTable tasks={detail.tasks} canUpdate={canUpdate} onEdit={(item) => setEditor({ kind: 'task', item })} onDelete={(item) => remove('task', item.id, item.title)} />
      </Panel>
    </> : null}

    {view === 'schedule' ? <>
      <MetricGrid>
        <MetricCard label="Inicio" value={taskSummary.startDate || 'Sin fecha'} hint="Primera actividad planificada" />
        <MetricCard label="Fin" value={taskSummary.endDate || 'Sin fecha'} hint="Última actividad planificada" />
        <MetricCard label="Duración" value={`${taskSummary.durationDays} días`} hint="Ventana del cronograma" />
        <MetricCard label="Vencidas" value={String(taskSummary.overdue)} hint="No completadas a la fecha" />
      </MetricGrid>
      <Panel title="Cronograma" subtitle="Vista temporal de fases, actividades, tareas y su avance." action={canUpdate ? <button className="reports-button reports-button--primary" type="button" onClick={() => setEditor({ kind: 'task' })}>Agregar al cronograma</button> : undefined}>
        <ProjectGantt tasks={detail.tasks} onEdit={canUpdate ? (item) => setEditor({ kind: 'task', item }) : undefined} />
      </Panel>
    </> : null}

    {view === 'budget' && detail.financialSettings.mode === 'none' ? <Panel title="Gestión financiera desactivada" subtitle="El proyecto conserva todas sus capacidades funcionales sin presupuesto."><MessageBlock>Este proyecto no utiliza seguimiento presupuestario en SIGI. No se calculan ceros, porcentajes ni alertas financieras.</MessageBlock></Panel> : null}
    {view === 'budget' && detail.financialSettings.mode === 'external' ? <>
      <MetricGrid>
        <MetricCard label="Presupuesto informado" value={nullableMoney(detail.financialSummary.currentBudget, detail.financialSummary.currency)} hint="Dato del sistema externo" />
        <MetricCard label="Comprometido informado" value={nullableMoney(detail.financialSummary.committed, detail.financialSummary.currency)} hint="No transaccional en SIGI" />
        <MetricCard label="Ejecutado informado" value={nullableMoney(detail.financialSummary.executed, detail.financialSummary.currency)} hint={detail.financialSummary.executionPct === null ? 'Sin porcentaje comparable' : `${detail.financialSummary.executionPct}%`} />
        <MetricCard label="Disponible informado" value={nullableMoney(detail.financialSummary.available, detail.financialSummary.currency)} hint={`Corte: ${detail.financialSettings.dataCutoffDate ?? 'sin fecha'}`} />
      </MetricGrid>
      <Panel title="Finanzas externas" subtitle="SIGI conserva el resumen y la trazabilidad de la fuente oficial, sin duplicar transacciones."><div className="external-finance-card"><strong>{detail.financialSettings.sourceSystem ?? 'Sistema externo no identificado'}</strong><span>Código: {detail.financialSettings.externalProjectCode ?? 'sin referencia'}</span><span>Fuente: {detail.financialSettings.dataSource ?? 'sin fuente documentada'}</span><span>Sincronización: {detail.financialSettings.syncStatus ?? 'sin estado'} · {detail.financialSettings.updateMethod ?? 'manual'}</span>{detail.financialSettings.externalUrl ? <a href={detail.financialSettings.externalUrl} target="_blank" rel="noreferrer">Abrir referencia externa ↗</a> : null}</div></Panel>
    </> : null}
    {view === 'budget' && (detail.financialSettings.mode === 'planning' || detail.financialSettings.mode === 'execution') ? <>
      <MetricGrid>
        <MetricCard label="Presupuesto inicial" value={nullableMoney(detail.financialSummary.initialBudget, detail.financialSummary.currency)} hint="Línea base aprobada" />
        <MetricCard label="Presupuesto vigente" value={nullableMoney(detail.financialSummary.currentBudget, detail.financialSummary.currency)} hint={`Variación: ${nullableMoney(detail.financialSummary.variance, detail.financialSummary.currency)}`} />
        <MetricCard label={detail.financialSettings.mode === 'execution' ? 'Comprometido' : 'Modo financiero'} value={detail.financialSettings.mode === 'execution' ? nullableMoney(detail.financialSummary.committed, detail.financialSummary.currency) : 'Solo planificación'} hint={detail.financialSettings.mode === 'execution' && detail.financialSummary.commitmentPct !== null ? `${detail.financialSummary.commitmentPct}% del vigente` : 'Sin operaciones de ejecución'} />
        <MetricCard label={detail.financialSettings.mode === 'execution' ? 'Ejecutado' : 'Fuentes'} value={detail.financialSettings.mode === 'execution' ? nullableMoney(detail.financialSummary.executed, detail.financialSummary.currency) : String(detail.fundingSources.length)} hint={detail.financialSettings.mode === 'execution' && detail.financialSummary.executionPct !== null ? `${detail.financialSummary.executionPct}% del vigente` : 'Financiamiento registrado'} />
      </MetricGrid>
      <div className="project-finance-actions">{canManageBudget ? <><button type="button" onClick={()=>setEditor({kind:'funding'})}>Nueva fuente</button><button type="button" onClick={()=>setEditor({kind:'version'})}>Nueva versión</button><button type="button" onClick={()=>setEditor({kind:'budget'})}>Nueva partida</button></> : null}{detail.financialSettings.mode==='execution'&&canManageFinance?<button type="button" className="is-primary" onClick={()=>setEditor({kind:'movement'})}>Registrar movimiento</button>:null}</div>
      <Panel title="Fuentes y versiones" subtitle="Origen de fondos y evolución aprobable del presupuesto."><FinanceSourcesAndVersions detail={detail} /></Panel>
      <Panel title="Presupuesto del proyecto" subtitle={detail.financialSettings.mode === 'execution' ? 'Control por partida; la ejecución se deriva de movimientos aprobados.' : 'Planificación por partida, sin operaciones de ejecución financiera.'} action={canManageBudget ? <button className="reports-button reports-button--primary" type="button" onClick={() => setEditor({ kind: 'budget' })}>Nueva partida</button> : undefined}>
        <BudgetTable detail={detail} canUpdate={canManageBudget} onEdit={(item) => setEditor({ kind: 'budget', item })} onDelete={(item) => remove('budget', item.id, item.name)} />
      </Panel>
      {detail.financialSettings.mode==='execution'?<Panel title="Movimientos financieros" subtitle="Compromisos, pagos, desembolsos y ajustes con trazabilidad."><FinancialMovementTable detail={detail} /></Panel>:null}
    </> : null}

    {view === 'risks' ? <>
      <MetricGrid>
        <MetricCard label="Riesgos abiertos" value={String(riskSummary.open)} hint="Requieren seguimiento" />
        <MetricCard label="Críticos" value={String(riskSummary.critical)} hint="Puntaje de 15 a 25" />
        <MetricCard label="Sin mitigación" value={String(riskSummary.withoutMitigation)} hint="Sin respuesta documentada" />
        <MetricCard label="Próxima revisión" value={riskSummary.nextReview || 'Sin fecha'} hint="Fecha más cercana" />
      </MetricGrid>
      <div className="project-risk-layout">
        <Panel title="Matriz de riesgos" subtitle="Probabilidad × impacto"><RiskMatrix risks={detail.risks} /></Panel>
        <Panel title="Registro de riesgos" subtitle="Tratamiento, responsables y fechas de revisión." action={canUpdate ? <button className="reports-button reports-button--primary" type="button" onClick={() => setEditor({ kind: 'risk' })}>Nuevo riesgo</button> : undefined}>
          <RiskList risks={detail.risks} canUpdate={canUpdate} onEdit={(item) => setEditor({ kind: 'risk', item })} onDelete={(item) => remove('risk', item.id, item.title)} />
        </Panel>
      </div>
    </> : null}

    {editor?.kind === 'task' ? <PlanningEditor title={editor.item ? 'Editar elemento del plan' : 'Nuevo elemento del plan'} onClose={() => setEditor(null)}><TaskForm item={editor.item} detail={detail} saving={saving} onSubmit={saveTask} /></PlanningEditor> : null}
    {editor?.kind === 'budget' ? <PlanningEditor title={editor.item ? 'Editar partida' : 'Nueva partida presupuestaria'} onClose={() => setEditor(null)}><BudgetForm item={editor.item} detail={detail} saving={saving} onSubmit={saveBudget} /></PlanningEditor> : null}
    {editor?.kind === 'risk' ? <PlanningEditor title={editor.item ? 'Editar riesgo' : 'Nuevo riesgo'} onClose={() => setEditor(null)}><RiskForm item={editor.item} detail={detail} saving={saving} onSubmit={saveRisk} /></PlanningEditor> : null}
    {editor?.kind === 'funding' ? <PlanningEditor title="Nueva fuente de financiamiento" onClose={() => setEditor(null)}><FundingForm detail={detail} saving={saving} onSubmit={saveFunding} /></PlanningEditor> : null}
    {editor?.kind === 'version' ? <PlanningEditor title="Nueva versión presupuestaria" onClose={() => setEditor(null)}><VersionForm detail={detail} saving={saving} onSubmit={saveVersion} /></PlanningEditor> : null}
    {editor?.kind === 'movement' ? <PlanningEditor title="Registrar movimiento financiero" onClose={() => setEditor(null)}><MovementForm detail={detail} saving={saving} onSubmit={saveMovement} /></PlanningEditor> : null}
  </div>;
}

function TaskTable({ tasks, canUpdate, onEdit, onDelete }: { tasks: ProjectTask[]; canUpdate: boolean; onEdit: (item: ProjectTask) => void; onDelete: (item: ProjectTask) => void }) {
  if (!tasks.length) return <EmptyPlan icon="◇" title="Aún no existe una estructura de trabajo" text="Crea la primera fase para comenzar la planificación del proyecto." />;
  return <div className="planning-table-wrap"><table className="planning-table"><thead><tr><th>Código / elemento</th><th>Responsable</th><th>Fechas</th><th>Estado</th><th>Avance</th>{canUpdate ? <th>Acciones</th> : null}</tr></thead><tbody>{tasks.map((item) => <tr key={item.id}><td><div className={`planning-task planning-task--${item.taskType}`} style={{ paddingLeft: `${taskDepth(item, tasks) * 18}px` }}><small>{item.code} · {taskTypeLabel(item.taskType)}</small><strong>{item.title}</strong>{item.predecessorIds.length ? <span>Depende de {item.predecessorIds.map((id) => tasks.find((task) => task.id === id)?.code ?? id).join(', ')}</span> : null}</div></td><td>{item.ownerName ?? <span className="planning-muted">Sin asignar</span>}</td><td><small>{item.startDate || '—'} → {item.endDate || '—'}</small></td><td><StatusPill status={item.status} /></td><td><Progress value={item.progressPct} /></td>{canUpdate ? <td><div className="planning-row-actions"><button type="button" onClick={() => onEdit(item)}>Editar</button><button type="button" className="danger" onClick={() => onDelete(item)}>Eliminar</button></div></td> : null}</tr>)}</tbody></table></div>;
}

function ProjectGantt({ tasks, onEdit }: { tasks: ProjectTask[]; onEdit?: (item: ProjectTask) => void }) {
  const dated = tasks.filter((item) => item.startDate && item.endDate);
  if (!dated.length) return <EmptyPlan icon="▥" title="No hay actividades con fechas" text="Asigna inicio y fin para construir automáticamente el cronograma." />;
  const min = Math.min(...dated.map((item) => Date.parse(item.startDate!)));
  const max = Math.max(...dated.map((item) => Date.parse(item.endDate!)));
  const span = Math.max(86400000, max - min + 86400000);
  return <div className="project-gantt"><div className="project-gantt__axis"><span>{new Date(min).toISOString().slice(0, 10)}</span><span>{new Date(max).toISOString().slice(0, 10)}</span></div>{dated.map((item) => { const left = ((Date.parse(item.startDate!) - min) / span) * 100; const width = Math.max(2, ((Date.parse(item.endDate!) - Date.parse(item.startDate!) + 86400000) / span) * 100); return <button key={item.id} type="button" className={`project-gantt__row project-gantt__row--${item.taskType}`} onClick={() => onEdit?.(item)}><span><small>{item.code}</small><strong>{item.title}</strong></span><i><b style={{ left: `${left}%`, width: `${width}%` }}><em style={{ width: `${item.progressPct}%` }} /></b></i><strong>{item.progressPct}%</strong></button>; })}</div>;
}

function BudgetTable({ detail, canUpdate, onEdit, onDelete }: { detail: ProjectDetail; canUpdate: boolean; onEdit: (item: ProjectBudgetItem) => void; onDelete: (item: ProjectBudgetItem) => void }) {
  const items = detail.budgetItems;
  if (!items.length) return <EmptyPlan icon="$" title="No hay presupuesto registrado" text="Agrega partidas para comparar planificación y ejecución financiera." />;
  const execution = detail.financialSettings.mode === 'execution';
  const approved = detail.financialMovements.filter((movement) => movement.status === 'approved');
  return <div className="planning-table-wrap"><table className="planning-table"><thead><tr><th>Partida</th><th>Categoría / fuente</th><th>Planificado</th><th>Comprometido</th><th>Ejecutado</th><th>%</th>{canUpdate ? <th>Acciones</th> : null}</tr></thead><tbody>{items.map((item) => {
    const movements = approved.filter((movement) => movement.budgetItemId === item.id);
    const committed = movements.filter((movement) => movement.movementType === 'commitment').reduce((sum, movement) => sum + movement.baseAmount, 0);
    const executed = movements.filter((movement) => movement.movementType === 'payment').reduce((sum, movement) => sum + movement.baseAmount, 0);
    return <tr key={item.id}><td><small>{item.code}</small><strong>{item.name}</strong></td><td>{item.category}<small>{item.fundingSource || 'Sin fuente'}</small></td><td>{formatMoney(item.plannedAmount, item.currency)}</td><td>{execution ? formatMoney(committed, detail.financialSettings.baseCurrency ?? item.currency) : '—'}</td><td>{execution ? formatMoney(executed, detail.financialSettings.baseCurrency ?? item.currency) : '—'}</td><td>{execution ? <Progress value={item.plannedAmount ? executed / item.plannedAmount * 100 : 0} /> : '—'}</td>{canUpdate ? <td><div className="planning-row-actions"><button type="button" onClick={() => onEdit(item)}>Editar</button><button type="button" className="danger" onClick={() => onDelete(item)}>Eliminar</button></div></td> : null}</tr>;
  })}</tbody></table></div>;
}

function RiskMatrix({ risks }: { risks: ProjectRisk[] }) {
  return <div className="risk-matrix" aria-label="Matriz de probabilidad e impacto">{[5,4,3,2,1].map((probability) => [1,2,3,4,5].map((impact) => { const count = risks.filter((risk) => risk.probability === probability && risk.impact === impact && !['closed','mitigated'].includes(risk.status)).length; const score = probability * impact; return <div key={`${probability}-${impact}`} className={`risk-matrix__cell risk-matrix__cell--${riskTone(score)}`} title={`Probabilidad ${probability}, impacto ${impact}`}><small>{probability}×{impact}</small><strong>{count || '—'}</strong></div>; }))}</div>;
}

function RiskList({ risks, canUpdate, onEdit, onDelete }: { risks: ProjectRisk[]; canUpdate: boolean; onEdit: (item: ProjectRisk) => void; onDelete: (item: ProjectRisk) => void }) {
  if (!risks.length) return <EmptyPlan icon="!" title="No hay riesgos registrados" text="Documenta amenazas, responsables y acciones de tratamiento." />;
  return <div className="project-risk-list">{risks.map((risk) => <article key={risk.id}><div className={`project-risk-score project-risk-score--${riskTone(risk.score)}`}><small>P×I</small><strong>{risk.score}</strong></div><div><small>{risk.code} · {risk.category || 'General'}</small><strong>{risk.title}</strong><span>{risk.mitigation || 'Sin medida de respuesta documentada'}</span></div><div><StatusPill status={risk.status} /><small>{risk.ownerName || 'Sin responsable'}</small></div>{canUpdate ? <div className="planning-row-actions"><button type="button" onClick={() => onEdit(risk)}>Editar</button><button type="button" className="danger" onClick={() => onDelete(risk)}>Eliminar</button></div> : null}</article>)}</div>;
}

function FinanceSourcesAndVersions({ detail }: { detail: ProjectDetail }) { return <div className="finance-split"><section><h4>Fuentes de financiamiento</h4>{detail.fundingSources.length?detail.fundingSources.map((source)=><article key={source.id}><div><small>{source.code} · {source.sourceType}</small><strong>{source.name}</strong><span>{source.funder||'Sin financiador especificado'}</span></div><b>{nullableMoney(source.approvedAmount,source.currency)}</b></article>):<p>Sin fuentes registradas.</p>}</section><section><h4>Versiones presupuestarias</h4>{detail.budgetVersions.length?detail.budgetVersions.map((version)=><article key={version.id}><div><small>v{version.versionNumber} · {version.status}</small><strong>{version.name}</strong><span>{version.effectiveDate} · {version.reason||'Sin motivo'}</span></div><b>{formatMoney(version.totalAmount,detail.financialSettings.baseCurrency??'USD')}</b></article>):<p>Sin versiones registradas.</p>}</section></div>; }
function FinancialMovementTable({ detail }: { detail: ProjectDetail }) { if(!detail.financialMovements.length)return <EmptyPlan icon="$" title="Sin movimientos financieros" text="Registra compromisos, pagos, desembolsos o ajustes aprobados."/>;return <div className="planning-table-wrap"><table className="planning-table"><thead><tr><th>Fecha / tipo</th><th>Concepto</th><th>Referencia</th><th>Estado</th><th>Monto base</th></tr></thead><tbody>{detail.financialMovements.map((movement)=><tr key={movement.id}><td><small>{movement.movementDate}</small><strong>{movementTypeLabel(movement.movementType)}</strong></td><td><strong>{movement.concept}</strong><small>{movement.supplierOrBeneficiary||'Sin tercero'}</small></td><td>{movement.documentNumber||movement.externalReference||'—'}</td><td><StatusPill status={movement.status}/></td><td>{formatMoney(movement.baseAmount,detail.financialSettings.baseCurrency??movement.currency)}</td></tr>)}</tbody></table></div>; }

function FundingForm({detail,saving,onSubmit}:{detail:ProjectDetail;saving:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}){return <form className="planning-form" onSubmit={onSubmit}><div className="planning-form__grid"><Field label="Código"><input name="code" required/></Field><Field label="Nombre"><input name="name" required/></Field><Field label="Tipo"><select name="sourceType"><option value="institutional">Institucional</option><option value="donor">Donante</option><option value="loan">Préstamo</option><option value="cooperation">Cooperación</option></select></Field><Field label="Financiador"><input name="funder"/></Field><Field label="Moneda"><input name="currency" required maxLength={3} defaultValue={detail.financialSettings.baseCurrency??'USD'}/></Field><Field label="Monto aprobado"><input name="approvedAmount" type="number" min="0" step="0.01" defaultValue="0"/></Field><Field label="Monto recibido"><input name="receivedAmount" type="number" min="0" step="0.01" defaultValue="0"/></Field><Field label="Inicio"><input name="validFrom" type="date"/></Field><Field label="Fin"><input name="validTo" type="date"/></Field><Field label="Restricciones" wide><textarea name="restrictions" rows={3}/></Field></div><Submit saving={saving}/></form>;}
function VersionForm({detail,saving,onSubmit}:{detail:ProjectDetail;saving:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}){const next=Math.max(0,...detail.budgetVersions.map((item)=>item.versionNumber))+1;return <form className="planning-form" onSubmit={onSubmit}><div className="planning-form__grid"><Field label="Número"><input name="versionNumber" type="number" min="1" required defaultValue={next}/></Field><Field label="Fecha efectiva"><input name="effectiveDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></Field><Field label="Nombre" wide><input name="name" required placeholder="Reprogramación 2027"/></Field><Field label="Total"><input name="totalAmount" type="number" min="0" step="0.01" required defaultValue={detail.financialSummary.currentBudget??0}/></Field><Field label="Variación"><input name="changeAmount" type="number" step="0.01" defaultValue="0"/></Field><Field label="Motivo" wide><textarea name="reason" rows={4}/></Field></div><Submit saving={saving}/></form>;}
function MovementForm({detail,saving,onSubmit}:{detail:ProjectDetail;saving:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}){return <form className="planning-form" onSubmit={onSubmit}><div className="planning-form__grid"><Field label="Tipo"><select name="movementType"><option value="commitment">Compromiso</option><option value="accrual">Devengo</option><option value="payment">Pago / gasto</option><option value="disbursement">Desembolso recibido</option><option value="adjustment">Ajuste</option><option value="transfer">Transferencia</option></select></Field><Field label="Fecha"><input name="movementDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></Field><Field label="Partida"><select name="budgetItemId" required><option value="">Seleccionar</option>{detail.budgetItems.map((item)=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></Field><Field label="Fuente"><select name="fundingSourceId"><option value="">Sin fuente</option>{detail.fundingSources.map((item)=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></Field><Field label="Actividad"><select name="taskId"><option value="">Sin actividad</option>{detail.tasks.map((item)=><option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></Field><Field label="Efecto presupuestario"><select name="budgetEffect"><option value="neutral">Neutral</option><option value="increase">Aumenta</option><option value="decrease">Disminuye</option></select></Field><Field label="Monto"><input name="amount" type="number" min="0" step="0.01" required/></Field><Field label="Moneda"><input name="currency" required maxLength={3} defaultValue={detail.financialSettings.baseCurrency??'USD'}/></Field><Field label="Tipo de cambio"><input name="exchangeRate" type="number" min="0.000001" step="0.000001" defaultValue="1" required/></Field><Field label="Proveedor / beneficiario"><input name="supplierOrBeneficiary"/></Field><Field label="Concepto" wide><input name="concept" required/></Field><Field label="Referencia externa"><input name="externalReference"/></Field><Field label="Documento"><input name="documentNumber"/></Field></div><Submit saving={saving}/></form>;}

function PlanningEditor({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="planning-editor" role="dialog" aria-modal="true" aria-label={title}><button type="button" className="planning-editor__backdrop" aria-label="Cerrar" onClick={onClose} /><aside><header><div><small>Planificación del proyecto</small><h2>{title}</h2></div><button type="button" onClick={onClose}>×</button></header>{children}</aside></div>; }

function TaskForm({ item, detail, saving, onSubmit }: { item?: ProjectTask; detail: ProjectDetail; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <form className="planning-form" onSubmit={onSubmit}><div className="planning-form__grid"><Field label="Tipo"><select name="taskType" defaultValue={item?.taskType ?? 'task'}><option value="phase">Fase</option><option value="activity">Actividad</option><option value="task">Tarea</option></select></Field><Field label="Código"><input name="code" required defaultValue={item?.code ?? ''} placeholder="F1.1" /></Field><Field label="Título" wide><input name="title" required defaultValue={item?.title ?? ''} /></Field><Field label="Elemento superior"><select name="parentTaskId" defaultValue={item?.parentTaskId ?? ''}><option value="">Sin elemento superior</option>{detail.tasks.filter((task) => task.id !== item?.id).map((task) => <option key={task.id} value={task.id}>{task.code} · {task.title}</option>)}</select></Field><Field label="Responsable"><select name="ownerActorId" defaultValue={item?.ownerActorId ?? ''}><option value="">Sin responsable</option>{detail.actors.filter((actor) => actor.status === 'active').map((actor) => <option key={actor.id} value={actor.id}>{actor.displayName}</option>)}</select></Field><Field label="Inicio"><input type="date" name="startDate" defaultValue={item?.startDate ?? ''} /></Field><Field label="Fin"><input type="date" name="endDate" defaultValue={item?.endDate ?? ''} /></Field><Field label="Estado"><select name="status" defaultValue={item?.status ?? 'planned'}>{planningStatusOptions()}</select></Field><Field label="Avance %"><input type="number" name="progressPct" min="0" max="100" step="1" defaultValue={item?.progressPct ?? 0} /></Field><Field label="Peso"><input type="number" name="weight" min="0" step="0.1" defaultValue={item?.weight ?? 1} /></Field><Field label="Orden"><input type="number" name="sortOrder" step="1" defaultValue={item?.sortOrder ?? detail.tasks.length} /></Field><Field label="Predecesoras" wide><select name="predecessorIds" multiple defaultValue={item?.predecessorIds ?? []}>{detail.tasks.filter((task) => task.id !== item?.id).map((task) => <option key={task.id} value={task.id}>{task.code} · {task.title}</option>)}</select><small>Ctrl/Cmd + clic para seleccionar varias.</small></Field><Field label="Descripción" wide><textarea name="description" rows={4} defaultValue={item?.description ?? ''} /></Field></div><Submit saving={saving} /></form>; }

function BudgetForm({ item, detail, saving, onSubmit }: { item?: ProjectBudgetItem; detail: ProjectDetail; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <form className="planning-form" onSubmit={onSubmit}><div className="planning-form__grid"><Field label="Código"><input name="code" required defaultValue={item?.code ?? ''} placeholder="PRES-001" /></Field><Field label="Categoría"><input name="category" required defaultValue={item?.category ?? ''} placeholder="Servicios profesionales" /></Field><Field label="Nombre" wide><input name="name" required defaultValue={item?.name ?? ''} /></Field><Field label="Actividad asociada"><select name="taskId" defaultValue={item?.taskId ?? ''}><option value="">Sin actividad asociada</option>{detail.tasks.map((task) => <option key={task.id} value={task.id}>{task.code} · {task.title}</option>)}</select></Field><Field label="Fuente"><input name="fundingSource" defaultValue={item?.fundingSource ?? ''} /></Field><Field label="Moneda"><input name="currency" maxLength={3} required defaultValue={item?.currency ?? detail.financialSettings.baseCurrency ?? 'USD'} /></Field><Field label="Monto planificado"><input type="number" name="plannedAmount" min="0" step="0.01" defaultValue={item?.plannedAmount ?? 0} /></Field><Field label="Notas" wide><textarea name="notes" rows={4} defaultValue={item?.notes ?? ''} /></Field></div><p className="planning-form__hint">Los compromisos y pagos se registran como movimientos financieros; no se editan directamente en la partida.</p><Submit saving={saving} /></form>; }

function RiskForm({ item, detail, saving, onSubmit }: { item?: ProjectRisk; detail: ProjectDetail; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <form className="planning-form" onSubmit={onSubmit}><div className="planning-form__grid"><Field label="Código"><input name="code" required defaultValue={item?.code ?? ''} placeholder="R-001" /></Field><Field label="Categoría"><input name="category" defaultValue={item?.category ?? ''} /></Field><Field label="Riesgo" wide><input name="title" required defaultValue={item?.title ?? ''} /></Field><Field label="Responsable"><select name="ownerActorId" defaultValue={item?.ownerActorId ?? ''}><option value="">Sin responsable</option>{detail.actors.filter((actor) => actor.status === 'active').map((actor) => <option key={actor.id} value={actor.id}>{actor.displayName}</option>)}</select></Field><Field label="Estado"><select name="status" defaultValue={item?.status ?? 'open'}><option value="open">Abierto</option><option value="monitoring">En monitoreo</option><option value="mitigated">Mitigado</option><option value="accepted">Aceptado</option><option value="closed">Cerrado</option></select></Field><Field label="Probabilidad (1–5)"><input type="number" name="probability" min="1" max="5" defaultValue={item?.probability ?? 1} /></Field><Field label="Impacto (1–5)"><input type="number" name="impact" min="1" max="5" defaultValue={item?.impact ?? 1} /></Field><Field label="Estrategia"><select name="responseStrategy" defaultValue={item?.responseStrategy ?? 'mitigate'}><option value="avoid">Evitar</option><option value="mitigate">Mitigar</option><option value="transfer">Transferir</option><option value="accept">Aceptar</option></select></Field><Field label="Próxima revisión"><input type="date" name="reviewDate" defaultValue={item?.reviewDate ?? ''} /></Field><Field label="Descripción" wide><textarea name="description" rows={3} defaultValue={item?.description ?? ''} /></Field><Field label="Respuesta / mitigación" wide><textarea name="mitigation" rows={4} defaultValue={item?.mitigation ?? ''} /></Field></div><Submit saving={saving} /></form>; }

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? 'planning-form__wide' : ''}><span>{label}</span>{children}</label>; }
function Submit({ saving }: { saving: boolean }) { return <footer><button className="reports-button reports-button--primary" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></footer>; }
function EmptyPlan({ icon, title, text }: { icon: string; title: string; text: string }) { return <div className="planning-empty"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div>; }
function StatusPill({ status }: { status: string }) { return <StatPill tone={status === 'done' || status === 'closed' || status === 'mitigated' ? 'good' : status === 'blocked' || status === 'open' ? 'warn' : 'neutral'}>{statusLabel(status)}</StatPill>; }
function Progress({ value }: { value: number }) { const safe = Math.max(0, Math.min(100, Math.round(value))); return <div className="planning-progress"><i><b style={{ width: `${safe}%` }} /></i><span>{safe}%</span></div>; }

function summarizeTasks(tasks: ProjectTask[]) { const weighted = tasks.reduce((sum, item) => sum + item.progressPct * item.weight, 0); const weights = tasks.reduce((sum, item) => sum + item.weight, 0); const dates = tasks.flatMap((item) => [item.startDate, item.endDate]).filter(Boolean).map((value) => Date.parse(value!)); const start = dates.length ? Math.min(...dates) : 0; const end = dates.length ? Math.max(...dates) : 0; const now = new Date().toISOString().slice(0,10); return { progress: weights ? Math.round(weighted / weights) : 0, done: tasks.filter((item) => item.status === 'done').length, inProgress: tasks.filter((item) => item.status === 'in_progress').length, blocked: tasks.filter((item) => item.status === 'blocked').length, unassigned: tasks.filter((item) => !item.ownerActorId).length, overdue: tasks.filter((item) => item.endDate && item.endDate < now && item.status !== 'done').length, startDate: start ? new Date(start).toISOString().slice(0,10) : '', endDate: end ? new Date(end).toISOString().slice(0,10) : '', durationDays: start && end ? Math.round((end - start) / 86400000) + 1 : 0 }; }
function summarizeRisks(risks: ProjectRisk[]) { const active = risks.filter((risk) => !['closed','mitigated'].includes(risk.status)); const reviews = active.map((risk) => risk.reviewDate).filter(Boolean).sort(); return { open: active.length, critical: active.filter((risk) => risk.score >= 15).length, withoutMitigation: active.filter((risk) => !risk.mitigation).length, nextReview: reviews[0] ?? '' }; }
function taskDepth(item: ProjectTask, tasks: ProjectTask[]) { let depth=0; let parent=item.parentTaskId; const seen=new Set<string>(); while(parent && depth<4 && !seen.has(parent)){seen.add(parent); depth+=1; parent=tasks.find((task)=>task.id===parent)?.parentTaskId ?? null;} return depth; }
function formatMoney(value: number, currency: string) { try { return new Intl.NumberFormat('es-CR',{style:'currency',currency,maximumFractionDigits:0}).format(value); } catch { return `${currency} ${value.toLocaleString('es-CR')}`; } }
function nullableMoney(value:number|null,currency:string|null){return value===null?'No disponible':formatMoney(value,currency??'USD');}
function movementTypeLabel(type:string){return ({allocation:'Asignación',commitment:'Compromiso',accrual:'Devengo',payment:'Pago',disbursement:'Desembolso',adjustment:'Ajuste',transfer:'Transferencia'} as Record<string,string>)[type]??type;}
function riskTone(score: number) { return score >= 15 ? 'critical' : score >= 8 ? 'high' : score >= 4 ? 'medium' : 'low'; }
function taskTypeLabel(type: ProjectTask['taskType']) { return type === 'phase' ? 'Fase' : type === 'activity' ? 'Actividad' : 'Tarea'; }
function statusLabel(status: string) { return ({ planned:'Planificado',in_progress:'En curso',done:'Completado',blocked:'Bloqueado',cancelled:'Cancelado',open:'Abierto',monitoring:'En monitoreo',mitigated:'Mitigado',closed:'Cerrado',accepted:'Aceptado' } as Record<string,string>)[status] ?? status; }
function planningStatusOptions() { return <><option value="planned">Planificado</option><option value="in_progress">En curso</option><option value="done">Completado</option><option value="blocked">Bloqueado</option><option value="cancelled">Cancelado</option></>; }
