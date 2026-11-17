export class CreateDatasetDto {
  institutionId!: string;
  sourceId!: string;
  schemaCode!: string;
  payload!: Record<string, unknown>;
}

