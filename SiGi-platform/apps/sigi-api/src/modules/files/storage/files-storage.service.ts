import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, stat, writeFile } from 'fs/promises';
import * as path from 'path';
import { getValidatedEnv } from '../../../common/config/env';

const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'sh',
  'ps1',
  'dll',
  'jar',
  'php',
  'js',
  'msi',
]);

@Injectable()
export class FilesStorageService {
  private readonly env = getValidatedEnv();

  sanitizeFileName(fileName: string) {
    const baseName = path.basename(fileName).replace(/[\u0000-\u001f]/g, '').trim();
    const sanitized = baseName
      .replace(/[\\/:"*?<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\.+$/g, '')
      .trim();

    if (!sanitized) {
      throw new BadRequestException('Nombre de archivo inválido.');
    }

    return sanitized;
  }

  getExtension(fileName: string) {
    return path.extname(fileName).replace('.', '').toLowerCase();
  }

  validateUpload(fileName: string, sizeBytes: number) {
    const extension = this.getExtension(fileName);
    const allowedExtensions = new Set(this.env.fileAllowedExtensions);
    if (!extension) {
      throw new BadRequestException('El archivo debe tener extensión válida.');
    }
    if (BLOCKED_EXTENSIONS.has(extension)) {
      throw new BadRequestException(`La extensión ${extension} está bloqueada por seguridad.`);
    }
    if (!allowedExtensions.has(extension)) {
      throw new BadRequestException(`La extensión ${extension} no está permitida.`);
    }

    const maxBytes = this.env.fileMaxUploadMb * 1024 * 1024;
    if (sizeBytes > maxBytes) {
      throw new BadRequestException(
        `El archivo excede el límite de ${this.env.fileMaxUploadMb} MB.`,
      );
    }
  }

  async ensureStorageRoot() {
    const storageRoot = path.resolve(this.env.fileStorageRoot);
    const workspaceRoot = path.resolve(process.cwd());
    if (storageRoot.startsWith(workspaceRoot)) {
      throw new InternalServerErrorException(
        'FILE_STORAGE_ROOT debe vivir fuera del árbol de código del proyecto.',
      );
    }
    await mkdir(storageRoot, { recursive: true });
    return storageRoot;
  }

  computeChecksum(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  buildStorageKey(fileId: string, versionNumber: number, fileName: string) {
    const extension = this.getExtension(fileName);
    const safeBase = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9-_]+/g, '-');
    return `${fileId}/v${versionNumber}/${safeBase || 'file'}.${extension}`;
  }

  async writeObject(storageKey: string, buffer: Buffer) {
    const root = await this.ensureStorageRoot();
    const normalizedKey = storageKey.replace(/\\/g, '/').replace(/\.\./g, '');
    const absolutePath = path.resolve(root, normalizedKey);
    if (!absolutePath.startsWith(root)) {
      throw new BadRequestException('Ruta de almacenamiento inválida.');
    }
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);
    return absolutePath;
  }

  createDownloadStream(absolutePath: string) {
    const root = path.resolve(this.env.fileStorageRoot);
    const resolved = path.resolve(absolutePath);
    if (!resolved.startsWith(root)) {
      throw new BadRequestException('Ruta de archivo inválida.');
    }
    return createReadStream(resolved);
  }

  async assertObjectExists(absolutePath: string) {
    const info = await stat(absolutePath).catch(() => null);
    if (!info || !info.isFile()) {
      throw new BadRequestException('El archivo solicitado no existe en almacenamiento.');
    }
  }
}
