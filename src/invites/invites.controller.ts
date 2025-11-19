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
import { InvitesService } from './invites.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('invites')
@ApiBearerAuth()
@Controller('invites')
@UseGuards(JwtAuthGuard)
export class InvitesController {
  constructor(private invitesService: InvitesService) {}

  @Post('team/:teamId')
  @ApiOperation({ summary: 'Invite user by email (admin/manager only)' })
  createInvite(
    @Param('teamId') teamId: string,
    @Req() req: any,
    @Body() body: { email: string; role: 'admin' | 'manager' | 'member' },
  ) {
    return this.invitesService.createInvite(teamId, req.user.userId, body);
  }

  @Patch('accept/:token')
  @ApiOperation({ summary: 'Accept invite via token link' })
  acceptInvite(@Param('token') token: string, @Req() req: any) {
    return this.invitesService.acceptInvite(token, req.user.userId);
  }

  @Get('team/:teamId/pending')
  @ApiOperation({ summary: 'Get all pending invites (admin only)' })
  getPending(@Param('teamId') teamId: string, @Req() req: any) {
    return this.invitesService.getPendingInvites(teamId, req.user.userId);
  }

  @Delete(':inviteId')
  @ApiOperation({ summary: 'Cancel pending invite' })
  cancelInvite(@Param('inviteId') inviteId: string, @Req() req: any) {
    return this.invitesService.cancelInvite(inviteId, req.user.userId);
  }
}
