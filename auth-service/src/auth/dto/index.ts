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
  id!: number;
  username!: string;
  roles!: string[];
  createdOn!: Date;
}

/**
 * Setup profile request DTO - Link or create account
 */
export class SetupProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  client_name!: string;

  @IsString()
  @Matches(/^\+?[0-9\s\-\(\)]{10,}$/, {
    message: 'Phone number must be valid format',
  })
  phone_no!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date of birth must be YYYY-MM-DD format',
  })
  dob?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  accountId?: number;
}

/**
 * Setup profile response DTO
 */
export class SetupProfileResponseDto {
  accountId!: number;
  status!: string;
  message!: string;
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
