export interface ExcelConnector {
  parseWorkbook(): Promise<void>;
  mapToCanonicalPayload(): Promise<Record<string, unknown>>;
}

