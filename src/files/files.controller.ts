import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Req,
  UseGuards,
  Body,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload file (task or message attachment)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
    @Body() body: { taskId?: string; messageId?: string },
  ) {
    return this.filesService.uploadFile(file, req.user.userId, {
      taskId: body.taskId,
      messageId: body.messageId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file info' })
  getFile(@Param('id') id: string, @Req() req: any) {
    return this.filesService.getSignedUrl(id, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete your file' })
  deleteFile(@Param('id') id: string, @Req() req: any) {
    return this.filesService.deleteFile(id, req.user.userId);
  }
}
