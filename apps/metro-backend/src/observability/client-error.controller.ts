import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClientErrorDto } from './dto/client-error.dto';

@Controller('client-errors')
export class ClientErrorController {
  private readonly logger = new Logger(ClientErrorController.name);

  @Post()
  @HttpCode(202)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  capture(@Body() event: ClientErrorDto): void {
    const record = JSON.stringify({
      event: 'frontend_error',
      eventId: event.eventId,
      sessionId: event.sessionId,
      severity: event.severity,
      message: redact(event.message, 500),
      errorName: event.errorName,
      stack: event.stack ? redact(event.stack, 8_000) : undefined,
      route: event.route.split('?')[0].slice(0, 512),
      release: event.release,
      timestamp: event.timestamp,
      context: Object.fromEntries(
        Object.entries(event.context)
          .filter(([key]) => !SENSITIVE_KEY.test(key))
          .slice(0, 20)
          .map(([key, value]) => [
            key.slice(0, 80),
            typeof value === 'string' ? redact(value, 500) : value,
          ]),
      ),
    });
    if (event.severity === 'critical') {
      this.logger.error(record);
      return;
    }
    this.logger.warn(record);
  }
}

const SENSITIVE_KEY =
  /token|authorization|cookie|password|secret|credential|user.?id|latitude|longitude|coordinate/i;

function redact(value: string, maximumLength: number): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|key|secret|code)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, maximumLength);
}
