export interface KoboConnector {
  pull(): Promise<void>;
  mapToCanonicalPayload(): Promise<Record<string, unknown>>;
}

