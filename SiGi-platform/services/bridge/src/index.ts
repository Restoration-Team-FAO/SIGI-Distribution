export type ExportTarget = 'ferm' | 'national-report' | 'open-data';

export type ExportRun = {
  target: ExportTarget;
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
};

export interface BridgeService {
  getTarget(target: ExportTarget): Promise<ExportRun>;
  run(target: ExportTarget): Promise<ExportRun>;
}

