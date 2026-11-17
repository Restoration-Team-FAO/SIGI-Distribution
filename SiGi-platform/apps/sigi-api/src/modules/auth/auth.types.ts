export type AuthRole =
  | 'superadmin'
  | 'national_admin'
  | 'institution_editor'
  | 'technical_validator'
  | 'read_consumer'
  | 'technical_integration';

export type AuthPrincipal = {
  userId: string;
  subject: string;
  institutionId?: string | null;
  roles: string[];
  permissions: string[];
  sessionId?: string | null;
  authMode?: 'legacy' | 'session';
};
