import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FilesService {
  private s3: S3Client;
  private bucket: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.bucket = this.config.get('MINIO_BUCKET') || 'tasker-files';

    this.s3 = new S3Client({
      endpoint: this.config.get('MINIO_ENDPOINT') || 'http://localhost:9000',
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get('MINIO_ACCESS_KEY') || 'minioadmin',
        secretAccessKey: this.config.get('MINIO_SECRET_KEY') || 'minioadmin123',
      },
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    options: { taskId?: string; messageId?: string } = {},
  ) {
    console.log('file', file);
    if (!file) throw new BadRequestException('No file uploaded');
   
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const key = `${userId}/${Date.now()}_${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read', // or private + signed URLs
    });

    try {
      await this.s3.send(command);

      const url = `${this.config.get('MINIO_ENDPOINT')}/${this.bucket}/${key}`;

      const savedFile = await this.prisma.file.create({
        data: {
          url,
          name: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          uploadedBy: userId,
          taskId: options.taskId || null,
          messageId: options.messageId || null,
        },
      });

      return savedFile;
    } catch (error) {
      throw new BadRequestException('File upload failed');
    }
  }

  // Optional: Generate signed URL (for private files)
  async getSignedUrl(fileId: string, userId: string) {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.uploadedBy !== userId) {
      throw new BadRequestException('File not found or access denied');
    }
    // Return file.url or generate temporary signed URL
    return { url: file.url, name: file.name };
  }

  // Delete file (admin or owner)
  async deleteFile(fileId: string, userId: string) {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });

    if (!file || file.uploadedBy !== userId) {
      throw new BadRequestException('Not authorized');
    }

    await this.prisma.file.delete({ where: { id: fileId } });
    return { success: true };
  }
}
