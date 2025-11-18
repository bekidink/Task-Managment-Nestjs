import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { SupabaseLoginDto } from './dto/supabase-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async loginOrCreate(dto: SupabaseLoginDto) {
    let user = await this.prisma.user.findUnique({
      where: { supabaseUid: dto.supabaseUid },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          supabaseUid: dto.supabaseUid,
          email: dto.email,
          name: dto.email.split('@')[0],
        },
      });
    }

    return user;
  }

  generateToken(user: any) {
    const payload = { sub: user.id, email: user.email };
    return this.jwtService.sign(payload);
  }
}
