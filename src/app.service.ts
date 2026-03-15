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
import { SoraService } from './sora/sora.service';
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
    private readonly sora: SoraService,
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
              scenes: {
                type: 'array',
                minItems: 5,
                maxItems: 9,
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    keywords: {
                      type: 'array',
                      items: { type: 'string' },
                      minItems: 2,
                      maxItems: 4,
                    },
                  },
                  required: ['text', 'keywords'],
                  additionalProperties: false,
                },
              },
              prompt: { type: 'string' },
            },
            required: ['script', 'voiceover', 'keywords', 'scenes', 'prompt'],
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

    const generationId = Date.now().toString();
    const resourcesDir = join(process.cwd(), 'resources', generationId);
    const resultDir = join(process.cwd(), 'result', generationId);
    await mkdir(resourcesDir, { recursive: true });
    await mkdir(resultDir, { recursive: true });

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
    let assets = [] as Array<{
      sceneIndex: number;
      keywords: string[];
      query: string;
      videos: any[];
      localPath?: string;
      source: 'sora' | 'pexels';
    }>;
    try {
      assets = await this.fetchSoraForScenes(normalized.scenes, {
        durationSec,
        size: '720x1280',
        generationId,
      });
      if (assets.length === 0) {
        assets = await this.fetchAssetsForScenes(normalized.scenes, {
          perKeyword: assetsPerKeyword,
          orientation: assetsOrientation,
          minDuration: assetsMinDuration,
          maxDuration: assetsMaxDuration,
        });
      }
    } catch (err) {
      assetsError = err instanceof Error ? err.message : 'Pexels error';
    }

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
      '2) 5–10 overall keywords.',
      '3) Scenes: 5–9 items, each with text and 2–4 keywords.',
      '4) One text prompt for generating videos/images in a consistent style.',
      '5) Separate voiceover text (natural narration, 10–25% shorter than script).',
      'Return strict JSON with fields: script (string), voiceover (string), keywords (array of strings), scenes (array), prompt (string).',
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

    let scenes: Array<{ text: string; keywords: string[] }> = [];
    if (Array.isArray(parsed.scenes)) {
      scenes = parsed.scenes
        .map((s) => {
          const text = String((s as any)?.text ?? '').trim();
          let sceneKeywords: string[] = [];
          const raw = (s as any)?.keywords;
          if (Array.isArray(raw)) {
            sceneKeywords = raw.map((k) => String(k).trim()).filter(Boolean);
          } else if (typeof raw === 'string') {
            sceneKeywords = raw.split(',').map((k) => k.trim()).filter(Boolean);
          }
          return { text, keywords: sceneKeywords.slice(0, 4) };
        })
        .filter((s) => s.text && s.keywords.length >= 2);
    }

    if (!script || !voiceover || !prompt || uniqueKeywords.length < 5 || scenes.length < 5) {
      throw new InternalServerErrorException(
        'Model response missing required fields',
      );
    }

    return {
      script,
      voiceover,
      keywords: uniqueKeywords,
      scenes,
      prompt,
    };
  }

  private async fetchAssetsForScenes(
    scenes: Array<{ text: string; keywords: string[] }>,
    opts: {
      perKeyword: number;
      orientation: 'landscape' | 'portrait' | 'square';
      minDuration: number;
      maxDuration: number;
    },
  ) {
    const results = await Promise.all(
      scenes.map(async (scene, index) => {
        const query = scene.keywords[0] ?? scene.text;
        const response = await this.pexels.searchVideos({
          query,
          perPage: opts.perKeyword,
          orientation: opts.orientation,
          minDuration: opts.minDuration,
          maxDuration: opts.maxDuration,
        });

        return {
          sceneIndex: index,
          keywords: scene.keywords,
          query,
          videos: response.videos,
          source: 'pexels' as const,
        };
      }),
    );

    return results;
  }

  private async fetchSoraForScenes(
    scenes: Array<{ text: string; keywords: string[] }>,
    opts: { durationSec: number; size: '720x1280' | '1280x720'; generationId: string },
  ) {
    const perSceneSeconds = this.pickSoraSeconds(
      Math.max(1, Math.floor(opts.durationSec / Math.max(1, scenes.length))),
    );
    const baseStyle =
      'Simple, realistic scene shot on a high-end camera. Natural lighting, stable motion, no artifacts, clean composition, cinematic but minimal, no text overlays.';

    const results = await Promise.all(
      scenes.map(async (scene, index) => {
        const prompt = `${baseStyle} Scene: ${scene.text}. Keywords: ${scene.keywords.join(', ')}.`;
        const download = await this.sora.createAndDownload({
          prompt,
          seconds: String(perSceneSeconds),
          size: opts.size,
          generationId: opts.generationId,
          sceneIndex: index,
        });

        return {
          sceneIndex: index,
          keywords: scene.keywords,
          query: scene.keywords[0] ?? scene.text,
          videos: [],
          localPath: download.filePath,
          source: 'sora' as const,
        };
      }),
    );

    return results;
  }

  private pickSoraSeconds(target: number): 4 | 8 | 12 {
    if (target <= 4) return 4;
    if (target <= 8) return 8;
    return 12;
  }
}
