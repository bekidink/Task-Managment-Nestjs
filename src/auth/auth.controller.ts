import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseLoginDto } from './dto/supabase-login.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('supabase-login')
  async supabaseLogin(@Body() dto: SupabaseLoginDto) {
    const user = await this.authService.loginOrCreate(dto);
    const token = this.authService.generateToken(user);
    return { access_token: token, user };
  }
}
