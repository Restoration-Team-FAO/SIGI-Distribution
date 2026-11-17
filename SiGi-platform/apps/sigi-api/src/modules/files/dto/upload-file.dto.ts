export class UploadFileDto {
  folderId?: string | null;
  institutionId?: string | null;
  projectId?: string | null;
  title?: string | null;
  description?: string | null;
  confidentialityLevel?: string;
  validationStatus?: string;
  sourceType?: string;
  isGeospatial?: string | boolean;
  isPublic?: string | boolean;
  changeNote?: string | null;
}
