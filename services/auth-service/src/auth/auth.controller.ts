import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  UserResponseDto,
  TokenResponseDto,
  ErrorResponseDto,
} from './dto';
import { UnauthorisedException } from '../common/exceptions';
import { JwtAuthGuard, AuthenticatedUser } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { Request } from 'express';

/**
 * Auth controller implementing contracts/auth-api.yaml
 */
@ApiTags('Auth')
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
  @ApiOperation({ summary: 'Register a user' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  async register(
    @Body() registerDto: RegisterDto,
  ): Promise<UserResponseDto> {
    return this.authService.register(
      registerDto.username,
      registerDto.password,
      registerDto.email,
    );
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
  @ApiOperation({ summary: 'Log in and receive tokens' })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
  ): Promise<TokenResponseDto> {
    return this.authService.login(
      loginDto.username,
      loginDto.password,
      this.resolveCallerId(request),
    );
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
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
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
  @ApiOperation({ summary: 'Get the authenticated user' })
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async getCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    if (!user || !user.userId) {
      throw new UnauthorisedException('Unauthorised');
    }
    return this.authService.getUser(user.userId);
  }

  private resolveCallerId(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    const firstForwarded = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor;

    if (typeof firstForwarded === 'string' && firstForwarded.trim().length > 0) {
      return firstForwarded.split(',')[0].trim();
    }

    if (typeof request.ip === 'string' && request.ip.trim().length > 0) {
      return request.ip;
    }

    return 'unknown-caller';
  }
}
