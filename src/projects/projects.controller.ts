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
  Query,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create new project' })
  create(@Req() req: any, @Body() body: any) {
    return this.projectsService.create(req.user.userId, body);
  }
  @Get()
  @ApiOperation({ summary: 'Get all my projects (personal + team)' })
  getMyProjects(@Req() req: any) {
    return this.projectsService.findAllByUser(req.user.userId);
  }
  @Get('team/:teamId')
  @ApiOperation({ summary: 'Get all projects in a team' })
  getByTeam(@Param('teamId') teamId: string, @Req() req: any) {
    return this.projectsService.findAllByTeam(teamId, req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single project with tasks & comments' })
  getOne(@Param('id') id: string, @Req() req: any) {
    return this.projectsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project' })
  update(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.projectsService.update(id, req.user.userId, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete project (admin/owner only)' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.projectsService.remove(id, req.user.userId);
  }
}
