import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** D sở hữu xác thực; mật khẩu không bao giờ được trả về API. */
export class AuthDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}
