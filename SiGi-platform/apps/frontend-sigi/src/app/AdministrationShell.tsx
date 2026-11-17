import { ReactNode } from 'react';
import { SIGI_INSTITUTION_NAME, SIGI_SUPPORT_CONTACT, SIGI_VERSION_LABEL } from './access-config';

export function AdministrationShell(props: { children: ReactNode }) {
  return (
    <div className="sigi-public-shell sigi-access-shell">
      <header className="sigi-public-header">
        <div className="sigi-public-brand">
          <img className="sigi-public-brand__symbol" src="/brand/sigi-symbol-transparent.png" alt="" width={34} height={34} />
          <div>
            <strong>SIGI</strong>
            <span>{SIGI_INSTITUTION_NAME ?? 'Sistema Integrado de Gestión de la Información'}</span>
          </div>
        </div>
      </header>
      <main className="sigi-public-main">{props.children}</main>
      <footer className="sigi-public-footer">
        <span>
          ¿Necesitas ayuda?{' '}
          {SIGI_SUPPORT_CONTACT.email ? (
            <a href={`mailto:${SIGI_SUPPORT_CONTACT.email}`}>{SIGI_SUPPORT_CONTACT.email}</a>
          ) : (
            <>Contacta a {SIGI_SUPPORT_CONTACT.label}.</>
          )}
        </span>
        <span>
          {SIGI_INSTITUTION_NAME ? `${SIGI_INSTITUTION_NAME} · ` : ''}
          {SIGI_VERSION_LABEL}
        </span>
      </footer>
    </div>
  );
}
