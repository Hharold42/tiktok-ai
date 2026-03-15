import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { SoraCreateDto } from './sora.dto';
import { mkdir } from 'fs/promises';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

@Injectable()
export class SoraService {
  private readonly ai: OpenAI;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    this.ai = new OpenAI({ apiKey, timeout: 180000 });
  }

  async create(input: SoraCreateDto) {
    const prompt = (input.prompt ?? '').trim();
    if (!prompt) {
      throw new InternalServerErrorException('prompt is required');
    }

    const model = input.model ?? 'sora-2';
    const seconds = input.seconds ?? '8';
    const size = input.size ?? '720x1280';

    const response = await this.ai.videos.create({
      model,
      prompt,
      seconds,
      size,
    });

    return response;
  }

  async retrieve(id: string) {
    if (!id) {
      throw new InternalServerErrorException('id is required');
    }
    return this.ai.videos.retrieve(id);
  }

  async download(id: string) {
    if (!id) {
      throw new InternalServerErrorException('id is required');
    }

    const dir = join(process.cwd(), 'resources', 'sora');
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${id}.mp4`);

    const content = await this.ai.videos.downloadContent(id);
    if (!content.body) {
      throw new InternalServerErrorException('No response body for download');
    }

    const readable = Readable.fromWeb(content.body as any);
    const writable = createWriteStream(filePath);
    await pipeline(readable, writable);

    return { id, filePath };
  }

  async createAndDownload(input: {
    prompt: string;
    seconds: '4' | '8' | '12';
    size: '720x1280' | '1280x720';
    generationId: string;
    sceneIndex: number;
  }) {
    const created = await this.ai.videos.create({
      model: 'sora-2',
      prompt: input.prompt,
      seconds: input.seconds,
      size: input.size,
    });

    const videoId = created.id;
    const status = await this.waitForCompletion(videoId);
    if (status.status !== 'completed') {
      throw new InternalServerErrorException(`Sora generation failed: ${status.status}`);
    }

    const content = await this.ai.videos.downloadContent(videoId);
    if (!content.body) {
      throw new InternalServerErrorException('No response body for download');
    }

    const dir = join(process.cwd(), 'resources', input.generationId, 'sora');
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `scene_${input.sceneIndex}.mp4`);

    const readable = Readable.fromWeb(content.body as any);
    const writable = createWriteStream(filePath);
    await pipeline(readable, writable);

    return { id: videoId, filePath };
  }

  private async waitForCompletion(id: string) {
    const maxAttempts = 120;
    const delayMs = 3000;
    for (let i = 0; i < maxAttempts; i += 1) {
      const res = await this.ai.videos.retrieve(id);
      if (res.status === 'completed' || res.status === 'failed') return res;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return this.ai.videos.retrieve(id);
  }
}
