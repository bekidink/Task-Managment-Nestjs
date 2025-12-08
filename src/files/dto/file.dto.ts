// src/files/dto/file.dto.ts → FINAL SHARED TYPES
export type UploadType = 'avatar' | 'chat' | 'task' | 'document' | 'raw';

export interface UploadResult {
  url: string;
  publicId: string;
  name: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
  format: string;
  resourceType: string;
  thumbnailUrl?: string;
}

export interface FileMetadata {
  url: string;
  publicId: string;
  name: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
  uploadedAt: string;
  uploadedBy: string | null;
  tags: string[];
}

export interface FileListItem {
  publicId: string;
  url: string;
  thumbnail: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  mimeType: string;
}
