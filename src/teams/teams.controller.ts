// src/teams/teams.controller.ts
import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  UseGuards,
  Body,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { FilesService } from '../files/files.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';

@ApiTags('teams')
@ApiBearerAuth()
@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(
    private teamsService: TeamsService,
    private filesService: FilesService, // ← INJECTED!
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({
    summary: 'Create team with avatar & members (multipart/form-data)',
  })
  @ApiConsumes('multipart/form-data')
  async create(
    @Req() req: any,
    @Body() body: any,
    @UploadedFile() avatarFile?: Express.Multer.File,
  ) {
    const userId = req.user.userId;
  console.log('FormData received:', body);
  console.log('Avatar file:', avatarFile ? 'YES' : 'NO');
    if (!body.name) {
      throw new BadRequestException('Team name is required');
    }

    // Parse memberIds[] from form-data
    let memberIds: string[] = [];
    if (body.memberIds) {
      memberIds = Array.isArray(body.memberIds)
        ? body.memberIds
        : typeof body.memberIds === 'string'
          ? [body.memberIds]
          : [];
    }

    // Upload avatar using your FilesService
    let avatarUrl: string | undefined;
    if (avatarFile) {
      const uploaded = await this.filesService.uploadFile(avatarFile, userId,);
      avatarUrl = uploaded.url;
    }

    // Create team
    const team = await this.teamsService.create(userId, {
      name: body.name,
      avatar: avatarUrl,
      privacy: body.privacy || 'private',
    });

    // Creator = admin
    await this.teamsService.addMember(team.id, userId, 'admin');

    // Add other members
    for (const memberId of memberIds) {
      if (memberId !== userId) {
        await this.teamsService
          .addMember(team.id, memberId, 'member')
          .catch(() => {});
      }
    }

    return {
      success: true,
      message: 'Team created successfully',
      team: await this.teamsService.findOne(team.id),
    };
  }

  @Get()
  getMyTeams(@Req() req: any) {
    return this.teamsService.getMyTeams(req.user.userId);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.teamsService.findOne(id);
  }
}
