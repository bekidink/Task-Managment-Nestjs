import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  UseInterceptors,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files', 10)) // Accept up to 10 files
  @ApiOperation({ summary: 'Create new task with optional attachments' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string', nullable: true },
        projectId: { type: 'string' },
        assigneeId: { type: 'string', nullable: true },
        status: {
          type: 'string',
          enum: ['TODO', 'IN_PROGRESS', 'DONE'],
          default: 'TODO',
        },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
          default: 'MEDIUM',
        },
        startDate: { type: 'string', format: 'date-time', nullable: true },
        endDate: { type: 'string', format: 'date-time', nullable: true },
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      required: ['title', 'projectId'],
    },
  })
  create(
    @Req() req: any,
    @Body() body: any,
    @UploadedFiles(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({
            fileType:
              /(image\/.*|application\/pdf|application\/msword|application\/vnd.openxmlformats-officedocument.wordprocessingml.document|text\/.*|application\/vnd.ms-excel|application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet)/,
          }),
        ],
      }),
    )
    files?: Express.Multer.File[],
  ) {
    return this.tasksService.create(req.user.userId, {
      ...body,
      files: files || [], // Ensure files is always an array
    });
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get all tasks in a project' })
  getByProject(@Param('projectId') projectId: string, @Req() req: any) {
    return this.tasksService.findByProject(projectId, req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single task with comments & files' })
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiOperation({ summary: 'Update task (status, assignee, etc.)' })
  @ApiOperation({ summary: 'Create new task with optional attachments' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string', nullable: true },
       
        assigneeId: { type: 'string', nullable: true },
        status: {
          type: 'string',
          enum: ['TODO', 'IN_PROGRESS', 'DONE'],
          default: 'TODO',
        },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
          default: 'MEDIUM',
        },
        startDate: { type: 'string', format: 'date-time', nullable: true },
        endDate: { type: 'string', format: 'date-time', nullable: true },
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      required: ['title', 'projectId'],
    },
  })
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({ fileType: /(image|pdf|docx?|xlsx?|txt)/ }),
        ],
      }),
    )
    files?: Express.Multer.File[],
    @Req() req?: any,
  ) {
   
    return this.tasksService.update(id, req.user.userId, body, files);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete task (admin/manager only)' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.remove(id, req.user.userId);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add comment to task' })
  addComment(
    @Param('id') taskId: string,
    @Req() req: any,
    @Body() body: { content: string; mentions?: string[] },
  ) {
    return this.tasksService.addComment(
      taskId,
      req.user.userId,
      body.content,
      body.mentions,
    );
  }
  @Get('my/assigned')
  @ApiOperation({ summary: 'Get all tasks assigned to me' })
  async getMyTasks(@Req() req: any) {
    return this.tasksService.findAssignedToMe(req.user.userId);
  }

  // BONUS: Get my created tasks
  @Get('my/created')
  @ApiOperation({ summary: 'Get all tasks I created' })
  async getMyCreated(@Req() req: any) {
    return this.tasksService.findCreatedByMe(req.user.userId);
  }
  @Post('complete/:id')
  @ApiOperation({ summary: 'Mark task as complete' })
  completeTask(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.update(id, req.user.userId, { status: 'DONE' });
  }

  @Patch('reassign/:id')
  @ApiOperation({ summary: 'Reassign task to another user' })
  reassignTask(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { assigneeId: string },
  ) {
    return this.tasksService.update(id, req.user.userId, {
      assigneeId: body.assigneeId,
    });
  }

  @Patch('priority/:id')
  @ApiOperation({ summary: 'Update task priority' })
  updatePriority(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' },
  ) {
    return this.tasksService.update(id, req.user.userId, {
      priority: body.priority,
    });
  }

  @Patch('deadline/:id')
  @ApiOperation({ summary: 'Update task deadline' })
  updateDeadline(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { endDate: string },
  ) {
    return this.tasksService.update(id, req.user.userId, {
      endDate: body.endDate,
    });
  }
}
