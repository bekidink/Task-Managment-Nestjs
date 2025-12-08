// src/files/cloudinary.service.ts → FINAL CLEAN VERSION
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  v2 as cloudinary,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

import { UploadType, UploadResult, FileListItem } from './dto/file.dto';

@Injectable()
export class FilesService {
  // 1. UPLOAD WITH AUTO-TRANSFORMATION
  async uploadFile(
    file: Express.Multer.File,
    type: UploadType = 'chat',
    userId?: string,
  ): Promise<UploadResult> {
    const transformation = this.getTransformation(type);
    const folder = `tasker/${type}s`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          transformation,
          context: userId ? `uploaded_by=${userId}` : undefined,
          tags: ['tasker', type, userId || 'anonymous'],
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error) return reject(new BadRequestException(error.message));
          if (!result) return reject(new InternalServerErrorException());

          const thumbnail =
            type === 'document'
              ? this.getOptimizedUrl(result.public_id, { width: 300 })
              : undefined;

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            name: file.originalname,
            size: result.bytes,
            mimeType: result.format,
            width: result.width,
            height: result.height,
            format: result.format,
            resourceType: result.resource_type,
            thumbnailUrl: thumbnail,
          });
        },
      );
      uploadStream.end(file.buffer);
    });
  }

  // 2. DELETE FILE
  async deleteFile(publicId: string): Promise<void> {
    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
    });
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new BadRequestException('Failed to delete file');
    }
  }

  // 3. GET SINGLE FILE METADATA
  async getFileMetadata(publicId: string) {
    try {
      const result = await cloudinary.api.resource(publicId, {
        resource_type: 'auto',
      });
      return {
        url: result.secure_url,
        publicId: result.public_id,
        name: result.original_filename || 'Unknown',
        size: result.bytes,
        mimeType: result.format,
        width: result.width,
        height: result.height,
        uploadedAt: result.created_at,
        uploadedBy: result.context?.uploaded_by || null,
        tags: result.tags,
      };
    } catch (error) {
      throw new NotFoundException('File not found');
    }
  }

  // 4. LIST USER'S UPLOADS
  async getUserUploads(userId: string, type?: UploadType, limit = 20) {
    const expression = `tags:tasker AND context.uploaded_by:${userId}${type ? ` AND tags:${type}` : ''}`;

    const { resources } = await cloudinary.search
      .expression(expression)
      .sort_by('created_at', 'desc')
      .max_results(Math.min(limit, 100))
      .execute();

    return resources.map((r: any) => ({
      publicId: r.public_id,
      url: r.secure_url,
      thumbnail: this.getOptimizedUrl(r.public_id, { width: 300 }),
      name: r.original_filename || r.public_id.split('/').pop(),
      size: r.bytes,
      type: r.resource_type,
      uploadedAt: r.created_at,
      mimeType: r.format,
    }));
  }

  // 5. LIST FILES IN FOLDER
  async getFolderFiles(folderPath: string, limit = 30) {
    const prefix = `tasker/${folderPath}/`;

    const { resources } = await cloudinary.api.resources({
      type: 'upload',
      prefix,
      max_results: Math.min(limit, 500),
      resource_type: 'auto',
    });

    return resources.map((r: any) => ({
      publicId: r.public_id,
      url: r.secure_url,
      thumbnail: this.getOptimizedUrl(r.public_id, { width: 400 }),
      name: r.original_filename || r.public_id.split('/').pop(),
      size: r.bytes,
      mimeType: r.format,
      uploadedAt: r.created_at,
    }));
  }

  // 6. SEARCH FILES
  async searchFiles(query: string) {
    if (!query || query.length < 2) return [];

    const { resources } = await cloudinary.search
      .expression(`filename:*${query}* OR tags:*${query}*`)
      .max_results(50)
      .execute();

    return resources.map((r: any) => ({
      publicId: r.public_id,
      url: r.secure_url,
      name: r.original_filename || r.public_id.split('/').pop(),
      size: r.bytes,
      type: r.resource_type,
    }));
  }

  // UTILS
  private getTransformation(type: UploadType): any[] {
    const map: Record<UploadType, any[]> = {
      avatar: [
        {
          width: 400,
          height: 400,
          crop: 'fill',
          gravity: 'face',
          radius: 'max',
        },
      ],
      chat: [{ width: 1600, quality: 'auto:best', fetch_format: 'auto' }],
      task: [{ width: 1200, crop: 'limit', quality: 'auto' }],
      document: [{ fetch_format: 'auto', quality: 'auto' }],
      raw: [],
    };
    return map[type] || [];
  }

  getOptimizedUrl(publicId: string, options?: { width?: number }): string {
    return cloudinary.url(publicId, {
      secure: true,
      transformation: [
        options?.width ? { width: options.width, crop: 'scale' } : {},
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });
  }
}
