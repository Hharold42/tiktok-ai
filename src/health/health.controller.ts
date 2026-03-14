import { Controller, Get, Param } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get(':service')
  check(@Param('service') service: string) {
    switch (service) {
      case 'openai':
        return this.health.checkOpenAI();
      case 'pexels':
        return this.health.checkPexels();
      case 'elevenlabs':
        return this.health.checkElevenLabs();
      case 'ffmpeg':
        return this.health.checkFfmpeg();
      case 'all':
        return this.health.checkAll();
      default:
        return { service, status: 'error', message: 'unknown service' };
    }
  }
}
