import { EgiProvider } from '../contexts/EgiContext';
import { GlobalFilterProvider } from '../contexts/GlobalFilterContext';
import { getAdminSessionUser } from '../services/api';
import { AppShell } from './AppShell';

export function WorkspaceApp(props: {
  sessionUser: ReturnType<typeof getAdminSessionUser>;
  onLogout: () => void;
}) {
  return (
    <EgiProvider enabled>
      <GlobalFilterProvider>
        <AppShell sessionUser={props.sessionUser} onLogout={props.onLogout} />
      </GlobalFilterProvider>
    </EgiProvider>
  );
}
