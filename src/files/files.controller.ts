// src/files/files.controller.ts → FINAL CLEAN VERSION
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { UploadType } from './dto/file.dto';

@Controller('files')
export class FilesController {
  constructor(private cloudinaryService: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('type') type: UploadType = 'chat',
    @Req() req: any,
  ) {
    return this.cloudinaryService.uploadFile(file, type, req.user?.userId);
  }

  @Delete(':publicId')
  delete(@Param('publicId') publicId: string) {
    return this.cloudinaryService.deleteFile(publicId);
  }

  @Get(':publicId')
  getFile(@Param('publicId') publicId: string) {
    return this.cloudinaryService.getFileMetadata(publicId);
  }

  @Get('my-uploads')
  getMyUploads(
    @Req() req: any,
    @Query('type') type?: UploadType,
    @Query('limit') limit?: string,
  ) {
    return this.cloudinaryService.getUserUploads(
      req.user.userId,
      type,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('folder/:folder')
  getFolderFiles(
    @Param('folder') folder: string,
    @Query('limit') limit?: string,
  ) {
    return this.cloudinaryService.getFolderFiles(
      folder,
      limit ? parseInt(limit) : 30,
    );
  }

  @Get('search')
  searchFiles(@Query('q') q: string) {
    return this.cloudinaryService.searchFiles(q);
  }
}
