import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../common/db/postgres.service';
import { redactSecrets } from '../../common/security/redact-secrets';

export type Connector = {
  id: string;
  institutionId: string;
  connectorType: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  displayName: string;
  status: 'active' | 'inactive';
  description?: string | null;
  endpointUrl?: string | null;
  userName?: string | null;
  httpMethod?: string | null;
  authScheme?: string | null;
  resourcePath?: string | null;
  timeoutMs?: number | null;
  credentialsConfigured?: boolean;
  config?: Record<string, unknown>;
  lastSyncAt: string | null;
};

export type PublicConnector = Pick<
  Connector,
  'id' | 'institutionId' | 'connectorType' | 'displayName' | 'status' | 'lastSyncAt'
>;

@Injectable()
export class ConnectorsService {
  constructor(private readonly postgresService: PostgresService) {}

  async listAll(): Promise<Connector[]> {
    const result = await this.postgresService.query<ConnectorRow>(
      `
        SELECT
          id,
          institution_id,
          connector_type,
          display_name,
          status,
          config_json,
          last_sync_at
        FROM core.connectors
        ORDER BY display_name ASC
      `,
    );

    return result.rows.map(mapConnectorRow);
  }

  async listByInstitutionId(institutionId: string): Promise<Connector[]> {
    const result = await this.postgresService.query<ConnectorRow>(
      `
        SELECT
          id,
          institution_id,
          connector_type,
          display_name,
          status,
          config_json,
          last_sync_at
        FROM core.connectors
        WHERE institution_id = $1
        ORDER BY display_name ASC
      `,
      [institutionId],
    );

    return result.rows.map(mapConnectorRow);
  }

  async findByInstitutionAndId(
    institutionId: string,
    connectorId: string,
  ): Promise<Connector | null> {
    const result = await this.postgresService.query<ConnectorRow>(
      `
        SELECT
          id,
          institution_id,
          connector_type,
          display_name,
          status,
          config_json,
          last_sync_at
        FROM core.connectors
        WHERE institution_id = $1 AND id = $2
      `,
      [institutionId, connectorId],
    );

    return result.rows[0] ? mapConnectorRow(result.rows[0]) : null;
  }

  async findById(connectorId: string): Promise<Connector | null> {
    const result = await this.postgresService.query<ConnectorRow>(
      `
        SELECT
          id,
          institution_id,
          connector_type,
          display_name,
          status,
          config_json,
          last_sync_at
        FROM core.connectors
        WHERE id = $1
      `,
      [connectorId],
    );

    return result.rows[0] ? mapConnectorRow(result.rows[0]) : null;
  }

  async listPublic(): Promise<PublicConnector[]> {
    const result = await this.postgresService.query<ConnectorRow>(
      `
        SELECT
          id,
          institution_id,
          connector_type,
          display_name,
          status,
          config_json,
          last_sync_at
        FROM core.connectors
        WHERE status = 'active'
        ORDER BY display_name ASC
      `,
    );

    const connectors = result.rows.map(mapConnectorRow);
    return connectors.map(toPublicConnector);
  }

  async listPublicByInstitutionId(institutionId: string): Promise<PublicConnector[]> {
    const result = await this.postgresService.query<ConnectorRow>(
      `
        SELECT
          id,
          institution_id,
          connector_type,
          display_name,
          status,
          config_json,
          last_sync_at
        FROM core.connectors
        WHERE institution_id = $1
          AND status = 'active'
        ORDER BY display_name ASC
      `,
      [institutionId],
    );

    const connectors = result.rows.map(mapConnectorRow);
    return connectors.map(toPublicConnector);
  }
}

type ConnectorRow = {
  id: string;
  institution_id: string;
  connector_type: 'kobo' | 'excel' | 'odoo' | 'postgis' | 'api';
  display_name: string;
  status: 'active' | 'inactive';
  config_json: Record<string, unknown>;
  last_sync_at: Date | null;
};

export function mapConnectorRow(row: ConnectorRow): Connector {
  const description = readConfigText(row.config_json, 'description');
  const endpointUrl =
    readConfigText(row.config_json, 'endpointUrl') ??
    readConfigText(row.config_json, 'baseUrl');
  const userName =
    readConfigText(row.config_json, 'userName') ??
    readConfigText(row.config_json, 'username');
  const httpMethod = readConfigText(row.config_json, 'httpMethod');
  const authScheme = readConfigText(row.config_json, 'authScheme');
  const resourcePath = readConfigText(row.config_json, 'resourcePath');
  const timeoutMs = readConfigNumber(row.config_json, 'timeoutMs');

  return {
    id: row.id,
    institutionId: row.institution_id,
    connectorType: row.connector_type,
    displayName: row.display_name,
    status: row.status,
    description,
    endpointUrl,
    userName,
    httpMethod,
    authScheme,
    resourcePath,
    timeoutMs,
    credentialsConfigured: hasCredentials(row.config_json),
    config: redactSecrets(row.config_json ?? {}),
    lastSyncAt: row.last_sync_at ? row.last_sync_at.toISOString() : null,
  };
}

function readConfigText(
  config: Record<string, unknown> | null | undefined,
  key: string,
) {
  const raw = config?.[key];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

function readConfigNumber(
  config: Record<string, unknown> | null | undefined,
  key: string,
) {
  const raw = config?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function hasCredentials(config: Record<string, unknown> | null | undefined) {
  const rawSecret =
    readConfigText(config, 'credentialSecret') ??
    readConfigText(config, 'token') ??
    readConfigText(config, 'apiKey') ??
    readConfigText(config, 'password');
  return Boolean(rawSecret);
}

function toPublicConnector(connector: Connector): PublicConnector {
  return {
    id: connector.id,
    institutionId: connector.institutionId,
    connectorType: connector.connectorType,
    displayName: connector.displayName,
    status: connector.status,
    lastSyncAt: connector.lastSyncAt,
  };
}
