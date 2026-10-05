import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
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
import { Request, Response } from 'express';
import {
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  hasCsrfHeader,
  readCookie,
  setAuthCookies,
} from './auth-cookies';

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
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponseDto> {
    const tokens = await this.authService.login(
      loginDto.username,
      loginDto.password,
      this.resolveCallerId(request),
    );
    // The browser keeps the session in HttpOnly cookies; the body stays as the contract describes it.
    setAuthCookies(response, tokens);
    return tokens;
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
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponseDto> {
    const presented = this.presentedRefreshToken(refreshTokenDto, request);
    const tokens = await this.authService.refresh(presented);
    setAuthCookies(response, tokens);
    return tokens;
  }

  /**
   * POST /auth/logout
   * Public endpoint: end the session. Revokes the refresh token (cookie, or body for API clients) and clears
   * both cookies. Always 204, so it cannot be used to probe whether a token existed.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Log out: revoke the refresh token and clear the session cookies' })
  @ApiNoContentResponse({ description: 'Session ended.' })
  async logout(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookieToken = readCookie(request.headers.cookie, REFRESH_TOKEN_COOKIE);
    const bodyToken = refreshTokenDto.refreshToken;
    // Cookie-authenticated, state-changing: needs the CSRF header (the body token is a credential in itself).
    if (!bodyToken && cookieToken && !hasCsrfHeader(request.headers)) {
      throw new UnauthorisedException('Unauthorised');
    }
    const token = bodyToken ?? cookieToken;
    if (token) {
      await this.authService.logout(token);
    }
    clearAuthCookies(response);
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

  /**
   * The refresh token from the body (API clients) or the HttpOnly cookie (browsers). A cookie alone must come with
   * the CSRF header, because the browser attaches cookies to any request, whoever started it.
   */
  private presentedRefreshToken(dto: RefreshTokenDto, request: Request): string {
    if (dto.refreshToken) {
      return dto.refreshToken;
    }
    const cookieToken = readCookie(request.headers.cookie, REFRESH_TOKEN_COOKIE);
    if (!cookieToken || !hasCsrfHeader(request.headers)) {
      throw new UnauthorisedException('Unauthorised');
    }
    return cookieToken;
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
