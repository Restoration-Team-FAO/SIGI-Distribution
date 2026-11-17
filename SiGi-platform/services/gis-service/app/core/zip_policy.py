from __future__ import annotations

import zipfile


class ZipPolicyError(RuntimeError):
    pass


def validate_zip_entries(
    entries: list[zipfile.ZipInfo],
    *,
    max_entries: int,
    max_uncompressed_bytes: int,
    max_compression_ratio: int,
) -> None:
    if len(entries) > max_entries:
        raise ZipPolicyError('El .zip excede la cantidad máxima de archivos permitida.')
    if sum(item.file_size for item in entries) > max_uncompressed_bytes:
        raise ZipPolicyError('El contenido expandido del .zip excede el tamaño permitido.')
    for item in entries:
        if item.is_dir():
            continue
        normalized_path = item.filename.replace('\\', '/')
        path_parts = [part for part in normalized_path.split('/') if part]
        if normalized_path.startswith('/') or '..' in path_parts:
            raise ZipPolicyError('El .zip contiene una ruta no segura.')
        if item.flag_bits & 0x1:
            raise ZipPolicyError('No se permiten archivos cifrados dentro del .zip.')
        if item.file_size / max(1, item.compress_size) > max_compression_ratio:
            raise ZipPolicyError('El .zip presenta una razón de compresión no segura.')
