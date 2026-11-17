import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { Institution, Permission, Role, User } from '@sigi/domain';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useEgi } from '../contexts/EgiContext';
import { workspaceApi } from '../services/api';
import { hasPermission } from '../utils/permissions';
import { AdministrationWorkspaceHeader } from '../components/AdministrationWorkspaceHeader';
import { DataTable, RowActions, StatusBadge } from '../components/data-display';
import {
  DetailList,
  MessageBlock,
  MetricCard,
  MetricGrid,
  PageLead,
  Panel,
  PanelGrid,
  StatPill,
} from '../components/section-kit';

type UserFormState = {
  institutionId: string;
  email: string;
  displayName: string;
  password: string;
  status: User['status'];
  roles: string[];
};

type RoleFormState = {
  code: string;
  name: string;
  permissions: string[];
};

type UsersTab = 'users' | 'roles' | 'governance';

const initialFormState: UserFormState = {
  institutionId: '',
  email: '',
  displayName: '',
  password: '',
  status: 'pending',
  roles: [],
};

const initialRoleFormState: RoleFormState = {
  code: '',
  name: '',
  permissions: [],
};

const protectedRoleCodes = new Set([
  'superadmin',
  'national_admin',
  'institution_editor',
  'technical_validator',
  'read_consumer',
  'technical_integration',
]);

export function UsersPage(props: { mode?: 'list' | 'create' }) {
  const mode = props.mode ?? 'list';
  const isCreateMode = mode === 'create';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser } = useEgi();
  const formPanelRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [form, setForm] = useState<UserFormState>(initialFormState);
  const [roleForm, setRoleForm] = useState<RoleFormState>(initialRoleFormState);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | User['status']>('all');
  const requestedTab = searchParams.get('view');
  const [activeTab, setActiveTab] = useState<UsersTab>(
    requestedTab === 'roles' || requestedTab === 'governance' ? requestedTab : 'users',
  );
  const canReadUsers = hasPermission(currentUser, 'users.read');
  const canCreateUsers = hasPermission(currentUser, 'users.create');
  const canUpdateUsers = hasPermission(currentUser, 'users.update');
  const canDeleteUsers = hasPermission(currentUser, 'users.delete');
  const canReadRoles = hasPermission(currentUser, 'roles.read');
  const canCreateRoles = hasPermission(currentUser, 'roles.create');
  const canUpdateRoles = hasPermission(currentUser, 'roles.update');
  const canDeleteRoles = hasPermission(currentUser, 'roles.delete');
  const canReadPermissions = hasPermission(currentUser, 'permissions.read');

  async function loadUsersModule() {
    setIsLoading(true);
    setError(null);

    try {
      const [usersResponse, rolesResponse, permissionsResponse, institutionsResponse] = await Promise.all([
        canReadUsers ? workspaceApi.getUsers() : Promise.resolve(null),
        canReadRoles ? workspaceApi.getRoles() : Promise.resolve(null),
        canReadPermissions ? workspaceApi.getPermissions() : Promise.resolve(null),
        canReadUsers || canCreateUsers || canUpdateUsers ? workspaceApi.getInstitutions() : Promise.resolve(null),
      ]);

      setUsers(usersResponse?.data.users ?? []);
      setRoles(rolesResponse?.data.roles ?? []);
      setPermissions(permissionsResponse?.data.permissions ?? []);
      setInstitutions(institutionsResponse?.data.institutions ?? []);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsersModule();
  }, [canCreateUsers, canReadPermissions, canReadRoles, canReadUsers, canUpdateUsers]);

  useEffect(() => {
    if (isCreateMode) return;
    setActiveTab(requestedTab === 'roles' || requestedTab === 'governance' ? requestedTab : 'users');
  }, [isCreateMode, requestedTab]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const payload = {
        institutionId: form.institutionId || null,
        email: form.email.trim(),
        displayName: form.displayName.trim(),
        password: form.password.trim() || undefined,
        status: form.status,
        roles: form.roles,
      };

      if (editingUserId) {
        await workspaceApi.updateUser(editingUserId, payload);
        setNotice(`Usuario ${payload.displayName} actualizado correctamente.`);
      } else {
        await workspaceApi.createUser(payload);
        setNotice(`Usuario ${payload.displayName} creado correctamente.`);
        if (isCreateMode) {
          navigate('/admin/users');
          return;
        }
      }

      setForm(initialFormState);
      setEditingUserId(null);
      await loadUsersModule();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  function handleStartEdit(user: User) {
    setActiveTab('users');
    setEditingUserId(user.id);
    setForm({
      institutionId: user.institutionId ?? '',
      email: user.email,
      displayName: user.displayName,
      password: '',
      status: user.status,
      roles: [...(user.roles ?? [])],
    });
    setError(null);
    setNotice(null);

    window.requestAnimationFrame(() => {
      formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      }, 120);
    });
  }

  function handleCancelEdit() {
    setEditingUserId(null);
    setForm(initialFormState);
    setError(null);
  }

  async function handleDelete(user: User) {
    const confirmed = window.confirm(
      `¿Eliminar al usuario ${user.displayName}? Esta acción solo funciona si no tiene dependencias activas.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingUserId(user.id);
    setError(null);
    setNotice(null);

    try {
      await workspaceApi.deleteUser(user.id);
      setNotice(`Usuario ${user.displayName} eliminado.`);
      if (editingUserId === user.id) {
        setEditingUserId(null);
        setForm(initialFormState);
      }
      await loadUsersModule();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    } finally {
      setDeletingUserId(null);
    }
  }

  function handleToggleRole(roleCode: string) {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(roleCode)
        ? current.roles.filter((role) => role !== roleCode)
        : [...current.roles, roleCode].sort(),
    }));
  }

  async function handleRoleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      const payload = {
        code: roleForm.code.trim(),
        name: roleForm.name.trim(),
        permissions: roleForm.permissions,
      };

      if (editingRoleId) {
        await workspaceApi.updateRole(editingRoleId, payload);
        setNotice(`Rol ${payload.name} actualizado correctamente.`);
      } else {
        await workspaceApi.createRole(payload);
        setNotice(`Rol ${payload.name} creado correctamente.`);
      }

      setRoleForm(initialRoleFormState);
      setEditingRoleId(null);
      await loadUsersModule();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  function handleStartEditRole(role: Role) {
    setActiveTab('roles');
    setEditingRoleId(role.id);
    setRoleForm({
      code: role.code,
      name: role.name,
      permissions: role.permissions?.map((permission) => permission.code) ?? [],
    });
    setError(null);
    setNotice(null);
  }

  function handleToggleRolePermission(permissionCode: string) {
    setRoleForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permissionCode)
        ? current.permissions.filter((permission) => permission !== permissionCode)
        : [...current.permissions, permissionCode].sort(),
    }));
  }

  function handleCancelRoleEdit() {
    setEditingRoleId(null);
    setRoleForm(initialRoleFormState);
    setError(null);
  }

  async function handleDeleteRole(role: Role) {
    const confirmed = window.confirm(
      `¿Eliminar el rol ${role.name}? Solo funcionará si no es un rol base ni tiene usuarios asignados.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingRoleId(role.id);
    setError(null);
    setNotice(null);

    try {
      await workspaceApi.deleteRole(role.id);
      setNotice(`Rol ${role.name} eliminado.`);
      if (editingRoleId === role.id) {
        setEditingRoleId(null);
        setRoleForm(initialRoleFormState);
      }
      await loadUsersModule();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    } finally {
      setDeletingRoleId(null);
    }
  }

  const activeUsers = users.filter((user) => user.status === 'active').length;
  const scopedUsers = users.filter((user) => user.institutionId).length;
  const usersWithoutRoles = users.filter((user) => (user.roles?.length ?? 0) === 0).length;
  const pendingUsers = users.filter((user) => user.status === 'pending').length;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleUsers = users.filter((user) => {
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    if (!matchesStatus) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const searchableFields = [
      user.displayName,
      user.email,
      user.institutionName ?? '',
      ...(user.roles ?? []),
    ];

    return searchableFields.some((field) => field.toLowerCase().includes(normalizedSearch));
  });

  return (
    <section>
      <AdministrationWorkspaceHeader description={`${users.length} usuarios registrados`} />
      <PageLead
        eyebrow="Gobernanza"
        title={isCreateMode ? 'Crear usuario' : 'Usuarios y roles'}
        description={
          isCreateMode
            ? 'Alta dedicada para nuevos accesos, con una vista más limpia y enfocada en identidad, alcance y roles.'
            : 'Administración operativa de accesos, alcance institucional y asignación de perfiles soportados por SIGI desde una sola consola.'
        }
        icon="users"
      />

      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      {notice ? <MessageBlock>{notice}</MessageBlock> : null}

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <button
          disabled={!canReadUsers}
          onClick={() => {
            setActiveTab('users');
            navigate('/admin/users');
          }}
          style={activeTab === 'users' && !isCreateMode ? activeTabButtonStyle : tabButtonStyle}
          type="button"
        >
          Usuarios
        </button>
        <button
          disabled={!canReadRoles}
          onClick={() => {
            setActiveTab('roles');
            navigate('/admin/users?view=roles');
          }}
          style={activeTab === 'roles' && !isCreateMode ? activeTabButtonStyle : tabButtonStyle}
          type="button"
        >
          Roles
        </button>
        {canCreateUsers ? (
          <Link
            to="/admin/users/new"
            style={isCreateMode ? activeTabLinkStyle : tabLinkStyle}
          >
            Alta de usuario
          </Link>
        ) : null}
        <button
          onClick={() => {
            setActiveTab('governance');
            navigate('/admin/users?view=governance');
          }}
          style={
            activeTab === 'governance' && !isCreateMode ? activeTabButtonStyle : tabButtonStyle
          }
          type="button"
        >
          Lectura de gobernanza
        </button>
      </div>

      {isLoading ? (
        <MessageBlock>Cargando usuarios, roles y alcance institucional...</MessageBlock>
      ) : !canReadUsers && !canReadRoles ? (
        <MessageBlock tone="danger">
          Tu sesión no tiene permisos para administrar usuarios o roles desde esta consola.
        </MessageBlock>
      ) : users.length > 0 || roles.length > 0 || isCreateMode ? (
        <>
          {!isCreateMode ? (
          <MetricGrid>
            <MetricCard
              label="Usuarios visibles"
              value={String(users.length)}
              hint="Actores registrados en el entorno actual."
            />
            <MetricCard
              label="Usuarios activos"
              value={String(activeUsers)}
              hint="Cuentas con estado operativo."
            />
            <MetricCard
              label="Roles definidos"
              value={String(roles.length)}
              hint="Catalogo de perfiles soportados."
            />
            <MetricCard
              label="Alcance institucional"
              value={String(scopedUsers)}
              hint="Usuarios atados a una institucion concreta."
            />
            <MetricCard
              label="Usuarios sin rol"
              value={String(usersWithoutRoles)}
              hint="Cuentas que necesitan ajuste antes de operar."
            />
            <MetricCard
              label="Pendientes"
              value={String(pendingUsers)}
              hint="Altas o accesos aun no habilitados."
            />
          </MetricGrid>
          ) : null}

          <PanelGrid>
            {(isCreateMode && canCreateUsers) || (editingUserId && canUpdateUsers) ? (
            <div ref={formPanelRef}>
              <Panel
                title={editingUserId ? 'Editar usuario' : 'Crear usuario'}
                subtitle={
                  editingUserId
                    ? 'Ajusta identidad, alcance y roles sin salir de la consola.'
                    : 'Alta administrativa con asignacion de estado, institucion y perfiles.'
                }
                action={
                  <StatPill tone={editingUserId ? 'warn' : 'neutral'}>
                    {editingUserId ? 'Modo edicion' : 'Admin nacional'}
                  </StatPill>
                }
              >
                {editingUserId ? (
                  <MessageBlock>
                    Estás editando este usuario en el formulario. Al guardar, se actualizan sus datos y roles.
                  </MessageBlock>
                ) : null}
              <form onSubmit={(event) => void handleSubmit(event)} style={{ display: 'grid', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>Nombre</span>
                  <input
                    ref={nameInputRef}
                    value={form.displayName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, displayName: event.target.value }))
                    }
                    placeholder="Nombre visible del usuario"
                    required
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>Correo</span>
                  <input
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, email: event.target.value }))
                    }
                    placeholder="correo@institucion.gob"
                    required
                    type="email"
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>
                    {editingUserId ? 'Nuevo password' : 'Password inicial'}
                  </span>
                  <input
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, password: event.target.value }))
                    }
                    placeholder={
                      editingUserId
                        ? 'Déjalo vacío para conservar el actual'
                        : 'Mínimo 8 caracteres'
                    }
                    minLength={editingUserId ? undefined : 8}
                    type="password"
                    style={inputStyle}
                  />
                  <span style={{ color: '#5f6b7a', fontSize: 12 }}>
                    {editingUserId
                      ? 'Solo se actualiza si escribes una nueva clave.'
                      : 'Se usará para iniciar sesión en la consola.'}
                  </span>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>
                    Institucion
                  </span>
                  <select
                    value={form.institutionId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, institutionId: event.target.value }))
                    }
                    style={inputStyle}
                  >
                    <option value="">Sin alcance institucional</option>
                    {institutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>
                        {institution.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>Estado</span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as User['status'],
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="pending">Pendiente</option>
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </label>

                <div style={{ display: 'grid', gap: 8 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>
                    Roles asignados
                  </span>
                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    }}
                  >
                    {roles.map((role) => (
                      <label
                        key={role.id}
                        style={{
                          border: '1px solid #d7dde5',
                          borderRadius: 14,
                          padding: 12,
                          display: 'grid',
                          gap: 6,
                          background: form.roles.includes(role.code) ? '#f5f7fb' : '#ffffff',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            checked={form.roles.includes(role.code)}
                            onChange={() => handleToggleRole(role.code)}
                            type="checkbox"
                          />
                          <strong style={{ fontSize: 14 }}>{role.name}</strong>
                        </span>
                        <span style={{ color: '#5f6b7a', fontSize: 13 }}>{role.code}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button disabled={isSaving || (!editingUserId && !canCreateUsers) || (Boolean(editingUserId) && !canUpdateUsers)} style={primaryButtonStyle} type="submit">
                    {isSaving
                      ? 'Guardando...'
                      : editingUserId
                        ? 'Guardar cambios'
                        : 'Crear usuario'}
                  </button>
                  {editingUserId ? (
                    <button
                      disabled={isSaving}
                      onClick={handleCancelEdit}
                      style={secondaryButtonStyle}
                      type="button"
                    >
                      Cancelar
                    </button>
                  ) : isCreateMode ? (
                    <Link to="/admin/users" style={secondaryLinkStyle}>
                      Volver al listado
                    </Link>
                  ) : null}
                </div>
              </form>
              </Panel>
            </div>
            ) : null}

            {!isCreateMode && activeTab === 'roles' && canReadRoles ? (
            <Panel
              title={editingRoleId ? 'Editar rol' : 'Crear rol'}
              subtitle={
                editingRoleId
                  ? 'Ajusta nombre y, si aplica, código del rol seleccionado.'
                  : 'Extiende el catálogo de perfiles desde una pestaña dedicada.'
              }
              action={
                <StatPill tone={editingRoleId ? 'warn' : 'neutral'}>
                  {editingRoleId ? 'Modo edicion' : 'Catalogo'}
                </StatPill>
              }
            >
              {editingRoleId && protectedRoleCodes.has(roleForm.code) ? (
                <MessageBlock>
                  Este es un rol base del sistema. Puedes ajustar su nombre, pero no cambiar su código ni eliminarlo.
                </MessageBlock>
              ) : null}
              <MessageBlock>
                Los permisos controlan lo que este rol puede hacer realmente en el sistema. También puedes otorgar acceso heredado a rutas existentes con permisos tipo <code>roles.grant.*</code>.
              </MessageBlock>
              <form onSubmit={(event) => void handleRoleSubmit(event)} style={{ display: 'grid', gap: 14 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>Código</span>
                  <input
                    disabled={editingRoleId !== null && protectedRoleCodes.has(roleForm.code)}
                    value={roleForm.code}
                    onChange={(event) =>
                      setRoleForm((current) => ({ ...current, code: event.target.value }))
                    }
                    placeholder="ej. national_admin"
                    required
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>Nombre</span>
                  <input
                    value={roleForm.name}
                    onChange={(event) =>
                      setRoleForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Nombre visible del rol"
                    required
                    style={inputStyle}
                  />
                </label>

                <div style={{ display: 'grid', gap: 8 }}>
                  <span style={{ color: '#10233f', fontSize: 13, fontWeight: 600 }}>
                    Permisos del rol
                  </span>
                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    }}
                  >
                    {permissions.map((permission) => (
                      <label
                        key={permission.id}
                        style={{
                          border: '1px solid #d7dde5',
                          borderRadius: 14,
                          padding: 12,
                          display: 'grid',
                          gap: 6,
                          background: roleForm.permissions.includes(permission.code)
                            ? '#f5f7fb'
                            : '#ffffff',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            checked={roleForm.permissions.includes(permission.code)}
                            onChange={() => handleToggleRolePermission(permission.code)}
                            type="checkbox"
                          />
                          <strong style={{ fontSize: 14 }}>{permission.name}</strong>
                        </span>
                        <span style={{ color: '#5f6b7a', fontSize: 13 }}>{permission.code}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    disabled={
                      isSaving ||
                      (!editingRoleId && !canCreateRoles) ||
                      (Boolean(editingRoleId) && !canUpdateRoles)
                    }
                    style={primaryButtonStyle}
                    type="submit"
                  >
                    {isSaving
                      ? 'Guardando...'
                      : editingRoleId
                        ? 'Guardar cambios'
                        : 'Crear rol'}
                  </button>
                  {editingRoleId ? (
                    <button
                      disabled={isSaving}
                      onClick={handleCancelRoleEdit}
                      style={secondaryButtonStyle}
                      type="button"
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </form>
            </Panel>
            ) : null}

            {!isCreateMode && activeTab === 'users' && canReadUsers ? (
            <Panel
              title="Usuarios"
              subtitle="Inventario operativo con edicion, filtros y borrado controlado."
              action={
                canCreateUsers ? (
                  <Link to="/admin/users/new" style={secondaryLinkStyle}>
                    Nuevo usuario
                  </Link>
                ) : undefined
              }
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="sigi-filter-bar sigi-filter-bar--users">
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar por nombre, correo, institucion o rol"
                    style={inputStyle}
                  />
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as 'all' | User['status'])
                    }
                    style={inputStyle}
                  >
                    <option value="all">Todos los estados</option>
                    <option value="active">Activos</option>
                    <option value="pending">Pendientes</option>
                    <option value="inactive">Inactivos</option>
                  </select>
                </div>

                <DataTable rows={visibleUsers} rowKey={(user) => user.id} empty="No hay usuarios que coincidan con los filtros actuales." columns={[
                  { id: 'user', header: 'Usuario', cell: (user) => <div className="sigi-table-primary"><strong>{user.displayName}</strong><span>{user.email}</span></div>, sortValue: (user) => user.displayName },
                  { id: 'institution', header: 'Institución', cell: (user) => user.institutionName ?? 'Sin alcance', sortValue: (user) => user.institutionName },
                  { id: 'roles', header: 'Roles', cell: (user) => user.roles?.length ? user.roles.join(', ') : 'Sin asignación' },
                  { id: 'access', header: 'Acceso', cell: (user) => user.hasPassword ? 'Credenciales activas' : 'Sin password' },
                  { id: 'status', header: 'Estado', cell: (user) => <StatusBadge status={user.status} /> },
                  { id: 'actions', header: 'Acciones', cell: (user) => <RowActions label={`Acciones de ${user.displayName}`}><button disabled={!canUpdateUsers} onClick={() => handleStartEdit(user)} type="button">Editar</button><button disabled={deletingUserId === user.id || !canDeleteUsers} onClick={() => void handleDelete(user)} className="is-danger" type="button">{deletingUserId === user.id ? 'Eliminando…' : 'Eliminar'}</button></RowActions> },
                ]} />
              </div>
            </Panel>
            ) : null}

            {!isCreateMode && activeTab === 'roles' && canReadRoles ? (
            <Panel
              title="Catalogo de roles"
              subtitle="Perfiles con permisos efectivos editables desde la base de datos."
            >
              <DataTable rows={roles} rowKey={(role) => role.id} empty="No hay roles definidos." columns={[
                { id: 'role', header: 'Rol', cell: (role) => <div className="sigi-table-primary"><strong>{role.name}</strong><span>{role.code}{protectedRoleCodes.has(role.code) ? ' · Rol base' : ''}</span></div>, sortValue: (role) => role.name },
                { id: 'users', header: 'Usuarios', cell: (role) => users.filter((user) => user.roles?.includes(role.code)).length, sortValue: (role) => users.filter((user) => user.roles?.includes(role.code)).length },
                { id: 'permissions', header: 'Permisos', cell: (role) => role.permissions?.length ?? 0, sortValue: (role) => role.permissions?.length ?? 0 },
                { id: 'scope', header: 'Detalle', cell: (role) => <span title={role.permissions?.map((permission) => permission.code).join(', ')}>{role.permissions?.length ? 'Ver permisos al editar' : 'Sin permisos asignados'}</span> },
                { id: 'actions', header: 'Acciones', cell: (role) => <RowActions label={`Acciones de ${role.name}`}><button disabled={!canUpdateRoles} onClick={() => handleStartEditRole(role)} type="button">Editar</button><button disabled={deletingRoleId === role.id || protectedRoleCodes.has(role.code) || !canDeleteRoles} onClick={() => void handleDeleteRole(role)} className="is-danger" type="button">{deletingRoleId === role.id ? 'Eliminando…' : 'Eliminar'}</button></RowActions> },
              ]} />
            </Panel>
            ) : null}

            {!isCreateMode && activeTab === 'governance' && canReadUsers ? (
            <Panel
              title="Lectura de gobernanza"
              subtitle="Resumen corto para coordinacion operativa."
            >
              <DetailList
                items={[
                  { label: 'Usuarios activos', value: String(activeUsers) },
                  { label: 'Usuarios con institucion', value: String(scopedUsers) },
                  { label: 'Roles disponibles', value: String(roles.length) },
                  { label: 'Usuarios sin rol', value: String(usersWithoutRoles) },
                ]}
              />
            </Panel>
            ) : null}
          </PanelGrid>
        </>
      ) : (
        <MessageBlock>
          No hay usuarios ni roles cargados en este entorno. Conviene validar seed, migraciones y aprovisionamiento de accesos antes de salir a produccion.
        </MessageBlock>
      )}
    </section>
  );
}

const inputStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 12,
  padding: '11px 14px',
  fontSize: 14,
  background: '#ffffff',
};

const primaryButtonStyle = {
  border: 'none',
  borderRadius: 12,
  padding: '11px 16px',
  background: '#0b4f3a',
  color: '#ffffff',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 12,
  padding: '11px 16px',
  background: '#ffffff',
  color: '#10233f',
  fontWeight: 600,
  cursor: 'pointer',
};

const dangerButtonStyle = {
  border: '1px solid #f3c7c2',
  borderRadius: 12,
  padding: '11px 16px',
  background: '#fdecea',
  color: '#b42318',
  fontWeight: 600,
  cursor: 'pointer',
};

const primaryLinkStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: 12,
  padding: '11px 16px',
  background: '#0b4f3a',
  color: '#ffffff',
  fontWeight: 700,
  textDecoration: 'none',
};

const secondaryLinkStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #d7dde5',
  borderRadius: 12,
  padding: '11px 16px',
  background: '#ffffff',
  color: '#10233f',
  fontWeight: 600,
  textDecoration: 'none',
};

const tabButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '10px 16px',
  background: '#ffffff',
  color: '#10233f',
  fontWeight: 700,
  cursor: 'pointer',
};

const activeTabButtonStyle = {
  ...tabButtonStyle,
  background: '#0b4f3a',
  border: '1px solid #0b4f3a',
  color: '#ffffff',
};

const tabLinkStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '10px 16px',
  background: '#ffffff',
  color: '#10233f',
  fontWeight: 700,
  textDecoration: 'none',
};

const activeTabLinkStyle = {
  ...tabLinkStyle,
  background: '#0b4f3a',
  border: '1px solid #0b4f3a',
  color: '#ffffff',
};
