// src/types/multer.d.ts   (or src/@types/multer.d.ts)
import { Multer } from 'multer';

declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;        // for FileInterceptor('file')
      files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] }; // for FilesInterceptor or AnyFilesInterceptor
    }
  }
}