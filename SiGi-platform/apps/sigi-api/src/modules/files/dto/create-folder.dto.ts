export class CreateFolderDto {
  parentId?: string | null;
  institutionId?: string | null;
  projectId?: string | null;
  name!: string;
  description?: string | null;
  visibility?: string;
}
