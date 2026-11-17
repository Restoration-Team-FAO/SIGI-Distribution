export interface OdooConnector {
  extract(): Promise<void>;
  mapToCanonicalPayload(): Promise<Record<string, unknown>>;
}

