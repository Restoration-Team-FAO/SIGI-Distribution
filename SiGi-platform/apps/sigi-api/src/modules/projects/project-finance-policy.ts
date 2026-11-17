export type FinancialMode = 'none' | 'planning' | 'execution' | 'external' | string;

export type FinancialSettingsInput = {
  mode: FinancialMode;
  baseCurrency: string | null;
  externalBudgetAmount: number | null;
  externalCommittedAmount: number | null;
  externalExecutedAmount: number | null;
  externalAvailableAmount: number | null;
  dataCutoffDate: string | null;
};

export type FinancialTotalsInput = {
  initialBudget: number;
  lineBudget: number;
  adjustments: number;
  committed: number;
  executed: number;
};

export function calculateProjectFinancialSummary(settings: FinancialSettingsInput, totals?: FinancialTotalsInput) {
  if (settings.mode === 'none') {
    return { applicable: false, source: 'none' as const, currency: null, initialBudget: null, currentBudget: null, committed: null, executed: null, available: null, executionPct: null, commitmentPct: null, variance: null, cutoffDate: null };
  }
  if (settings.mode === 'external') {
    const current = settings.externalBudgetAmount;
    return { applicable: true, source: 'external' as const, currency: settings.baseCurrency, initialBudget: null, currentBudget: current, committed: settings.externalCommittedAmount, executed: settings.externalExecutedAmount, available: settings.externalAvailableAmount, executionPct: percentage(settings.externalExecutedAmount,current), commitmentPct: percentage(settings.externalCommittedAmount,current), variance: null, cutoffDate: settings.dataCutoffDate };
  }
  if (!totals) throw new Error('Los modos planning y execution requieren totales presupuestarios.');
  const current = totals.initialBudget + totals.adjustments || totals.lineBudget;
  const committed = settings.mode === 'execution' ? totals.committed : null;
  const executed = settings.mode === 'execution' ? totals.executed : null;
  return { applicable: true, source: 'sigi' as const, currency: settings.baseCurrency ?? 'USD', initialBudget: totals.initialBudget, currentBudget: current, committed, executed, available: committed === null ? null : current - committed, executionPct: percentage(executed,current), commitmentPct: percentage(committed,current), variance: current - totals.initialBudget, cutoffDate: null };
}

export function percentage(value:number|null,current:number|null){return value===null||current===null||current<=0?null:Number((value/current*100).toFixed(2));}
