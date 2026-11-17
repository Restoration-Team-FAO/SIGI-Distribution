import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { FilesRepository } from '../files.repository';

@Injectable()
export class FilesAuditService {
  constructor(private readonly filesRepository: FilesRepository) {}

  async record(
    input: {
      egiId?: string | null;
      fileId?: string | null;
      folderId?: string | null;
      eventType: string;
      userId?: string | null;
      details?: Record<string, unknown>;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
    client?: PoolClient,
  ) {
    await this.filesRepository.insertAudit(
      {
        egiId: input.egiId ?? null,
        fileId: input.fileId ?? null,
        folderId: input.folderId ?? null,
        eventType: input.eventType,
        userId: input.userId ?? null,
        details: input.details ?? {},
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
      client,
    );
  }
}
