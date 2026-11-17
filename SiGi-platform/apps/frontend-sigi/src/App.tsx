import { FormEvent, Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AdministrationShell } from './app/AdministrationShell';
import { AdministrationPage, describeLoginError } from './pages/AdministrationPage';
import {
  getAdminAuthInvalidEventName,
  getAdminSessionUser,
  hydrateAdminSessionToken,
  isAdminSessionActive,
  loginAdminSession,
  logoutAdminSession,
} from './services/api';

const WorkspaceApp = lazy(() =>
  import('./app/WorkspaceApp').then((module) => ({ default: module.WorkspaceApp })),
);

function isWorkspacePath(value: string) {
  return value === '/' || value === '/admin' || value.startsWith('/admin/') || value === '/projects' || value.startsWith('/projects/');
}

const LEGACY_ROUTE_REDIRECTS: Record<string, string> = {
  '/dashboard': '/admin',
  '/territory': '/admin/geobi?view=analysis',
  '/restoration': '/admin/indicators?view=territory',
  '/geo-bi': '/admin/geobi',
  '/integrations': '/admin/data',
  '/indicators': '/admin/indicators',
  '/incidents': '/admin/validations?view=alerts',
  '/quality': '/admin/validations',
  '/reports': '/admin/reports',
  '/documents': '/admin/files',
};

function authenticatedDestination(pathname: string) {
  return LEGACY_ROUTE_REDIRECTS[pathname] ?? `${pathname}`;
}

function safeReturnTo(value: string | null) {
  if (!value || !isWorkspacePath(value) || value.startsWith('//')) {
    return '/admin';
  }
  return value;
}

function administrationUrl(returnTo?: string) {
  return returnTo && isWorkspacePath(returnTo)
    ? `/administration?returnTo=${encodeURIComponent(returnTo)}`
    : '/administration';
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(() => hydrateAdminSessionToken());
  const [sessionUser, setSessionUser] = useState(() => getAdminSessionUser());
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  // Aviso informativo (sesión expirada) separado del error del formulario de acceso.
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const requestedReturnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const currentDeepLink = `${location.pathname}${location.search}${location.hash}`;
  const isAdministrationRoute = location.pathname === '/administration';
  const legacyDestination = LEGACY_ROUTE_REDIRECTS[location.pathname];

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!isAdminSessionActive()) {
        setSessionToken(null);
        setSessionUser(null);
        if (!isAdministrationRoute) {
          navigate(administrationUrl(authenticatedDestination(location.pathname)), { replace: true });
        }
      }
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [currentDeepLink, isAdministrationRoute, location.pathname, navigate]);

  useEffect(() => {
    const handleAuthInvalid = () => {
      setSessionToken(null);
      setSessionUser(null);
      setPasswordInput('');
      // Un intento fallido en la propia vista de acceso también emite este evento (401): no es una expiración.
      if (!isAdministrationRoute) {
        setAuthNotice('Tu sesión expiró. Inicia sesión nuevamente para continuar.');
      }
      navigate(administrationUrl(isAdministrationRoute ? undefined : authenticatedDestination(location.pathname)), { replace: true });
    };

    const eventName = getAdminAuthInvalidEventName();
    window.addEventListener(eventName, handleAuthInvalid);
    return () => window.removeEventListener(eventName, handleAuthInvalid);
  }, [currentDeepLink, isAdministrationRoute, location.pathname, navigate]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailInput.trim() || !passwordInput.trim()) {
      return;
    }

    setIsAuthenticating(true);
    setLoginError(null);
    try {
      const session = await loginAdminSession(emailInput, passwordInput);
      setLogoutInProgress(false);
      setSessionToken(session.accessToken);
      setSessionUser(session.user);
      setPasswordInput('');
      setAuthNotice(null);
      navigate(requestedReturnTo, { replace: true });
    } catch (reason) {
      setLoginError(describeLoginError(reason));
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function handleLogout() {
    setLogoutInProgress(true);
    await logoutAdminSession();
    setSessionToken(null);
    setSessionUser(null);
    setPasswordInput('');
    navigate('/administration', { replace: true });
  }

  if (!sessionToken && !isAdministrationRoute) {
    if (logoutInProgress) {
      return <Navigate to="/administration" replace />;
    }
    const returnTo = isWorkspacePath(location.pathname)
      ? currentDeepLink
      : legacyDestination ?? '/admin';
    return <Navigate to={administrationUrl(returnTo)} replace />;
  }

  if (isAdministrationRoute) {
    return (
      <AdministrationShell>
        <AdministrationPage
          authenticated={Boolean(sessionToken)}
          notice={authNotice}
          error={loginError}
          email={emailInput}
          password={passwordInput}
          isAuthenticating={isAuthenticating}
          onEmailChange={setEmailInput}
          onPasswordChange={setPasswordInput}
          onLogin={handleLogin}
          onOpenWorkspace={() => navigate(requestedReturnTo)}
        />
      </AdministrationShell>
    );
  }

  if (legacyDestination) {
    return <Navigate to={legacyDestination} replace />;
  }

  return (
    <Suspense fallback={<div className="sigi-workspace-loading">Cargando espacio de trabajo...</div>}>
      <WorkspaceApp sessionUser={sessionUser} onLogout={() => void handleLogout()} />
    </Suspense>
  );
}
