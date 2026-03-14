import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GenerateRequestDto } from './dto/generate.dto';
import { PexelsService } from './pexels/pexels.service';
import { TtsService } from './tts/tts.service';
import { RenderService } from './render/render.service';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class AppService {
  private readonly ai: OpenAI;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly pexels: PexelsService,
    private readonly tts: TtsService,
    private readonly render: RenderService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    this.ai = new OpenAI({ apiKey });
    this.model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-5.4';
  }

  getHello(): string {
    return 'Hello World!';
  }

  async generateScenario(input: GenerateRequestDto) {
    const topic = (input.topic ?? '').trim();
    if (!topic) {
      throw new BadRequestException('topic is required');
    }

    const language = 'en';
    const platform = input.platform ?? 'tiktok';
    const durationSec = Number.isFinite(input.durationSec)
      ? Math.max(5, Math.min(180, Math.round(input.durationSec as number)))
      : 30;
    const style = (input.style ?? '').trim();

    const prompt = this.buildPrompt({
      topic,
      language,
      platform,
      durationSec,
      style,
    });

    const response = await this.ai.responses.create({
      model: this.model,
      input: [
        {
          role: 'system',
          content:
            'Ты сценарист коротких вертикальных видео (TikTok/Shorts/Reels).',
        },
        { role: 'user', content: prompt },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'scenario',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              script: { type: 'string' },
              voiceover: { type: 'string' },
              keywords: {
                type: 'array',
                items: { type: 'string' },
                minItems: 5,
                maxItems: 10,
              },
              prompt: { type: 'string' },
            },
            required: ['script', 'voiceover', 'keywords', 'prompt'],
            additionalProperties: false,
          },
        },
      },
    });

    const text = response.output_text ?? '';
    const parsed = this.parseJsonResponse(text);

    console.log('Parsed response: ', parsed);

    if (!parsed) {
      throw new InternalServerErrorException('Model returned invalid JSON');
    }

    const normalized = this.normalizeParsed(parsed);

    const assetsPerKeyword = Number.isFinite(input.assetsPerKeyword)
      ? Math.max(1, Math.min(5, Math.round(input.assetsPerKeyword as number)))
      : 3;
    const assetsOrientation = input.assetsOrientation ?? 'portrait';
    const assetsMinDuration = Number.isFinite(input.assetsMinDuration)
      ? Math.max(0, Math.floor(input.assetsMinDuration as number))
      : 2;
    const assetsMaxDuration = Number.isFinite(input.assetsMaxDuration)
      ? Math.max(1, Math.floor(input.assetsMaxDuration as number))
      : 12;

    let assetsError: string | null = null;
    let assets = [] as Array<{ keyword: string; videos: any[] }>;
    try {
      assets = await this.fetchAssetsForKeywords(normalized.keywords, {
        perKeyword: assetsPerKeyword,
        orientation: assetsOrientation,
        minDuration: assetsMinDuration,
        maxDuration: assetsMaxDuration,
      });
    } catch (err) {
      assetsError = err instanceof Error ? err.message : 'Pexels error';
    }

    const generationId = Date.now().toString();
    const resourcesDir = join(process.cwd(), 'resources', generationId);
    const resultDir = join(process.cwd(), 'result', generationId);
    await mkdir(resourcesDir, { recursive: true });
    await mkdir(resultDir, { recursive: true });

    const ttsResult = await this.tts.synthesize(
      {
        text: normalized.voiceover,
        languageCode: 'en',
      },
      resourcesDir,
    );

    const payload = {
      model: this.model,
      ...normalized,
      assets,
      tts: ttsResult,
      generationId,
      topic,
      platform,
      durationSec,
      style,
      assetsError,
    };

    await writeFile(
      join(resourcesDir, 'generation.json'),
      JSON.stringify(payload, null, 2),
    );
    await writeFile(
      join(resultDir, 'result.json'),
      JSON.stringify(payload, null, 2),
    );
    await writeFile(
      join(process.cwd(), 'resources', 'latest.json'),
      JSON.stringify(payload, null, 2),
    );
    await writeFile(
      join(process.cwd(), 'result', 'latest.json'),
      JSON.stringify(payload, null, 2),
    );

    if (assets.length === 0) {
      return {
        ...payload,
        render: null,
        renderSkipped: 'No assets available (Pexels error)',
      };
    }

    const renderResult = await this.render.renderLatestOr(generationId);

    return {
      ...payload,
      render: renderResult,
    };
  }

  private buildPrompt(input: {
    topic: string;
    language: string;
    platform: 'tiktok' | 'shorts' | 'reels';
    durationSec: number;
    style: string;
  }) {
    const styleLine = input.style
      ? `Style: ${input.style}.`
      : 'Style: neutral, dynamic.';

    return [
      'You are a writer for short vertical videos (TikTok/Shorts/Reels).',
      `Language: ${input.language}.`,
      `Platform: ${input.platform}.`,
      `Duration: ${input.durationSec} seconds.`,
      styleLine,
      `Topic: ${input.topic}.`,
      'Generate:',
      '1) Script (short phrases by shots, with a hook in the first 2–3 seconds).',
      '2) 5–10 keywords.',
      '3) One text prompt for generating videos/images in a consistent style.',
      '4) Separate voiceover text (natural narration, 10–25% shorter than script).',
      'Return strict JSON with fields: script (string), voiceover (string), keywords (array of strings), prompt (string).',
    ].join('\n');
  }

  private parseJsonResponse(text: string): Record<string, unknown> | null {
    const cleaned = text.trim();
    if (!cleaned) return null;

    const withoutFences = cleaned
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();

    const firstBrace = withoutFences.indexOf('{');
    const lastBrace = withoutFences.lastIndexOf('}');
    const jsonSlice =
      firstBrace >= 0 && lastBrace > firstBrace
        ? withoutFences.slice(firstBrace, lastBrace + 1)
        : withoutFences;

    try {
      const parsed = JSON.parse(jsonSlice);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  private normalizeParsed(parsed: Record<string, unknown>) {
    const script = String(parsed.script ?? '').trim();
    const voiceover = String(parsed.voiceover ?? '').trim();
    const prompt = String(parsed.prompt ?? '').trim();

    let keywords: string[] = [];
    if (Array.isArray(parsed.keywords)) {
      keywords = parsed.keywords.map((k) => String(k).trim()).filter(Boolean);
    } else if (typeof parsed.keywords === 'string') {
      keywords = parsed.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
    }

    const uniqueKeywords = Array.from(new Set(keywords)).slice(0, 10);

    if (!script || !voiceover || !prompt || uniqueKeywords.length < 5) {
      throw new InternalServerErrorException(
        'Model response missing required fields',
      );
    }

    return {
      script,
      voiceover,
      keywords: uniqueKeywords,
      prompt,
    };
  }

  private async fetchAssetsForKeywords(
    keywords: string[],
    opts: {
      perKeyword: number;
      orientation: 'landscape' | 'portrait' | 'square';
      minDuration: number;
      maxDuration: number;
    },
  ) {
    const results = await Promise.all(
      keywords.map(async (keyword) => {
        const response = await this.pexels.searchVideos({
          query: keyword,
          perPage: opts.perKeyword,
          orientation: opts.orientation,
          minDuration: opts.minDuration,
          maxDuration: opts.maxDuration,
        });

        return {
          keyword,
          videos: response.videos,
        };
      }),
    );

    return results;
  }
}
