import { FormEvent, KeyboardEvent, useId, useState } from 'react';
import { SIGI_SUPPORT_CONTACT } from '../app/access-config';

/** Traduce los errores técnicos del inicio de sesión a mensajes claros para la persona usuaria. */
export function describeLoginError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason ?? '');
  const normalized = message.toLowerCase();
  if (normalized.includes('credenciales inválidas') || normalized.includes('invalid credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (normalized.includes('rate_limited') || normalized.includes('too many requests')) {
    return 'Demasiados intentos en poco tiempo. Espera un minuto y vuelve a intentarlo.';
  }
  if (normalized.includes('no está activa')) {
    return 'Tu cuenta no está activa. Contacta a soporte para habilitarla.';
  }
  if (normalized.includes('no se pudo conectar') || normalized.includes('failed to fetch') || normalized.includes('networkerror')) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }
  return 'No se pudo iniciar sesión. Inténtalo de nuevo en unos minutos.';
}

export function AdministrationPage(props: {
  authenticated: boolean;
  /** Aviso informativo (p. ej. sesión expirada); no es un error del formulario. */
  notice: string | null;
  error: string | null;
  email: string;
  password: string;
  isAuthenticating: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onOpenWorkspace: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const recoveryId = useId();

  const syncCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(Boolean(event.getModifierState?.('CapsLock')));
  };

  return (
    <section className="sigi-administration">
      <div className="sigi-administration__intro">
        <div className="sigi-administration__intro-content">
          <span className="sigi-administration__eyebrow">Plataforma de información territorial</span>
          <p className="sigi-administration__headline">Información territorial para decidir mejor.</p>
          <p className="sigi-administration__lead">
            Proyectos, mapas, indicadores e informes de tu institución en un solo lugar.
          </p>
          <ul className="sigi-administration__highlights">
            <li>Mapa con capas, análisis espacial y fichas por territorio.</li>
            <li>Seguimiento de proyectos: planificación, presupuesto y riesgos.</li>
            <li>Indicadores e informes listos para reportar.</li>
          </ul>
        </div>
      </div>

      <section className="sigi-auth__panel" aria-labelledby="sigi-login-title">
        <img
          className="sigi-auth__logo"
          src="/brand/sigi-logo-horizontal-transparent.png"
          alt="SIGI — Sistema Integrado de Gestión de la Información"
          width={260}
          height={91}
        />
        <h1 id="sigi-login-title" className="sigi-auth__title">Iniciar sesión en SIGI</h1>

        {props.authenticated ? (
          <>
            <p className="sigi-auth__copy">Tu sesión está activa.</p>
            <button className="sigi-auth__button" type="button" onClick={props.onOpenWorkspace}>
              Continuar a mi espacio de trabajo
            </button>
          </>
        ) : (
          <>
            {props.error ? (
              <div className="sigi-auth__alert sigi-auth__alert--error" role="alert">
                {props.error}
              </div>
            ) : props.notice ? (
              <div className="sigi-auth__alert" role="status">
                {props.notice}
              </div>
            ) : (
              <p className="sigi-auth__copy">Ingresa con tu correo y contraseña.</p>
            )}

            <form className="sigi-auth__form" onSubmit={props.onLogin}>
              <label className="sigi-auth__label" htmlFor="admin-email">Correo</label>
              <input
                id="admin-email"
                className="sigi-auth__input"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={props.email}
                onChange={(event) => props.onEmailChange(event.target.value)}
                placeholder="nombre@institucion.org"
                aria-invalid={props.error ? true : undefined}
              />

              <label className="sigi-auth__label" htmlFor="admin-password">Contraseña</label>
              <div className="sigi-auth__password">
                <input
                  id="admin-password"
                  className="sigi-auth__input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={props.password}
                  onChange={(event) => props.onPasswordChange(event.target.value)}
                  onKeyDown={syncCapsLock}
                  onKeyUp={syncCapsLock}
                  onBlur={() => setCapsLockOn(false)}
                  placeholder="Ingresa tu contraseña"
                  aria-invalid={props.error ? true : undefined}
                  aria-describedby={capsLockOn ? 'sigi-capslock' : undefined}
                />
                <button
                  type="button"
                  className="sigi-auth__reveal"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 8.5 4.2 9.5 7-.4 1.1-1.2 2.5-2.4 3.7M6.3 6.3C4.5 7.6 3.1 9.5 2.5 12c1 2.8 4.5 7 9.5 7 1.6 0 3-.4 4.3-1" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12C3.5 9.2 7 5 12 5s8.5 4.2 9.5 7c-1 2.8-4.5 7-9.5 7s-8.5-4.2-9.5-7z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
              {capsLockOn ? (
                <span id="sigi-capslock" className="sigi-auth__hint sigi-auth__hint--warn" role="status">
                  Bloq Mayús está activado.
                </span>
              ) : null}

              <button
                type="button"
                className="sigi-auth__link"
                aria-expanded={showRecovery}
                aria-controls={recoveryId}
                onClick={() => setShowRecovery((value) => !value)}
              >
                ¿Olvidaste tu contraseña?
              </button>
              {showRecovery ? (
                <div id={recoveryId} className="sigi-auth__recovery">
                  {SIGI_SUPPORT_CONTACT.email ? (
                    <>
                      Para restablecerla, escribe desde tu correo institucional a{' '}
                      <a href={`mailto:${SIGI_SUPPORT_CONTACT.email}?subject=${encodeURIComponent('Restablecer contraseña SIGI')}`}>
                        {SIGI_SUPPORT_CONTACT.email}
                      </a>
                      .
                    </>
                  ) : (
                    <>Para restablecerla, contacta a {SIGI_SUPPORT_CONTACT.label}.</>
                  )}
                </div>
              ) : null}

              <button className="sigi-auth__button" type="submit" disabled={props.isAuthenticating} aria-busy={props.isAuthenticating}>
                {props.isAuthenticating ? 'Ingresando…' : 'Iniciar sesión'}
              </button>
            </form>
          </>
        )}
      </section>
    </section>
  );
}
