export class UpdateFileMetadataDto {
  title?: string | null;
  description?: string | null;
  confidentialityLevel?: string;
  validationStatus?: string;
  isPublic?: boolean | string;
  country?: string | null;
  department?: string | null;
  municipality?: string | null;
  thematicArea?: string | null;
  documentType?: string | null;
  dataOwner?: string | null;
  technicalCustodian?: string | null;
  license?: string | null;
  retentionPolicy?: string | null;
  spatialReference?: string | null;
  geometryType?: string | null;
  bbox?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}
