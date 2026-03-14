import { Injectable } from '@nestjs/common';
import { spawnSync } from 'child_process';
import { ConfigService } from '@nestjs/config';

type HealthResult = { service: string; status: 'ok' | 'error'; message?: string };

@Injectable()
export class HealthService {
  constructor(private readonly config: ConfigService) {}

  checkOpenAI(): HealthResult {
    return this.checkKey('openai', 'OPENAI_API_KEY');
  }

  checkPexels(): HealthResult {
    return this.checkKey('pexels', 'PEXELS_API_KEY');
  }

  checkElevenLabs(): HealthResult {
    const key = this.checkKey('elevenlabs', 'ELEVENLABS_API_KEY');
    if (key.status === 'error') return key;
    const voiceId = this.config.get<string>('VOICE_ID');
    if (!voiceId) {
      return { service: 'elevenlabs', status: 'error', message: 'VOICE_ID is not set' };
    }
    return { service: 'elevenlabs', status: 'ok' };
  }

  checkFfmpeg(): HealthResult {
    try {
      const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      if (res.status === 0) return { service: 'ffmpeg', status: 'ok' };
      return { service: 'ffmpeg', status: 'error', message: 'ffmpeg not in PATH' };
    } catch {
      return { service: 'ffmpeg', status: 'error', message: 'ffmpeg not in PATH' };
    }
  }

  checkAll(): HealthResult[] {
    return [this.checkOpenAI(), this.checkPexels(), this.checkElevenLabs(), this.checkFfmpeg()];
  }

  private checkKey(service: string, keyName: string): HealthResult {
    const key = this.config.get<string>(keyName);
    if (!key) {
      return { service, status: 'error', message: `${keyName} is not set` };
    }
    return { service, status: 'ok' };
  }
}
