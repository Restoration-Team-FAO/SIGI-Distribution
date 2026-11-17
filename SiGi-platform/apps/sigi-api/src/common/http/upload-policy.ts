import { BadRequestException } from '@nestjs/common';
import * as path from 'node:path';

export type BufferedUpload = {
  buffer?: Buffer;
  originalname?: string;
};

const ZIP_EXTENSIONS = new Set(['zip', 'xlsx', 'docx']);
const TEXT_EXTENSIONS = new Set(['csv', 'txt']);

export function assertSafeUpload(
  file: BufferedUpload | undefined,
  allowedExtensions: readonly string[],
) {
  if (!file?.buffer?.length || !file.originalname) {
    throw new BadRequestException('Debe adjuntar un archivo no vacío.');
  }

  const name = file.originalname.normalize('NFKC').trim();
  if (!name || name !== path.basename(name) || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new BadRequestException('El nombre del archivo no es seguro.');
  }
  const extension = path.extname(name).slice(1).toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    throw new BadRequestException(`Extensión .${extension || '(vacía)'} no permitida.`);
  }
  if (!matchesSignature(extension, file.buffer)) {
    throw new BadRequestException(`El contenido del archivo no corresponde a .${extension}.`);
  }
}

function matchesSignature(extension: string, buffer: Buffer) {
  if (ZIP_EXTENSIONS.has(extension)) {
    return buffer.subarray(0, 2).equals(Buffer.from('PK'));
  }
  if (extension === 'xls' || extension === 'doc') {
    return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }
  if (extension === 'pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (extension === 'png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === 'jpg' || extension === 'jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (TEXT_EXTENSIONS.has(extension)) return !buffer.subarray(0, 4096).includes(0);
  if (extension === 'json' || extension === 'geojson') {
    try {
      const parsed = JSON.parse(buffer.toString('utf8'));
      return parsed !== null && typeof parsed === 'object';
    } catch {
      return false;
    }
  }
  return false;
}
