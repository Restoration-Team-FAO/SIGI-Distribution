import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DocumentFile, DocumentFolder, Institution, Project } from '@sigi/domain';
import { workspaceApi } from '../services/api';
import { useEgi } from '../contexts/EgiContext';
import { hasPermission } from '../utils/permissions';
import {
  DetailList,
  MessageBlock,
  Panel,
  StatPill,
} from '../components/section-kit';
import { DataWorkspaceHeader } from '../components/DataWorkspaceHeader';
import { ActivityList, CompactList } from '../components/data-display';

type CreateFolderState = {
  name: string;
  description: string;
  visibility: string;
};

type MetadataFormState = {
  title: string;
  description: string;
  confidentialityLevel: string;
  validationStatus: string;
  isPublic: boolean;
  country: string;
  department: string;
  municipality: string;
  thematicArea: string;
  documentType: string;
  dataOwner: string;
  technicalCustodian: string;
  license: string;
  retentionPolicy: string;
  spatialReference: string;
  geometryType: string;
  metadataJson: string;
};

const initialFolderState: CreateFolderState = {
  name: '',
  description: '',
  visibility: 'internal',
};

const initialMetadataForm: MetadataFormState = {
  title: '',
  description: '',
  confidentialityLevel: 'internal',
  validationStatus: 'draft',
  isPublic: false,
  country: '',
  department: '',
  municipality: '',
  thematicArea: '',
  documentType: '',
  dataOwner: '',
  technicalCustodian: '',
  license: '',
  retentionPolicy: '',
  spatialReference: '',
  geometryType: '',
  metadataJson: '{}',
};

export function FilesExplorerPage() {
  const [searchParams] = useSearchParams();
  const requestedFileId = searchParams.get('fileId');
  const requestedQuery = searchParams.get('q');
  const { activeEgi, activeEgiId, currentUser, globalViewScope } = useEgi();
  const canReadInstitutions = hasPermission(currentUser, 'institutions.read');
  const canReadProjects = hasPermission(currentUser, 'projects.read');
  const canReadReports = hasPermission(currentUser, 'reports.read');
  const canCreateFiles = hasPermission(currentUser, 'files.create');
  const canUpdateFiles = hasPermission(currentUser, 'files.update');
  const canDeleteFiles = hasPermission(currentUser, 'files.delete');
  const canDownloadFiles = hasPermission(currentUser, 'files.download');
  const canShareFiles = hasPermission(currentUser, 'files.share');
  const [tree, setTree] = useState<DocumentFolder[]>([]);
  const [rootFolders, setRootFolders] = useState<DocumentFolder[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<DocumentFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DocumentFile | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [folderForm, setFolderForm] = useState<CreateFolderState>(initialFolderState);
  const [metadataForm, setMetadataForm] = useState<MetadataFormState>(initialMetadataForm);
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') ?? '');
  const [entityType, setEntityType] = useState('project');
  const [entityId, setEntityId] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState<'folder' | 'upload'>('folder');
  const [detailTab, setDetailTab] = useState<'overview' | 'metadata' | 'history' | 'links'>('overview');
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const totalFiles = files.length;
  const totalFolders = tree.length;
  const geospatialFiles = useMemo(
    () => files.filter((file) => file.isGeospatial).length,
    [files],
  );

  async function loadExplorer(folderId: string | null, query?: string) {
    setIsLoading(true);
    setError(null);
    try {
      const [treeResponse, institutionsResponse, projectsResponse] = await Promise.all([
        workspaceApi.getFilesTree(),
        canReadInstitutions ? workspaceApi.getInstitutions() : Promise.resolve(null),
        canReadProjects ? workspaceApi.getProjects({ visibility: 'all' }) : Promise.resolve(null),
      ]);

      setTree(treeResponse.data.folders);
      setRootFolders(treeResponse.data.rootFolders);
      setInstitutions(institutionsResponse?.data.institutions ?? []);
      setProjects(projectsResponse?.data.projects ?? []);

      if (query?.trim()) {
        const searchResponse = await workspaceApi.searchFiles({
          q: query.trim(),
          folderId: folderId ?? undefined,
        });
        setFolders([]);
        setFiles(searchResponse.data.files);
        setBreadcrumb([]);
      } else {
        const folderResponse = folderId
          ? await workspaceApi.getFolderItems(folderId)
          : await workspaceApi.getRootFolderItems();
        setFolders(folderResponse.data.folders);
        setFiles(folderResponse.data.files);
        setBreadcrumb(folderResponse.data.breadcrumb);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadExplorer(selectedFolderId, searchTerm);
  }, [canReadInstitutions, canReadProjects, searchTerm, selectedFolderId]);

  useEffect(() => {
    if (requestedQuery !== null) setSearchTerm(requestedQuery);
  }, [requestedQuery]);

  useEffect(() => {
    if (requestedFileId && files.some((file) => file.id === requestedFileId)
      && selectedFile?.id !== requestedFileId) {
      void handleSelectFile(requestedFileId);
    }
  }, [files, requestedFileId, selectedFile?.id]);

  function syncMetadataForm(file: DocumentFile | null) {
    if (!file) {
      setMetadataForm(initialMetadataForm);
      return;
    }

    setMetadataForm({
      title: file.title ?? '',
      description: file.description ?? '',
      confidentialityLevel: file.confidentialityLevel,
      validationStatus: file.validationStatus,
      isPublic: file.isPublic,
      country: file.metadata?.country ?? '',
      department: file.metadata?.department ?? '',
      municipality: file.metadata?.municipality ?? '',
      thematicArea: file.metadata?.thematicArea ?? '',
      documentType: file.metadata?.documentType ?? '',
      dataOwner: file.metadata?.dataOwner ?? '',
      technicalCustodian: file.metadata?.technicalCustodian ?? '',
      license: file.metadata?.license ?? '',
      retentionPolicy: file.metadata?.retentionPolicy ?? '',
      spatialReference: file.metadata?.spatialReference ?? '',
      geometryType: file.metadata?.geometryType ?? '',
      metadataJson: JSON.stringify(file.metadata?.metadata ?? {}, null, 2),
    });
  }

  async function handleSelectFile(fileId: string) {
    setError(null);
    try {
      const response = await workspaceApi.getFileDetail(fileId);
      setSelectedFile(response.data.file);
      syncMetadataForm(response.data.file);
      setDetailTab('overview');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function handleCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingFolder(true);
    setError(null);
    setNotice(null);
    try {
      await workspaceApi.createFolder({
        parentId: selectedFolderId,
        name: folderForm.name.trim(),
        description: folderForm.description.trim() || null,
        visibility: folderForm.visibility,
      });
      setFolderForm(initialFolderState);
      setNotice('Carpeta creada correctamente.');
      await loadExplorer(selectedFolderId, searchTerm);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSavingFolder(false);
    }
  }

  async function handleUploadFile(file: File | null) {
    if (!file) {
      return;
    }
    setIsUploading(true);
    setError(null);
    setNotice(null);
    try {
      await workspaceApi.uploadFile({
        file,
        folderId: selectedFolderId,
        title: file.name,
      });
      setNotice(`Archivo ${file.name} cargado correctamente.`);
      await loadExplorer(selectedFolderId, searchTerm);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownloadSelected() {
    if (!selectedFile) {
      return;
    }
    setError(null);
    try {
      const result = await workspaceApi.downloadFile(selectedFile.id);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function handleSaveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }
    setIsSavingMetadata(true);
    setError(null);
    setNotice(null);
    try {
      const parsedMetadata = JSON.parse(metadataForm.metadataJson) as Record<string, unknown>;
      await workspaceApi.updateFileMetadata(selectedFile.id, {
        title: metadataForm.title,
        description: metadataForm.description,
        confidentialityLevel: metadataForm.confidentialityLevel,
        validationStatus: metadataForm.validationStatus,
        isPublic: metadataForm.isPublic,
        country: metadataForm.country,
        department: metadataForm.department,
        municipality: metadataForm.municipality,
        thematicArea: metadataForm.thematicArea,
        documentType: metadataForm.documentType,
        dataOwner: metadataForm.dataOwner,
        technicalCustodian: metadataForm.technicalCustodian,
        license: metadataForm.license,
        retentionPolicy: metadataForm.retentionPolicy,
        spatialReference: metadataForm.spatialReference,
        geometryType: metadataForm.geometryType,
        metadata: parsedMetadata,
      });
      const refreshed = await workspaceApi.getFileDetail(selectedFile.id);
      setSelectedFile(refreshed.data.file);
      syncMetadataForm(refreshed.data.file);
      setNotice('Metadatos actualizados correctamente.');
      await loadExplorer(selectedFolderId, searchTerm);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSavingMetadata(false);
    }
  }

  async function handleCreateVersion(file: File | null) {
    if (!selectedFile || !file) {
      return;
    }
    setIsCreatingVersion(true);
    setError(null);
    setNotice(null);
    try {
      await workspaceApi.createFileVersion(selectedFile.id, {
        file,
        changeNote: 'Nueva version cargada desde explorador documental.',
      });
      const refreshed = await workspaceApi.getFileDetail(selectedFile.id);
      setSelectedFile(refreshed.data.file);
      syncMetadataForm(refreshed.data.file);
      setNotice('Nueva version creada correctamente.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsCreatingVersion(false);
    }
  }

  async function handleLinkFile() {
    if (!selectedFile || !entityId.trim()) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await workspaceApi.linkFile(selectedFile.id, {
        entityType,
        entityId: entityId.trim(),
        relationType: 'related',
      });
      const refreshed = await workspaceApi.getFileDetail(selectedFile.id);
      setSelectedFile(refreshed.data.file);
      setNotice('Vinculacion registrada correctamente.');
      setEntityId('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function handleDeleteFile() {
    if (!selectedFile) {
      return;
    }
    const confirmed = window.confirm(`¿Eliminar logicamente ${selectedFile.name}?`);
    if (!confirmed) {
      return;
    }
    try {
      await workspaceApi.deleteFile(selectedFile.id);
      setSelectedFile(null);
      syncMetadataForm(null);
      setDetailTab('overview');
      setNotice('Archivo eliminado logicamente.');
      await loadExplorer(selectedFolderId, searchTerm);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const selectedFolderLabel = breadcrumb[breadcrumb.length - 1]?.name ?? 'Raiz documental';
  const selectedCountLabel = selectedFile
    ? `1 archivo seleccionado`
    : `${folders.length} carpeta(s) · ${files.length} archivo(s)`;

  return (
    <section>
      <DataWorkspaceHeader description="Documentos, carpetas, versiones y metadatos del EGI dentro del mismo recorrido operativo de Datos." />

      <Panel
        title="Contexto EGI"
        subtitle="El árbol documental y sus operaciones se entienden dentro del EGI activo para mantener archivos, vínculos y metadatos dentro del mismo espacio de gestión."
        action={
          <StatPill tone={activeEgiId ? 'good' : 'warn'}>
            {globalViewScope === 'global' ? 'Vista global' : 'EGI activo'}
          </StatPill>
        }
      >
        <DetailList
          items={[
            { label: 'EGI activo', value: activeEgi?.name ?? 'Sin EGI seleccionado' },
            { label: 'Código', value: activeEgi?.code ?? 'n/d' },
            {
              label: 'Alcance',
              value:
                globalViewScope === 'global'
                  ? 'Consolidado global autorizado'
                  : 'Operación documental del EGI activo',
            },
          ]}
        />
      </Panel>

      {error ? <MessageBlock tone="danger">{error}</MessageBlock> : null}
      {notice ? <MessageBlock>{notice}</MessageBlock> : null}

      <div style={desktopStatsStyle}>
        <MiniStat label="Carpetas" value={String(totalFolders)} />
        <MiniStat label="Archivos" value={String(totalFiles)} />
        <MiniStat label="Geoespaciales" value={String(geospatialFiles)} />
        <MiniStat label="Seleccion" value={selectedFile ? '1' : '0'} />
      </div>

      <div style={desktopWindowStyle}>
        <div style={desktopWindowChromeStyle}>
          <div style={desktopWindowDotsStyle}>
            <span style={{ ...desktopDotStyle, background: '#ffb84d' }} />
            <span style={{ ...desktopDotStyle, background: '#66c27c' }} />
            <span style={{ ...desktopDotStyle, background: '#6aa7ff' }} />
          </div>
          <div style={desktopWindowTitleStyle}>
            Explorador SIGI · {selectedFolderLabel}
          </div>
          <div style={desktopWindowMetaStyle}>
            {selectedFile?.title ?? selectedFile?.name ?? 'Sin seleccion'}
          </div>
        </div>

        <div style={desktopToolbarStyle}>
          <FileToolbar
            canCreateFiles={canCreateFiles}
            canUpdateFiles={canUpdateFiles}
            canDeleteFiles={canDeleteFiles}
            canDownloadFiles={canDownloadFiles}
            isUploading={isUploading}
            isCreatingVersion={isCreatingVersion}
            selectedFile={selectedFile}
            onUpload={handleUploadFile}
            onCreateVersion={handleCreateVersion}
            onDownload={handleDownloadSelected}
            onDelete={handleDeleteFile}
          />
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>

        <div style={desktopCommandStripStyle}>
          <FileBreadcrumb
            breadcrumb={breadcrumb}
            onSelect={(folderId) => {
              setSelectedFolderId(folderId);
              setSelectedFile(null);
            }}
          />
          <FileSearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar en esta ubicacion"
          />
        </div>

        <div style={desktopBodyStyle}>
          <aside style={desktopSidebarPaneStyle}>
            <div style={paneHeaderStyle}>
              <div style={{ display: 'grid', gap: 2 }}>
                <strong style={paneTitleStyle}>Carpetas</strong>
                <span style={metaTextStyle}>Arbol lateral</span>
              </div>
              <StatPill tone="neutral">{rootFolders.length} raices</StatPill>
            </div>
            <ExplorerStatusBar
              folderLabel={selectedFolderLabel}
              statusLabel={selectedCountLabel}
              selectedFile={selectedFile}
            />
            <div style={{ marginTop: 14 }}>
              <FolderTree
                folders={tree}
                rootFolders={rootFolders}
                selectedFolderId={selectedFolderId}
                onSelectFolder={(folderId) => {
                  setSelectedFolderId(folderId);
                  setSelectedFile(null);
                }}
              />
            </div>
          </aside>

          <main style={desktopCenterPaneStyle}>
            <div style={desktopInventoryFrameStyle}>
              <div style={desktopInventoryHeaderStyle}>
                <div style={{ display: 'grid', gap: 2 }}>
                  <strong style={paneTitleStyle}>{selectedFolderLabel}</strong>
                  <span style={metaTextStyle}>{folders.length} carpeta(s) · {files.length} archivo(s)</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <StatPill tone="neutral">{viewMode === 'list' ? 'Vista lista' : 'Vista tarjetas'}</StatPill>
                  {selectedFile ? <StatPill tone="good">Archivo activo</StatPill> : null}
                </div>
              </div>

              {viewMode === 'list' ? (
                <div style={tableHeaderStyle}>
                  <span>Nombre</span>
                  <span>Tipo</span>
                  <span>Tamano</span>
                  <span>Estado</span>
                </div>
              ) : null}

              {isLoading ? <MessageBlock>Cargando estructura documental...</MessageBlock> : null}
              {!isLoading && folders.length === 0 && files.length === 0 ? (
                <MessageBlock>No hay carpetas o archivos para esta vista.</MessageBlock>
              ) : null}
              {!isLoading ? (
                <FileTable
                  folders={folders}
                  files={files}
                  selectedFileId={selectedFile?.id ?? null}
                  viewMode={viewMode}
                  onOpenFolder={(folderId) => {
                    setSelectedFolderId(folderId);
                    setSelectedFile(null);
                  }}
                  onOpenFile={(fileId) => void handleSelectFile(fileId)}
                />
              ) : null}
            </div>
          </main>

          <aside style={desktopRightPaneStyle}>
            <div style={paneHeaderStyle}>
              <div style={{ display: 'grid', gap: 2 }}>
                <strong style={paneTitleStyle}>Inspector</strong>
                <span style={metaTextStyle}>Acciones y detalle</span>
              </div>
              {selectedFile ? (
                <StatPill tone={selectedFile.isPublic ? 'good' : 'warn'}>
                  {selectedFile.isPublic ? 'Publico' : 'Interno'}
                </StatPill>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <WorkspaceTabs value={workspaceTab} onChange={setWorkspaceTab} />
              {workspaceTab === 'folder' ? (
                <CreateFolderDialog
                  disabled={!canCreateFiles}
                  value={folderForm}
                  isSaving={isSavingFolder}
                  parentLabel={selectedFolderLabel}
                  onChange={setFolderForm}
                  onSubmit={handleCreateFolder}
                />
              ) : (
                <UploadDialog disabled={!canCreateFiles} isUploading={isUploading} onPickFile={handleUploadFile} />
              )}
            </div>

            <div style={{ height: 1, background: '#e6edf2', margin: '18px 0' }} />

            {!selectedFile ? (
              <EmptyInspector folderLabel={selectedFolderLabel} />
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                <DetailTabs value={detailTab} onChange={setDetailTab} />
                {detailTab === 'overview' ? (
                  <>
                    <FileDetailsPanel file={selectedFile} onDownload={handleDownloadSelected} canReadReports={canReadReports} />
                    <FileVersionDialog versions={selectedFile.versions ?? []} compact />
                  </>
                ) : null}
                {detailTab === 'metadata' ? (
                  <MetadataEditor
                    disabled={!canUpdateFiles}
                    value={metadataForm}
                    isSaving={isSavingMetadata}
                    onChange={setMetadataForm}
                    onSubmit={handleSaveMetadata}
                  />
                ) : null}
                {detailTab === 'history' ? (
                  <>
                    <FileVersionDialog versions={selectedFile.versions ?? []} />
                    <FileAuditPanel fileId={selectedFile.id} />
                  </>
                ) : null}
                {detailTab === 'links' ? (
                  <FileLinksPanel
                    disabled={!canShareFiles}
                    entityType={entityType}
                    entityId={entityId}
                    institutions={institutions}
                    projects={projects}
                    file={selectedFile}
                    onEntityTypeChange={setEntityType}
                    onEntityIdChange={setEntityId}
                    onSubmit={() => void handleLinkFile()}
                  />
                ) : null}
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

function FolderTree(props: {
  folders: DocumentFolder[];
  rootFolders: DocumentFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
}) {
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, DocumentFolder[]>();
    props.folders.forEach((folder) => {
      const key = folder.parentId ?? null;
      const current = map.get(key) ?? [];
      current.push(folder);
      map.set(key, current);
    });
    return map;
  }, [props.folders]);

  function renderBranch(parentId: string | null, depth: number): JSX.Element[] {
    return (childrenByParent.get(parentId) ?? [])
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((folder) => (
        <div key={folder.id} style={{ display: 'grid', gap: 6 }}>
          <button
            type="button"
            onClick={() => props.onSelectFolder(folder.id)}
            style={{
              ...treeButtonStyle,
              marginLeft: depth * 14,
              background: props.selectedFolderId === folder.id ? '#e7f1ec' : '#ffffff',
              borderColor: props.selectedFolderId === folder.id ? '#0b4f3a' : '#d7dde5',
            }}
          >
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <strong>{folder.name}</strong>
              <span style={folderCountStyle}>{folder.childFolderCount ?? 0}</span>
            </span>
            <span style={{ color: '#5f6b7a', fontSize: 12 }}>{folder.fileCount ?? 0} archivo(s)</span>
          </button>
          {renderBranch(folder.id, depth + 1)}
        </div>
      ));
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <button
        type="button"
        onClick={() => props.onSelectFolder(null)}
        style={{
          ...treeButtonStyle,
          background: props.selectedFolderId === null ? '#e7f1ec' : '#ffffff',
          borderColor: props.selectedFolderId === null ? '#0b4f3a' : '#d7dde5',
        }}
      >
        <strong>Raiz documental</strong>
        <span style={{ color: '#5f6b7a', fontSize: 12 }}>{props.rootFolders.length} carpeta(s)</span>
      </button>
      {renderBranch(null, 0)}
    </div>
  );
}

function FileToolbar(props: {
  canCreateFiles: boolean;
  canUpdateFiles: boolean;
  canDeleteFiles: boolean;
  canDownloadFiles: boolean;
  isUploading: boolean;
  isCreatingVersion: boolean;
  selectedFile: DocumentFile | null;
  onUpload: (file: File | null) => void;
  onCreateVersion: (file: File | null) => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <label style={primaryButtonStyle}>
        {props.isUploading ? 'Subiendo...' : 'Subir'}
        <input
          type="file"
          hidden
          disabled={!props.canCreateFiles}
          onChange={(event) => props.onUpload(event.target.files?.[0] ?? null)}
        />
      </label>
      <label style={{ ...secondaryButtonStyle, opacity: props.selectedFile ? 1 : 0.55 }}>
        {props.isCreatingVersion ? 'Versionando...' : 'Nueva version'}
        <input
          type="file"
          hidden
          disabled={!props.selectedFile || !props.canUpdateFiles}
          onChange={(event) => props.onCreateVersion(event.target.files?.[0] ?? null)}
        />
      </label>
      <button type="button" onClick={props.onDownload} disabled={!props.selectedFile || !props.canDownloadFiles} style={secondaryButtonStyle}>
        Descargar
      </button>
      <button type="button" onClick={props.onDelete} disabled={!props.selectedFile || !props.canDeleteFiles} style={dangerButtonStyle}>
        Eliminar
      </button>
    </div>
  );
}

function FileBreadcrumb(props: {
  breadcrumb: DocumentFolder[];
  onSelect: (folderId: string | null) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => props.onSelect(null)} style={crumbStyle}>
        Raiz
      </button>
      {props.breadcrumb.map((item) => (
        <button key={item.id} type="button" onClick={() => props.onSelect(item.id)} style={crumbStyle}>
          {item.name}
        </button>
      ))}
    </div>
  );
}

function FileSearchBar(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      style={{ ...inputStyle, minWidth: 260, flex: '0 1 360px' }}
    />
  );
}

function MiniStat(props: { label: string; value: string }) {
  return (
    <div style={miniStatStyle}>
      <span style={miniStatLabelStyle}>{props.label}</span>
      <strong style={miniStatValueStyle}>{props.value}</strong>
    </div>
  );
}

function ViewModeToggle(props: {
  value: 'list' | 'cards';
  onChange: (value: 'list' | 'cards') => void;
}) {
  return (
    <div style={viewToggleStyle}>
      <button
        type="button"
        onClick={() => props.onChange('list')}
        style={{ ...viewToggleButtonStyle, ...(props.value === 'list' ? activeViewToggleButtonStyle : null) }}
      >
        Lista
      </button>
      <button
        type="button"
        onClick={() => props.onChange('cards')}
        style={{ ...viewToggleButtonStyle, ...(props.value === 'cards' ? activeViewToggleButtonStyle : null) }}
      >
        Tarjetas
      </button>
    </div>
  );
}

function ExplorerStatusBar(props: {
  folderLabel: string;
  statusLabel: string;
  selectedFile: DocumentFile | null;
}) {
  return (
    <div style={statusBarStyle}>
      <div style={{ display: 'grid', gap: 2 }}>
        <strong style={{ color: '#10233f', fontSize: 14 }}>{props.folderLabel}</strong>
        <span style={metaTextStyle}>{props.statusLabel}</span>
      </div>
      {props.selectedFile ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatPill tone="neutral">{(props.selectedFile.extension ?? 'sin ext').toUpperCase()}</StatPill>
          <StatPill tone={props.selectedFile.validationStatus === 'approved' ? 'good' : 'warn'}>
            {props.selectedFile.validationStatus}
          </StatPill>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceTabs(props: {
  value: 'folder' | 'upload';
  onChange: (value: 'folder' | 'upload') => void;
}) {
  return (
    <div style={tabRailStyle}>
      <button
        type="button"
        onClick={() => props.onChange('folder')}
        style={{
          ...tabButtonStyle,
          ...(props.value === 'folder' ? activeTabButtonStyle : null),
        }}
      >
        Nueva carpeta
      </button>
      <button
        type="button"
        onClick={() => props.onChange('upload')}
        style={{
          ...tabButtonStyle,
          ...(props.value === 'upload' ? activeTabButtonStyle : null),
        }}
      >
        Carga rapida
      </button>
    </div>
  );
}

function DetailTabs(props: {
  value: 'overview' | 'metadata' | 'history' | 'links';
  onChange: (value: 'overview' | 'metadata' | 'history' | 'links') => void;
}) {
  return (
    <div style={tabRailStyle}>
      <button
        type="button"
        onClick={() => props.onChange('overview')}
        style={{ ...tabButtonStyle, ...(props.value === 'overview' ? activeTabButtonStyle : null) }}
      >
        Resumen
      </button>
      <button
        type="button"
        onClick={() => props.onChange('metadata')}
        style={{ ...tabButtonStyle, ...(props.value === 'metadata' ? activeTabButtonStyle : null) }}
      >
        Metadatos
      </button>
      <button
        type="button"
        onClick={() => props.onChange('history')}
        style={{ ...tabButtonStyle, ...(props.value === 'history' ? activeTabButtonStyle : null) }}
      >
        Historial
      </button>
      <button
        type="button"
        onClick={() => props.onChange('links')}
        style={{ ...tabButtonStyle, ...(props.value === 'links' ? activeTabButtonStyle : null) }}
      >
        Relaciones
      </button>
    </div>
  );
}

function FileTable(props: {
  folders: DocumentFolder[];
  files: DocumentFile[];
  selectedFileId: string | null;
  viewMode: 'list' | 'cards';
  onOpenFolder: (folderId: string) => void;
  onOpenFile: (fileId: string) => void;
}) {
  if (props.viewMode === 'cards') {
    return (
      <div style={cardGridStyle}>
        {props.folders.map((folder) => (
          <button key={folder.id} type="button" onClick={() => props.onOpenFolder(folder.id)} style={itemCardStyle}>
            <div style={{ ...itemCardIconStyle, background: '#fff4d8', color: '#9a6700' }}>▣</div>
            <div style={nameTextWrapStyle}>
              <strong style={primaryFileTextStyle}>{folder.name}</strong>
              <span style={metaTextStyle}>Carpeta</span>
              <span style={metaTextStyle}>{folder.fileCount ?? 0} archivo(s)</span>
            </div>
          </button>
        ))}
        {props.files.map((file) => (
          <button
            key={file.id}
            type="button"
            onClick={() => props.onOpenFile(file.id)}
            style={{
              ...itemCardStyle,
              background: props.selectedFileId === file.id ? '#edf5ff' : '#ffffff',
              borderColor: props.selectedFileId === file.id ? '#355070' : '#e6edf2',
            }}
          >
            <div style={itemCardIconStyle}>{readFileGlyph(file.extension)}</div>
            <div style={nameTextWrapStyle}>
              <strong style={primaryFileTextStyle}>{file.title ?? file.name}</strong>
              <span style={metaTextStyle}>{(file.extension ?? 'sin ext').toUpperCase()}</span>
              <span style={metaTextStyle}>{formatSize(file.sizeBytes)}</span>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {props.folders.map((folder) => (
        <button key={folder.id} type="button" onClick={() => props.onOpenFolder(folder.id)} style={rowButtonStyle}>
          <div style={nameCellStyle}>
            <span style={folderGlyphStyle}>▣</span>
            <div style={nameTextWrapStyle}>
              <strong style={primaryFileTextStyle}>{folder.name}</strong>
              <span style={secondaryFileTextStyle}>Carpeta</span>
            </div>
          </div>
          <span style={rowMutedStyle}>Folder</span>
          <span style={rowMutedStyle}>-</span>
          <span style={rowMutedStyle}>{folder.fileCount ?? 0} archivo(s)</span>
        </button>
      ))}
      {props.files.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => props.onOpenFile(file.id)}
          style={{
            ...rowButtonStyle,
            background: props.selectedFileId === file.id ? '#edf5ff' : '#ffffff',
            borderColor: props.selectedFileId === file.id ? '#355070' : '#edf1f5',
          }}
        >
          <div style={nameCellStyle}>
            <span style={fileGlyphStyle}>{readFileGlyph(file.extension)}</span>
            <div style={nameTextWrapStyle}>
              <strong style={primaryFileTextStyle}>{file.title ?? file.name}</strong>
              <span style={secondaryFileTextStyle}>{file.name}</span>
            </div>
          </div>
          <span style={rowMutedStyle}>{(file.extension ?? 'sin ext').toUpperCase()}</span>
          <span style={rowMutedStyle}>{formatSize(file.sizeBytes)}</span>
          <span style={rowMutedStyle}>{file.validationStatus}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyInspector(props: { folderLabel: string }) {
  return (
    <div style={emptyInspectorStyle}>
      <div style={emptyInspectorIconStyle}>⌘</div>
      <strong style={{ fontSize: 17, color: '#10233f' }}>Sin archivo seleccionado</strong>
      <span style={{ color: '#5f6b7a', textAlign: 'center', lineHeight: 1.5 }}>
        Navega en <strong>{props.folderLabel}</strong>, abre un archivo desde el listado central y aquí verás su ficha, metadatos, versiones y asociaciones.
      </span>
    </div>
  );
}

function FileDetailsPanel(props: { file: DocumentFile; onDownload: () => void; canReadReports: boolean }) {
  return (
    <Panel
      title={props.file.title ?? props.file.name}
      subtitle={props.file.description ?? 'Sin descripcion funcional registrada.'}
      action={<button type="button" onClick={props.onDownload} style={secondaryButtonStyle}>Descargar</button>}
      tone="good"
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatPill tone="neutral">{(props.file.extension ?? 'sin ext').toUpperCase()}</StatPill>
          <StatPill tone="neutral">{formatSize(props.file.sizeBytes)}</StatPill>
          <StatPill tone={props.file.validationStatus === 'approved' ? 'good' : 'warn'}>
            {props.file.validationStatus}
          </StatPill>
        </div>
        <DetailList
          items={[
            { label: 'Nombre fisico', value: props.file.name },
            { label: 'Ruta carpeta', value: props.file.folderPath ?? 'Raiz' },
            { label: 'Institucion', value: props.file.institutionName ?? 'Sin institucion' },
            { label: 'Proyecto', value: props.file.projectTitle ?? 'Sin proyecto' },
            { label: 'Checksum', value: props.file.checksumSha256 ?? 'n/d' },
          ]}
        />
        {props.canReadReports ? <Link to={`/admin/reports/history?documentId=${encodeURIComponent(props.file.id)}`}>Buscar este documento en Informes</Link> : null}
      </div>
    </Panel>
  );
}

function MetadataEditor(props: {
  disabled?: boolean;
  value: MetadataFormState;
  isSaving: boolean;
  onChange: (value: MetadataFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const value = props.value;
  function patch<K extends keyof MetadataFormState>(key: K, nextValue: MetadataFormState[K]) {
    props.onChange({ ...value, [key]: nextValue });
  }

  return (
    <Panel title="Metadatos" subtitle="Edicion contextual del archivo abierto." icon="validation">
      <form onSubmit={props.onSubmit} style={{ display: 'grid', gap: 12 }}>
        <div style={formGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Titulo</span>
            <input disabled={props.disabled} value={value.title} onChange={(event) => patch('title', event.target.value)} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Confidencialidad</span>
            <select
              value={value.confidentialityLevel}
              disabled={props.disabled}
              onChange={(event) => patch('confidentialityLevel', event.target.value)}
              style={inputStyle}
            >
              <option value="internal">Internal</option>
              <option value="public">Public</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Estado validacion</span>
            <select
              value={value.validationStatus}
              disabled={props.disabled}
              onChange={(event) => patch('validationStatus', event.target.value)}
              style={inputStyle}
            >
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>
        <label style={fieldStyle}>
          <span style={labelStyle}>Descripcion</span>
          <textarea disabled={props.disabled} value={value.description} onChange={(event) => patch('description', event.target.value)} style={textareaStyle} />
        </label>
        <div style={formGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Pais</span>
            <input disabled={props.disabled} value={value.country} onChange={(event) => patch('country', event.target.value)} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Area tematica</span>
            <input disabled={props.disabled} value={value.thematicArea} onChange={(event) => patch('thematicArea', event.target.value)} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Tipo documental</span>
            <input disabled={props.disabled} value={value.documentType} onChange={(event) => patch('documentType', event.target.value)} style={inputStyle} />
          </label>
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#10233f', fontWeight: 600 }}>
          <input disabled={props.disabled} type="checkbox" checked={value.isPublic} onChange={(event) => patch('isPublic', event.target.checked)} />
          Exponer como documento publico
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Metadata JSON</span>
          <textarea disabled={props.disabled} value={value.metadataJson} onChange={(event) => patch('metadataJson', event.target.value)} style={{ ...textareaStyle, minHeight: 150 }} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" disabled={props.isSaving || props.disabled} style={primaryButtonStyle}>
            {props.isSaving ? 'Guardando...' : 'Guardar metadatos'}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function UploadDialog(props: { disabled?: boolean; isUploading: boolean; onPickFile: (file: File | null) => void }) {
  return (
    <div style={utilityCardStyle}>
      <div style={{ display: 'grid', gap: 6 }}>
        <strong style={{ fontSize: 16, color: '#10233f' }}>Carga rapida</strong>
        <span style={metaTextStyle}>
          Sube documentos al folder actual con una accion directa tipo explorador.
        </span>
      </div>
      <label style={primaryButtonStyle}>
        {props.isUploading ? 'Subiendo...' : 'Seleccionar archivo'}
        <input disabled={props.disabled} type="file" hidden onChange={(event) => props.onPickFile(event.target.files?.[0] ?? null)} />
      </label>
    </div>
  );
}

function CreateFolderDialog(props: {
  disabled?: boolean;
  value: CreateFolderState;
  parentLabel: string;
  isSaving: boolean;
  onChange: (value: CreateFolderState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={props.onSubmit} style={utilityCardStyle}>
      <div style={{ display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: 16, color: '#10233f' }}>Nueva carpeta</strong>
        <span style={metaTextStyle}>Crear dentro de: {props.parentLabel}</span>
      </div>
      <input
        disabled={props.disabled}
        value={props.value.name}
        onChange={(event) => props.onChange({ ...props.value, name: event.target.value })}
        placeholder="Nombre de carpeta"
        style={inputStyle}
        required
      />
      <textarea
        disabled={props.disabled}
        value={props.value.description}
        onChange={(event) => props.onChange({ ...props.value, description: event.target.value })}
        placeholder="Descripcion operativa"
        style={textareaStyle}
      />
      <select
        disabled={props.disabled}
        value={props.value.visibility}
        onChange={(event) => props.onChange({ ...props.value, visibility: event.target.value })}
        style={inputStyle}
      >
        <option value="internal">Internal</option>
        <option value="public">Public</option>
        <option value="restricted">Restricted</option>
      </select>
      <button type="submit" disabled={props.isSaving || props.disabled} style={primaryButtonStyle}>
        {props.isSaving ? 'Creando...' : 'Crear carpeta'}
      </button>
    </form>
  );
}

function FileVersionDialog(props: {
  versions: NonNullable<DocumentFile['versions']>;
  compact?: boolean;
}) {
  return (
    <Panel title="Versiones" subtitle="Historial basico del archivo abierto." icon="activity">
      <div>
        <CompactList empty="Sin versiones registradas todavía." items={props.versions.slice(0, props.compact ? 3 : props.versions.length).map((version) => ({ id: version.id, title: `v${version.versionNumber}`, meta: version.originalFilename, detail: formatSize(version.sizeBytes) }))} />
        {props.compact && props.versions.length > 3 ? (
          <span style={metaTextStyle}>Hay {props.versions.length - 3} version(es) adicionales en la pestana Historial.</span>
        ) : null}
      </div>
    </Panel>
  );
}

function FileAuditPanel(props: { fileId: string }) {
  const [audit, setAudit] = useState<Array<{ id: string; eventType: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    workspaceApi
      .getFileAudit(props.fileId)
      .then((response) =>
        setAudit(
          response.data.audit.map((entry) => ({
            id: entry.id,
            eventType: entry.eventType,
            createdAt: entry.createdAt,
          })),
        ),
      )
      .finally(() => setLoading(false));
  }, [props.fileId]);

  return (
    <Panel title="Auditoria" subtitle="Eventos de trazabilidad del documento." icon="audit">
      {loading ? <MessageBlock>Cargando auditoría...</MessageBlock> : <ActivityList empty="Sin eventos todavía." items={audit.map((entry) => ({ id: entry.id, event: entry.eventType, timestamp: entry.createdAt, actor: 'Sistema documental', status: 'success' }))} />}
    </Panel>
  );
}

function FileLinksPanel(props: {
  disabled?: boolean;
  entityType: string;
  entityId: string;
  institutions: Institution[];
  projects: Project[];
  file: DocumentFile;
  onEntityTypeChange: (value: string) => void;
  onEntityIdChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const linkableOptions =
    props.entityType === 'institution'
      ? props.institutions.map((institution) => ({ value: institution.id, label: institution.name }))
      : props.entityType === 'project'
        ? props.projects.map((project) => ({ value: project.id, label: project.title }))
        : [];

  return (
    <Panel title="Asociaciones" subtitle="Relacion del documento con entidades SIGI." icon="users">
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={formGridStyle}>
          <select disabled={props.disabled} value={props.entityType} onChange={(event) => props.onEntityTypeChange(event.target.value)} style={inputStyle}>
            <option value="project">Proyecto</option>
            <option value="institution">Institucion</option>
            <option value="territory">Mapa / cobertura</option>
            <option value="dataset">Dataset</option>
            <option value="indicator">Indicador</option>
            <option value="source">Fuente</option>
          </select>
          {linkableOptions.length > 0 ? (
            <select disabled={props.disabled} value={props.entityId} onChange={(event) => props.onEntityIdChange(event.target.value)} style={inputStyle}>
              <option value="">Selecciona destino</option>
              {linkableOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input disabled={props.disabled} value={props.entityId} onChange={(event) => props.onEntityIdChange(event.target.value)} placeholder="UUID entidad" style={inputStyle} />
          )}
          <button disabled={props.disabled} type="button" onClick={props.onSubmit} style={secondaryButtonStyle}>
            Vincular
          </button>
        </div>
        {(props.file.links ?? []).length === 0 ? (
          <MessageBlock>Este archivo aun no tiene asociaciones registradas.</MessageBlock>
        ) : (
          (props.file.links ?? []).map((link) => (
            <article key={link.id} style={listItemStyle}>
              <strong>{link.entityType}</strong>
              <span style={metaTextStyle}>{link.entityId} · {link.relationType}</span>
            </article>
          ))
        )}
      </div>
    </Panel>
  );
}

function formatSize(sizeBytes: number | null | undefined) {
  const value = typeof sizeBytes === 'number' ? sizeBytes : 0;
  if (value < 1024) {
    return `${value} B`;
  }
  return `${(value / 1024).toFixed(1)} KB`;
}

function readFileGlyph(extension: string | null | undefined) {
  const normalized = (extension ?? '').toLowerCase();
  if (['xls', 'xlsx', 'csv'].includes(normalized)) {
    return '▤';
  }
  if (['pdf', 'doc', 'docx', 'txt'].includes(normalized)) {
    return '▥';
  }
  if (['png', 'jpg', 'jpeg'].includes(normalized)) {
    return '▦';
  }
  return '▧';
}

const explorerShellStyle = {
  display: 'grid',
  gap: 18,
  gridTemplateColumns: '260px minmax(0, 1.45fr) minmax(340px, 1fr)',
  alignItems: 'start',
};

const sidebarStyle = {
  minWidth: 0,
};

const detailsStyle = {
  minWidth: 0,
};

const explorerTopBarStyle = {
  display: 'flex',
  gap: 12,
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  flexWrap: 'wrap' as const,
};

const contentSplitStyle = {
  display: 'grid',
  gap: 18,
  gridTemplateColumns: 'minmax(0, 1fr) 290px',
  alignItems: 'start',
};

const inventoryStyle = {
  border: '1px solid #e6edf2',
  borderRadius: 20,
  overflow: 'hidden',
  background: '#fbfcfe',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
};

const inventoryHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  padding: '14px 16px',
  borderBottom: '1px solid #e6edf2',
  background: '#f5f8fc',
  flexWrap: 'wrap' as const,
};

const tableHeaderStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 2.4fr) 90px 110px 90px',
  gap: 12,
  padding: '10px 16px',
  borderBottom: '1px solid #e6edf2',
  background: '#ffffff',
  color: '#5f6b7a',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
};

const workspaceStyle = {
  display: 'grid',
  gap: 14,
};

const utilityCardStyle = {
  display: 'grid',
  gap: 12,
  padding: 18,
  border: '1px solid #d7dde5',
  borderRadius: 20,
  background: 'linear-gradient(180deg, #ffffff 0%, #f9fbfe 100%)',
};

const inputStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 12,
  padding: '12px 15px',
  fontSize: 15,
  background: '#ffffff',
};

const textareaStyle = {
  ...inputStyle,
  minHeight: 92,
  resize: 'vertical' as const,
};

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: 12,
  padding: '11px 16px',
  background: '#0b4f3a',
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #d7dde5',
  borderRadius: 12,
  padding: '11px 16px',
  background: '#ffffff',
  color: '#10233f',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

const dangerButtonStyle = {
  ...secondaryButtonStyle,
  border: '1px solid #f3c7c2',
  background: '#fdecea',
  color: '#b42318',
};

const treeButtonStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 14,
  padding: 14,
  display: 'grid',
  gap: 4,
  textAlign: 'left' as const,
  fontSize: 16,
};

const crumbStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 999,
  padding: '9px 13px',
  background: '#ffffff',
  color: '#10233f',
  fontSize: 15,
  fontWeight: 600,
};

const listItemStyle = {
  border: '1px solid #d7dde5',
  borderRadius: 16,
  padding: 14,
  display: 'grid',
  gap: 6,
  background: '#ffffff',
  textAlign: 'left' as const,
  fontSize: 15,
};

const rowButtonStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 2.4fr) 90px 110px 90px',
  gap: 12,
  alignItems: 'center',
  padding: '14px 16px',
  border: '1px solid #edf1f5',
  borderLeft: 'none',
  borderRight: 'none',
  background: '#ffffff',
  textAlign: 'left' as const,
};

const nameCellStyle = {
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  minWidth: 0,
};

const folderGlyphStyle = {
  width: 34,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  background: '#fff4d8',
  color: '#9a6700',
  fontWeight: 800,
  flex: '0 0 auto',
};

const fileGlyphStyle = {
  width: 34,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  background: '#e8f0fb',
  color: '#355070',
  fontWeight: 800,
  flex: '0 0 auto',
};

const rowMutedStyle = {
  color: '#5f6b7a',
  fontSize: 14,
};

const formGridStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
};

const fieldStyle = {
  display: 'grid',
  gap: 6,
};

const labelStyle = {
  color: '#10233f',
  fontSize: 14,
  fontWeight: 600,
};

const metaTextStyle = {
  color: '#5f6b7a',
  fontSize: 14,
};

const nameTextWrapStyle = {
  display: 'grid',
  gap: 2,
  minWidth: 0,
};

const primaryFileTextStyle = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  fontSize: 16,
  lineHeight: 1.2,
};

const secondaryFileTextStyle = {
  color: '#5f6b7a',
  fontSize: 13,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
};

const statusBarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  padding: '12px 14px',
  border: '1px solid #e6edf2',
  borderRadius: 16,
  background: '#f7fafc',
};

const tabRailStyle = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap' as const,
  padding: 6,
  border: '1px solid #d7dde5',
  borderRadius: 16,
  background: '#f7fafc',
};

const tabButtonStyle = {
  border: 'none',
  borderRadius: 12,
  padding: '10px 14px',
  background: 'transparent',
  color: '#5f6b7a',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};

const activeTabButtonStyle = {
  background: '#ffffff',
  color: '#10233f',
  boxShadow: '0 8px 18px rgba(16, 35, 63, 0.08)',
};

const emptyInspectorStyle = {
  minHeight: 320,
  border: '1px dashed #cbd5e1',
  borderRadius: 20,
  background: '#f8fbff',
  display: 'grid',
  gap: 10,
  alignItems: 'center',
  justifyItems: 'center',
  padding: 24,
};

const emptyInspectorIconStyle = {
  width: 52,
  height: 52,
  borderRadius: 16,
  background: '#e8f0fb',
  color: '#355070',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 800,
  fontSize: 24,
};

const folderCountStyle = {
  minWidth: 22,
  height: 22,
  borderRadius: 999,
  background: '#eef3f8',
  color: '#355070',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
};

const viewToggleStyle = {
  display: 'inline-flex',
  gap: 6,
  padding: 5,
  border: '1px solid #d7dde5',
  borderRadius: 14,
  background: '#ffffff',
};

const viewToggleButtonStyle = {
  border: 'none',
  borderRadius: 10,
  padding: '9px 12px',
  background: 'transparent',
  color: '#5f6b7a',
  fontWeight: 700,
  cursor: 'pointer',
};

const activeViewToggleButtonStyle = {
  background: '#0b4f3a',
  color: '#ffffff',
};

const cardGridStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  padding: 14,
};

const itemCardStyle = {
  display: 'grid',
  gap: 12,
  alignContent: 'start',
  padding: 16,
  minHeight: 150,
  border: '1px solid #e6edf2',
  borderRadius: 18,
  background: '#ffffff',
  textAlign: 'left' as const,
  boxShadow: '0 10px 24px rgba(16, 35, 63, 0.05)',
};

const itemCardIconStyle = {
  width: 44,
  height: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 14,
  background: '#eef4fb',
  color: '#355070',
  fontWeight: 800,
  fontSize: 20,
};

const desktopStatsStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
  marginBottom: 16,
};

const miniStatStyle = {
  display: 'grid',
  gap: 4,
  padding: '12px 14px',
  border: '1px solid #d7dde5',
  borderRadius: 16,
  background: '#ffffff',
};

const miniStatLabelStyle = {
  fontSize: 12,
  color: '#5f6b7a',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  fontWeight: 800,
};

const miniStatValueStyle = {
  fontSize: 28,
  color: '#10233f',
  lineHeight: 1,
};

const desktopWindowStyle = {
  border: '1px solid #ced8e5',
  borderRadius: 26,
  overflow: 'hidden',
  background: 'linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%)',
  boxShadow: '0 24px 52px rgba(16, 35, 63, 0.12)',
};

const desktopWindowChromeStyle = {
  display: 'grid',
  gridTemplateColumns: '140px minmax(0, 1fr) minmax(180px, 280px)',
  gap: 12,
  alignItems: 'center',
  padding: '14px 18px',
  background: 'linear-gradient(180deg, #eef4fb 0%, #e5edf7 100%)',
  borderBottom: '1px solid #d7dde5',
};

const desktopWindowDotsStyle = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
};

const desktopDotStyle = {
  width: 11,
  height: 11,
  borderRadius: 999,
  display: 'inline-block',
};

const desktopWindowTitleStyle = {
  color: '#10233f',
  fontSize: 16,
  fontWeight: 700,
  textAlign: 'center' as const,
};

const desktopWindowMetaStyle = {
  color: '#5f6b7a',
  fontSize: 14,
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const desktopToolbarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 14,
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  padding: '14px 18px',
  background: '#ffffff',
  borderBottom: '1px solid #e6edf2',
};

const desktopCommandStripStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  padding: '14px 18px',
  background: '#f7fafc',
  borderBottom: '1px solid #e6edf2',
};

const desktopBodyStyle = {
  display: 'grid',
  gridTemplateColumns: '260px minmax(0, 1fr) 360px',
  minHeight: 740,
};

const desktopSidebarPaneStyle = {
  padding: 18,
  borderRight: '1px solid #e6edf2',
  background: '#f6f9fd',
};

const desktopCenterPaneStyle = {
  padding: 18,
  background: '#fdfefe',
};

const desktopRightPaneStyle = {
  padding: 18,
  borderLeft: '1px solid #e6edf2',
  background: '#f8fbff',
};

const paneHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
  flexWrap: 'wrap' as const,
};

const paneTitleStyle = {
  fontSize: 20,
  color: '#10233f',
};

const desktopInventoryFrameStyle = {
  border: '1px solid #dfe7f0',
  borderRadius: 22,
  overflow: 'hidden',
  background: '#ffffff',
  boxShadow: '0 14px 30px rgba(16, 35, 63, 0.05)',
};

const desktopInventoryHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  padding: '16px 18px',
  background: 'linear-gradient(180deg, #ffffff 0%, #f4f8fc 100%)',
  borderBottom: '1px solid #e6edf2',
};
