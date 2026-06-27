import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateGTFSDatasetDto {
  @ApiProperty({
    description: 'SHA-256 hash of the GTFS zip file',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  fileHash!: string;

  @ApiProperty({
    description: 'Size of the GTFS zip file in bytes',
    example: 12345678,
  })
  @IsNumber()
  fileSize!: number;

  @ApiProperty({
    description: 'Version identifier for the GTFS dataset',
    example: '2024-10-01',
    required: false,
  })
  @IsOptional()
  @IsString()
  version?: string;
}

export class GTFSDatasetResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the GTFS dataset',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Date and time when the dataset was last updated',
    example: '2024-10-01T03:00:00Z',
  })
  lastUpdated!: Date;

  @ApiProperty({
    description: 'SHA-256 hash of the GTFS zip file',
    example: 'a1b2c3d4e5f6...',
  })
  fileHash!: string;

  @ApiProperty({
    description: 'Size of the GTFS zip file in bytes',
    example: 12345678,
  })
  fileSize!: number;

  @ApiProperty({
    description: 'Version identifier for the GTFS dataset',
    example: '2024-10-01',
    required: false,
  })
  version?: string;
}

export class ImportStatusDto {
  @ApiProperty({
    description: 'Current import status',
    example: 'processing',
    enum: ['idle', 'downloading', 'processing', 'completed', 'error'],
  })
  status!: 'idle' | 'downloading' | 'processing' | 'completed' | 'error';

  @ApiProperty({
    description: 'Progress percentage (0-100)',
    example: 75,
  })
  progress!: number;

  @ApiProperty({
    description: 'Current operation message',
    example: 'Processing routes.txt...',
  })
  message!: string;

  @ApiProperty({
    description: 'Date and time of last successful import',
    example: '2024-10-01T03:15:00Z',
    required: false,
  })
  lastImport?: Date;
}
