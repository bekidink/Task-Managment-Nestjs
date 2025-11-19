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
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create new task' })
  create(@Req() req: any, @Body() body: any) {
    return this.tasksService.create(req.user.userId, body);
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

  @Patch(':idId')
  @ApiOperation({ summary: 'Update task (status, assignee, etc.)' })
  update(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.tasksService.update(id, req.user.userId, body);
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
}
