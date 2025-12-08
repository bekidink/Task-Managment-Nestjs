// src/dashboard/dashboard.controller.ts
import {
  Controller,
  Get,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('mobile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get full mobile dashboard (Overview + Analytics)' })
  @ApiResponse({
    status: 200,
    description:
      'Returns real-time dashboard data for your beautiful Expo home screen',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMobileDashboard(@Req() req: any) {
    return this.dashboardService.getMobileDashboard(req.user.userId);
  }

}
