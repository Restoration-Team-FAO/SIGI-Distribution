declare module 'multer' {
  export class MulterError extends Error {
    constructor(code: string, field?: string);
    code: string;
    field?: string;
  }
}
