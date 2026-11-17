# Explorador Documental y Metadatos SIGI

## Propósito
Centralizar la gestión documental del SIGI con navegación tipo explorador, versionamiento básico, metadatos estructurados, vínculos con entidades del dominio y trazabilidad auditable.

## Arquitectura
- `apps/sigi-api/src/modules/files`: módulo NestJS para árbol, archivos, metadatos, descargas y auditoría.
- `apps/frontend-sigi/src/pages/FilesExplorerPage.tsx`: consola de administración tipo explorador.
- `apps/frontend-country/src/pages/DocumentsPage.tsx`: vista de consulta pública/autorizada.
- `documents.*` en PostgreSQL: persistencia de carpetas, archivos, versiones, permisos, previews y auditoría.
- Storage MVP: filesystem local configurable con `FILE_STORAGE_ROOT`.

## Modelo de datos
- `documents.folders`: jerarquía lógica de carpetas con `deleted_at`.
- `documents.files`: ficha principal del archivo y puntero a versión actual.
- `documents.file_versions`: historial de versiones y objetos físicos.
- `documents.file_metadata`: metadatos descriptivos y geoespaciales.
- `documents.file_entity_links`: asociación a proyecto, institución, territorio, dataset, indicador o fuente.
- `documents.file_permissions`: grants explícitos por usuario, rol, institución o proyecto.
- `documents.file_audit_events`: eventos de trazabilidad documental.
- `documents.file_storage_objects`: ubicación física controlada.
- `documents.file_previews`: base para previsualización futura.

## Endpoints
### Admin
- `GET /api/admin/files/tree`
- `GET /api/admin/files/root/items`
- `GET /api/admin/files/folders/:id/items`
- `POST /api/admin/files/folders`
- `PATCH /api/admin/files/folders/:id`
- `DELETE /api/admin/files/folders/:id`
- `POST /api/admin/files/upload`
- `GET /api/admin/files/search`
- `GET /api/admin/files/:id`
- `GET /api/admin/files/:id/download`
- `PATCH /api/admin/files/:id/metadata`
- `POST /api/admin/files/:id/version`
- `GET /api/admin/files/:id/versions`
- `POST /api/admin/files/:id/link`
- `GET /api/admin/files/:id/audit`
- `DELETE /api/admin/files/:id`

### Público
- `GET /api/documents`
- `GET /api/documents/:id`
- `GET /api/documents/:id/download`

## Variables de entorno
- `FILE_STORAGE_ROOT`: directorio raíz del storage local.
- `FILE_MAX_UPLOAD_MB`: tamaño máximo por archivo.
- `FILE_ALLOWED_EXTENSIONS`: lista CSV de extensiones permitidas.

## Permisos
- `files.read`
- `files.create`
- `files.update`
- `files.delete`
- `files.download`
- `files.share`
- `files.approve`
- `files.manage_permissions`
- `files.view_sensitive`
- `files.admin`

## Flujo de carga
1. Frontend admin sube multipart a `/api/admin/files/upload`.
2. Backend sanea nombre, valida extensión/tamaño y calcula SHA-256.
3. Se crea `documents.files`, `documents.file_versions`, `documents.file_storage_objects` y metadata inicial.
4. El binario se guarda en `FILE_STORAGE_ROOT` bajo `storage_key` controlado.
5. Se registra `FILE_UPLOADED` en auditoría.

## Flujo de descarga
1. El cliente solicita `/download`.
2. Backend valida permisos y resuelve la versión actual.
3. Se entrega el stream sin exponer la ruta física.
4. Se registra `FILE_DOWNLOADED` cuando aplica autenticación admin.

## Flujo de auditoría
Eventos MVP soportados:
- `FOLDER_CREATED`
- `FOLDER_RENAMED`
- `FOLDER_MOVED`
- `FOLDER_DELETED`
- `FILE_UPLOADED`
- `FILE_DOWNLOADED`
- `FILE_METADATA_UPDATED`
- `FILE_VERSION_CREATED`
- `FILE_LINKED`
- `FILE_DELETED`

## Recomendaciones de producción
- Mover el storage a volumen persistente dedicado o storage objeto.
- Activar antivirus/escaneo asíncrono para binarios entrantes.
- Implementar previews y extracción de metadatos especializada.
- Endurecer gobernanza de `file_permissions` con UI administrativa dedicada.
- Añadir backups y política de retención del storage fuera de la base.
