import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ClientErrorDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  sessionId!: string;

  @IsIn(['error', 'warning', 'critical'])
  severity!: 'error' | 'warning' | 'critical';

  @IsString()
  @MaxLength(500)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  errorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  stack?: string;

  @IsString()
  @MaxLength(512)
  route!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  release?: string;

  @IsISO8601()
  timestamp!: string;

  @IsObject()
  context!: Record<string, string | number | boolean | null>;
}
