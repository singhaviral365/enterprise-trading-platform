import {
  IsString,
  IsArray,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  ArrayMinSize,
  IsEnum,
  IsNumber,
  Min,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PASSWORD_DIGIT,
  PASSWORD_SYMBOL,
  PASSWORD_UPPERCASE,
  USERNAME_DIGIT,
  USERNAME_PATTERN,
  USERNAME_SYMBOL,
} from '../credential-rules';

/**
 * Register request DTO with validation per contracts/auth-api.yaml
 */
export class RegisterDto {
  @ApiProperty({
    example: 'trader.one7',
    minLength: 3,
    maxLength: 64,
    pattern: USERNAME_PATTERN.source,
    description:
      'Starts with a letter; letters, digits and single . _ - separators; cannot end with a separator; must include at least one number and one of . _ -',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(USERNAME_PATTERN, {
    message:
      'Username must start with a letter and contain only letters, numbers and single dots, underscores or hyphens between them',
  })
  @Matches(USERNAME_DIGIT, { message: 'Username must contain at least one number' })
  @Matches(USERNAME_SYMBOL, { message: 'Username must contain at least one of . _ -' })
  username!: string;

  @ApiProperty({
    example: 'Tr@ding-Desk-2026',
    minLength: 12,
    maxLength: 128,
    writeOnly: true,
    description:
      'At least one capital letter, one number and one special symbol; must differ from the username.',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(PASSWORD_UPPERCASE, { message: 'Password must contain at least one capital letter' })
  @Matches(PASSWORD_DIGIT, { message: 'Password must contain at least one number' })
  @Matches(PASSWORD_SYMBOL, { message: 'Password must contain at least one special symbol' })
  password!: string;

  @ApiPropertyOptional({
    example: 'priya.menon@example.com',
    maxLength: 255,
    description: 'Defaults to <username>@local.auth when omitted.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    type: [String],
    enum: ['CUSTOMER', 'ADMIN'],
    example: ['CUSTOMER'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(['CUSTOMER', 'ADMIN'], { each: true })
  roles?: string[];
}

/**
 * Login request DTO
 */
export class LoginDto {
  @ApiProperty({ example: 'priya.menon', maxLength: 64 })
  @IsString()
  @MaxLength(64)
  username!: string;

  @ApiProperty({ example: 'correct horse battery staple', maxLength: 128, writeOnly: true })
  @IsString()
  @MaxLength(128)
  password!: string;
}

/**
 * Refresh / logout request DTO. A browser sends no body: the refresh token travels in the HttpOnly
 * `refresh_token` cookie. API clients without cookies may still send it in the body.
 */
export class RefreshTokenDto {
  @ApiPropertyOptional({
    example: '9c1f7a2e4b6d8e0a2c4e6a8c0e2a4c6e8a0c2e4a6c8e0a2c',
    description: 'Omit to use the HttpOnly refresh_token cookie.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

/**
 * User response DTO
 */
export class UserResponseDto {
  @ApiProperty({ example: 1000 })
  id!: number;

  @ApiProperty({ example: 'priya.menon' })
  username!: string;

  @ApiProperty({ example: 'priya.menon@example.com' })
  email!: string;

  @ApiProperty({ type: [String], example: ['CUSTOMER'] })
  roles!: string[];

  @ApiProperty({ example: '2026-09-25T12:30:00.000Z' })
  createdOn!: Date;
}

/**
 * Setup profile request DTO - Link or create account
 */
export class SetupProfileDto {
  @ApiProperty({ example: 'Alice Trader', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  client_name!: string;

  @ApiProperty({ example: '+1-555-1234' })
  @IsString()
  @Matches(/^\+?[0-9\s\-\(\)]{10,}$/, {
    message: 'Phone number must be valid format',
  })
  phone_no!: string;

  @ApiPropertyOptional({ example: '1995-06-15' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date of birth must be YYYY-MM-DD format',
  })
  dob?: string;

  @ApiPropertyOptional({ example: 42, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  accountId?: number;
}

/**
 * Setup profile response DTO
 */
export class SetupProfileResponseDto {
  @ApiProperty({ example: 42 })
  accountId!: number;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: 'Account linked successfully' })
  message!: string;
}

/**
 * Token response DTO
 */
export class TokenResponseDto {
  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEwMDAsInJvbGVzIjpbIkNVU1RPTUVSIl0sImlhdCI6MTY5NTAwMDAwMCwiZXhwIjoxNjk1MDAwOTAwLCJpc3MiOiJhdXRoLXNlcnZpY2UifQ.signature',
  })
  accessToken!: string;

  @ApiProperty({ example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({ example: 900 })
  expiresIn!: number;
}

/**
 * Error response DTO (platform envelope)
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 'AUTH-401' })
  errorCode!: string;

  @ApiProperty({ example: 'Unauthorised' })
  message!: string;
}
