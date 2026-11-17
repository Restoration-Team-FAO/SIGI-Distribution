import { ReactNode } from 'react';
import { NoPermissionState } from '@sigi/ui';
import { canAccessCapability, CapabilityUser, UiCapability } from './capabilities';

export function PermissionGate(props: {
  capability: UiCapability;
  user: CapabilityUser;
  children: ReactNode;
  fallback?: ReactNode;
  description?: string;
}) {
  if (canAccessCapability(props.capability, props.user)) {
    return props.children;
  }

  return props.fallback ?? (
    <NoPermissionState
      description={props.description ?? 'Tu sesión no tiene la capacidad necesaria para acceder a esta función.'}
    />
  );
}
