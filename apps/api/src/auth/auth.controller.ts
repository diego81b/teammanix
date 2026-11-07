import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth, AuthLimit, Public, WithoutClub } from '../common/decorators';
import { AuthService } from './auth.service';
import {
  ChangeLanguageDto,
  ChangePasswordDto,
  EmailDto,
  LoginDto,
  RegistrationDto,
  ResetPasswordDto,
  SelectClubDto,
  TokenDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @AuthLimit()
  @Post('registration')
  @HttpCode(202)
  registration(@Body() dto: RegistrationDto) {
    return this.auth.register(dto);
  }

  @Public()
  @AuthLimit()
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: TokenDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @AuthLimit()
  @Post('resend-verify')
  @HttpCode(202)
  resendVerify(@Body() dto: EmailDto) {
    return this.auth.resendVerify(dto.email);
  }

  @Public()
  @AuthLimit()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @AuthLimit()
  @Post('password-forgotten')
  @HttpCode(202)
  passwordForgotten(@Body() dto: EmailDto) {
    return this.auth.passwordForgotten(dto.email);
  }

  @Public()
  @AuthLimit()
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @WithoutClub()
  @Get('me')
  me(@CurrentAuth() a: AuthContext) {
    return this.auth.me(a.userId, a.clubId);
  }

  /** Account language: decides the language of emails. The UI follows it at login. */
  @WithoutClub()
  @Patch('language')
  changeLanguage(@CurrentAuth() a: AuthContext, @Body() dto: ChangeLanguageDto) {
    return this.auth.changeLanguage(a.userId, dto.language);
  }

  @WithoutClub()
  @Post('select-club')
  @HttpCode(200)
  select(@CurrentAuth() a: AuthContext, @Body() dto: SelectClubDto) {
    return this.auth.select(a.userId, dto.clubId);
  }

  @WithoutClub()
  @AuthLimit()
  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentAuth() a: AuthContext, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(a.userId, a.clubId, dto);
  }
}
