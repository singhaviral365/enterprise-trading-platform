import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginFlowService } from './login-flow.service';
import { PasswordResetService } from './password-reset.service';
import { RegistrationFlowService } from './registration-flow.service';
import { AccountSecurityService } from './account-security.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  UserResponseDto,
  TokenResponseDto,
  ErrorResponseDto,
  RegisterResponseDto,
  UpdateTwoFactorDto,
  ChangePasswordDto,
  LoginResponseDto,
  OtpChallengeDto,
  VerifyCodeDto,
  ResendCodeDto,
  ForgotPasswordDto,
  ForgotPasswordResponseDto,
  ResetTokenResponseDto,
  ResetPasswordDto,
} from './dto';
import { PasswordLockedException, UnauthorisedException } from '../common/exceptions';
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
  constructor(
    private readonly authService: AuthService,
    private readonly loginFlow: LoginFlowService,
    private readonly passwordReset: PasswordResetService,
    private readonly registration: RegistrationFlowService,
    private readonly accountSecurity: AccountSecurityService,
  ) {}

  /**
   * POST /auth/register
   * Public endpoint: step one of registering. Checks the details and emails a code to the address typed; the login is
   * created only when the code is entered at /auth/register/verify. (With email verification switched off the login is
   * created here and the answer holds the user.)
   *
   * Request: RegisterDto (username, password, email)
   * Response (200): RegisterResponseDto
   * Errors:
   *   409: AUTH-409 - Username or email already taken
   *   422: VAL-422 - Validation failed
   *   503: OTP-503 - The code could not be sent
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register, step one: check the details and email a code to the address typed' })
  @ApiOkResponse({ type: RegisterResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  async register(
    @Body() registerDto: RegisterDto,
    @Req() request: Request,
  ): Promise<RegisterResponseDto> {
    return this.registration.start(
      registerDto.username,
      registerDto.password,
      registerDto.email ?? `${registerDto.username}@local.auth`,
      this.resolveCallerId(request),
    );
  }

  /**
   * POST /auth/register/verify
   * Public endpoint: step two of registering. The emailed code creates the login.
   *
   * Errors: 401 OTP-401 (wrong, expired or used code), 409 AUTH-409 (taken meanwhile), 429 OTP-429.
   */
  @Post('register/verify')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register, step two: send the emailed code and the login is created' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async verifyRegistration(@Body() dto: VerifyCodeDto, @Req() request: Request): Promise<UserResponseDto> {
    return this.registration.verify(dto.challengeId, dto.code, this.resolveCallerId(request));
  }

  /** POST /auth/register/resend: email the registration code again (a few times, not too soon). */
  @Post('register/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register, step two: email the code again' })
  @ApiOkResponse({ type: OtpChallengeDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async resendRegistrationCode(@Body() dto: ResendCodeDto): Promise<OtpChallengeDto> {
    return this.registration.resend(dto.challengeId);
  }

  /**
   * POST /auth/login
   * Public endpoint: step one of signing in. Checks the password.
   *
   * With two-step sign-in on (the default) no session is created: a code is emailed and the answer holds a
   * `challenge` to send back to /auth/login/verify. With it off the answer holds the `tokens` straight away.
   *
   * Request: LoginDto (username, password)
   * Response (200): LoginResponseDto
   * Errors:
   *   401: AUTH-401 - Invalid credentials (same for unknown user and wrong password)
   *   422: VAL-422 - Validation failed
   *   503: OTP-503 - The code could not be sent
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in: check the password, then (two-step) email a code' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.loginFlow.start(
      loginDto.username,
      loginDto.password,
      this.resolveCallerId(request),
    );
    if (result.tokens) {
      // The browser keeps the session in HttpOnly cookies. Two-step sign-in has none to set yet.
      setAuthCookies(response, result.tokens);
    }
    return result;
  }

  /**
   * POST /auth/login/verify
   * Public endpoint: step two of signing in. The emailed code, with the challenge it answers, gets the session.
   *
   * Errors:
   *   401: OTP-401 - Wrong, expired or already used code (all the same answer)
   *   429: OTP-429 - Too many wrong codes
   */
  @Post('login/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in, step two: send the emailed code and receive tokens' })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async verifyLogin(
    @Body() dto: VerifyCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponseDto> {
    const tokens = await this.loginFlow.verify(dto.challengeId, dto.code, this.resolveCallerId(request));
    setAuthCookies(response, tokens);
    return tokens;
  }

  /**
   * POST /auth/login/resend
   * Public endpoint: email a fresh code for a sign-in that is waiting for one. At most a few, and not too soon.
   */
  @Post('login/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in, step two: email the code again' })
  @ApiOkResponse({ type: OtpChallengeDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async resendLoginCode(@Body() dto: ResendCodeDto): Promise<OtpChallengeDto> {
    return this.loginFlow.resend(dto.challengeId);
  }

  /**
   * POST /auth/password/forgot
   * Public endpoint: start a password reset. Always answers the same way, whether or not the username and email match.
   */
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Forgot password: email a reset code to the address on the account' })
  @ApiAcceptedResponse({ type: ForgotPasswordResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<ForgotPasswordResponseDto> {
    return this.passwordReset.request(dto.username, dto.email, this.resolveCallerId(request));
  }

  /** POST /auth/password/resend: the reset code again. Answers the same way whatever the challenge's state. */
  @Post('password/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Forgot password: email the code again' })
  @ApiAcceptedResponse({ type: ForgotPasswordResponseDto })
  async resendResetCode(@Body() dto: ResendCodeDto): Promise<ForgotPasswordResponseDto> {
    return this.passwordReset.resend(dto.challengeId);
  }

  /**
   * POST /auth/password/verify
   * Public endpoint: the emailed code, for a reset. A right one returns a one-time token for /auth/password/reset.
   */
  @Post('password/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forgot password: send the emailed code and receive a one-time reset token' })
  @ApiOkResponse({ type: ResetTokenResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async verifyResetCode(
    @Body() dto: VerifyCodeDto,
    @Req() request: Request,
  ): Promise<ResetTokenResponseDto> {
    return this.passwordReset.verifyCode(dto.challengeId, dto.code, this.resolveCallerId(request));
  }

  /**
   * POST /auth/password/reset
   * Public endpoint: set the new password with the reset token. The password follows the registration rules, must
   * differ from the current one, and ends every session. The person then signs in again.
   *
   * Errors:
   *   401: OTP-401 - The reset token is wrong, expired or used
   *   422: VAL-422 - The password breaks the rules; PWD-422 - it is the same as the current one
   */
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Forgot password: set a new password' })
  @ApiNoContentResponse({ description: 'The password was changed. Every session was ended.' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.passwordReset.resetPassword(dto.resetToken, dto.newPassword);
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
   * PUT /auth/me/two-factor
   * Protected: switch two-step sign-in on or off for the signed-in user. Off unless they switch it on.
   * Cookie-authenticated, so it needs the CSRF header.
   */
  @Put('me/two-factor')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch two-step sign-in on or off for yourself' })
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async setTwoFactor(
    @Body() dto: UpdateTwoFactorDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    this.requireCsrfForCookieSession(request);
    return this.accountSecurity.setTwoFactor(user.userId, dto.enabled);
  }

  /**
   * POST /auth/me/password
   * Protected: change the signed-in user's password. The current password must be right: three wrong ones in a row end
   * the session (423). A right one with an acceptable new password ends every session and issues a fresh pair for this one.
   *
   * Errors: 403 PWD-403 (wrong current password, with attemptsLeft), 423 PWD-423 (session ended),
   *         422 PWD-422 (same as the current password) or VAL-422.
   */
  @Post('me/password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change your password (current password first; three wrong tries end the session)' })
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponseDto> {
    this.requireCsrfForCookieSession(request);
    const refreshToken = readCookie(request.headers.cookie, REFRESH_TOKEN_COOKIE);
    try {
      const tokens = await this.accountSecurity.changePassword(
        user.userId,
        dto.currentPassword,
        dto.newPassword,
        refreshToken,
      );
      setAuthCookies(response, tokens);
      return tokens;
    } catch (error) {
      if (error instanceof PasswordLockedException) {
        // The session is over: its refresh token is revoked, and the browser is told to forget both cookies.
        clearAuthCookies(response);
      }
      throw error;
    }
  }

  /**
   * A request authenticated by the cookie alone, and not by an Authorization header, must carry the CSRF header: the browser
   * attaches cookies to any request, whoever started it, and these two routes change what protects the account.
   */
  private requireCsrfForCookieSession(request: Request): void {
    if (request.headers.authorization === undefined && !hasCsrfHeader(request.headers)) {
      throw new UnauthorisedException('Unauthorised');
    }
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
