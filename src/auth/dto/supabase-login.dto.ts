import { IsString, IsEmail } from 'class-validator';

export class SupabaseLoginDto {
  @IsString()
  supabaseUid: string;

  @IsEmail()
  email: string;
}
