// src/teams/teams.module.ts
import { Module } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { FilesService } from '../files/files.service';
@Module({
  controllers: [TeamsController],
  providers: [TeamsService,FilesService],
  exports: [TeamsService],
})
export class TeamsModule {}
