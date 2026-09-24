import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  UserResponseDto,
  TokenResponseDto,
} from './dto';
import { UnauthorisedException } from '../common/exceptions';
import { JwtAuthGuard, AuthenticatedUser } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

/**
 * Auth controller implementing contracts/auth-api.yaml
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   * Public endpoint: Register a new user
   *
   * Request: RegisterDto (username, password)
   * Response (201): UserResponseDto
   * Errors:
   *   409: AUTH-409 - Username already taken
   *   422: VAL-422 - Validation failed
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() registerDto: RegisterDto,
  ): Promise<UserResponseDto> {
    try {
      return await this.authService.register(
        registerDto.username,
        registerDto.password,
      );
    } catch (error) {
      // Validation errors are handled by ValidationPipe and converted by global exception filter
      if (error.getStatus && error.getStatus() === 409) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * POST /auth/login
   * Public endpoint: Authenticate and receive tokens
   *
   * Request: LoginDto (username, password)
   * Response (200): TokenResponseDto
   * Errors:
   *   401: AUTH-401 - Invalid credentials (same for unknown user and wrong password)
   *   422: VAL-422 - Validation failed
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<TokenResponseDto> {
    return this.authService.login(loginDto.username, loginDto.password);
  }

  /**
   * POST /auth/refresh
   * Public endpoint: Exchange refresh token for new token pair
   *
   * Request: RefreshTokenDto (refreshToken)
   * Response (200): TokenResponseDto
   * Errors:
   *   401: AUTH-401 - Invalid/revoked/expired refresh token
   *   422: VAL-422 - Validation failed
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<TokenResponseDto> {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  /**
   * GET /auth/me
   * Protected endpoint: Get authenticated user profile
   * Requires valid JWT in Authorization header
   *
   * Response (200): UserResponseDto
   * Errors:
   *   401: AUTH-401 - No token, invalid token, or expired token
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    if (!user || !user.userId) {
      throw new UnauthorisedException('Unauthorised');
    }
    return this.authService.getUser(user.userId);
  }
}
