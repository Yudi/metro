import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  healthCheck(): { health: boolean } {
    return { health: true };
  }
}
