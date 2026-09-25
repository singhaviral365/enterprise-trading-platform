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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Register request DTO with validation per contracts/auth-api.yaml
 */
export class RegisterDto {
  @ApiProperty({
    example: 'priya.menon',
    minLength: 3,
    maxLength: 64,
    pattern: '^[a-zA-Z0-9._-]+$',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'Username must contain only alphanumeric characters, dots, underscores, and hyphens',
  })
  username!: string;

  @ApiProperty({
    example: 'correct horse battery staple',
    minLength: 12,
    maxLength: 128,
    writeOnly: true,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

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
 * Refresh token request DTO
 */
export class RefreshTokenDto {
  @ApiProperty({
    example: '9c1f7a2e4b6d8e0a2c4e6a8c0e2a4c6e8a0c2e4a6c8e0a2c',
  })
  @IsString()
  refreshToken!: string;
}

/**
 * User response DTO
 */
export class UserResponseDto {
  @ApiProperty({ example: 1000 })
  id!: number;

  @ApiProperty({ example: 'priya.menon' })
  username!: string;

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
