import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import RunwayML, { TaskFailedError } from '@runwayml/sdk';
import { RunwayTestDto } from './runway.dto';

@Injectable()
export class RunwayService {
  private readonly client: RunwayML;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RUNWAYML_API_SECRET');
    if (!apiKey) {
      throw new Error('RUNWAYML_API_SECRET is not set');
    }
    this.client = new RunwayML({ apiKey });
  }

  async test(input: RunwayTestDto) {
    const promptText =
      input.promptText ??
      'Vertical TikTok livestream scene. A young male streamer wearing headphones sits in a gaming chair with RGB lights in the background. On screen, a casino slot machine interface is spinning. It suddenly hits a huge jackpot with flashing lights, coin animations, and big win numbers. The streamer jumps up and celebrates excitedly. Camera: static livestream camera with a small webcam overlay. Lighting: colorful RGB gaming lights, bright screen glow on face. Style: realistic Twitch livestream, cinematic lighting. Quality: ultra detailed, clean UI, stable motion, no artifacts.';
    const ratio = input.ratio ?? '1280:720';
    const duration = input.duration ?? 8;
    const model = input.model ?? 'gen4.5';
    const audio = input.audio ?? false;

    try {
      const task = await this.client.textToVideo
        .create({
          model,
          promptText,
          ratio,
          duration,
          audio,
        } as any)
        .waitForTaskOutput();

      return {
        task,
        videoUrl: task.output?.[0] ?? null,
      };
    } catch (error) {
      if (error instanceof TaskFailedError) {
        throw new InternalServerErrorException({
          message: 'Runway task failed',
          taskDetails: error.taskDetails,
        });
      }
      throw error;
    }
  }

  async testVeo(input: RunwayTestDto) {
    const promptText =
      input.promptText ??
      'Vertical TikTok-style micro-story in 3 quick scenes, ultra realistic, cinematic lighting, stable motion, no artifacts. Scene 1 (0–2s): Static livestream camera. A young male streamer with headphones sits in a gaming chair, RGB lights in the background. On screen, a casino slot interface spins. He looks focused, slight nervous smile. Scene 2 (2–5s): Jackpot hits. Screen flashes with big win numbers, coin animation. The streamer’s eyes widen, he leans forward, mouth opens in surprise. Scene 3 (5–8s): He jumps up, throws his hands up, laughs and celebrates. The camera remains static like a real livestream, with small webcam overlay. Bright screen glow on face, clean UI, realistic Twitch aesthetic. Style: realistic livestream, clean UI, crisp details, smooth motion, rich RGB lighting, cinematic contrast.';
    const ratio = input.ratio ?? '720:1280';
    const duration = input.duration ?? 8;
    const model = input.model ?? 'veo3.1';
    const audio = input.audio ?? false;

    try {
      const task = await this.client.textToVideo
        .create({
          model,
          promptText,
          ratio,
          duration,
          audio,
        } as any)
        .waitForTaskOutput();

      return {
        task,
        videoUrl: task.output?.[0] ?? null,
      };
    } catch (error) {
      if (error instanceof TaskFailedError) {
        throw new InternalServerErrorException({
          message: 'Runway task failed',
          taskDetails: error.taskDetails,
        });
      }
      throw error;
    }
  }

  async testVeoWedding(input: RunwayTestDto) {
    const promptText =
      input.promptText ??
      'High-end realistic wedding cinematography, single continuous shot, no fast cuts. Vertical 9:16. A bride and groom stand close together in soft golden hour light, gentle breeze moving the veil. Camera: slow, steady gimbal push-in from medium shot to close-up, shallow depth of field, creamy bokeh, natural skin tones. Environment: elegant outdoor venue with white florals and warm sunlight, subtle lens flare, calm atmosphere. Style: cinematic, luxury wedding film, ultra realistic, clean, stable motion, no artifacts, no text.';
    const ratio = input.ratio ?? '720:1280';
    const duration = input.duration ?? 4;
    const model = input.model ?? 'veo3.1';
    const audio = input.audio ?? false;

    try {
      const task = await this.client.textToVideo
        .create({
          model,
          promptText,
          ratio,
          duration,
          audio,
        } as any)
        .waitForTaskOutput();

      return {
        task,
        videoUrl: task.output?.[0] ?? null,
      };
    } catch (error) {
      if (error instanceof TaskFailedError) {
        throw new InternalServerErrorException({
          message: 'Runway task failed',
          taskDetails: error.taskDetails,
        });
      }
      throw error;
    }
  }
}
