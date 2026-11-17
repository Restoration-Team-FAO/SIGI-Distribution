export interface PostgisConnector {
  extractSpatialDataset(): Promise<void>;
  mapToCanonicalPayload(): Promise<Record<string, unknown>>;
}

