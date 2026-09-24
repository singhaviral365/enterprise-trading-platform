import {
  IsString,
  IsInt,
  IsArray,
  MinLength,
  MaxLength,
  Matches,
  Min,
  IsOptional,
  ArrayMinSize,
  IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Register request DTO with validation per contracts/auth-api.yaml
 */
export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'Username must contain only alphanumeric characters, dots, underscores, and hyphens',
  })
  username!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  accountId!: number;

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
  @IsString()
  @MaxLength(64)
  username!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

/**
 * Refresh token request DTO
 */
export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}

/**
 * User response DTO
 */
export class UserResponseDto {
  id!: string;
  username!: string;
  accountId!: number;
  roles!: string[];
  createdOn!: Date;
}

/**
 * Token response DTO
 */
export class TokenResponseDto {
  accessToken!: string;
  refreshToken!: string;
  tokenType!: string;
  expiresIn!: number;
}

/**
 * Error response DTO (platform envelope)
 */
export class ErrorResponseDto {
  errorCode!: string;
  message!: string;
}
