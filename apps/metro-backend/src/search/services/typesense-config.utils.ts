import { ConfigService } from '@nestjs/config';

export function getConfiguredNumber(
  configService: ConfigService,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const configured = Number(configService.get(key));
  return Number.isFinite(configured) &&
    configured >= minimum &&
    configured <= maximum
    ? configured
    : fallback;
}
