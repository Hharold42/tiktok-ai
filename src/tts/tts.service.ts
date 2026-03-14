import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElevenLabs, ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { TtsRequestDto } from './tts.dto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class TtsService {
  private readonly client: ElevenLabsClient;
  private readonly voiceId: string;
  private readonly outputDir: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is not set');
    }

    const voiceId = this.config.get<string>('VOICE_ID');
    console.log('VOICE_ID:', voiceId);

    if (!voiceId) {
      throw new Error('VOICE_ID is not set');
    }

    this.client = new ElevenLabsClient({ apiKey });
    this.voiceId = voiceId;
    this.outputDir = join(process.cwd(), 'output');
  }

  async synthesize(input: TtsRequestDto, targetDir?: string) {
    const text = (input.text ?? '').trim();

    if (!text) {
      throw new InternalServerErrorException('text is required');
    }

    const voiceId = (input.voiceId ?? this.voiceId).trim();
    const modelId = (input.modelId ?? 'eleven_multilingual_v2').trim();
    const outputFormat = this.normalizeOutputFormat(input.outputFormat);
    const languageCode = (input.languageCode ?? 'en').trim();

    const audioStream = await this.client.textToSpeech.convert(voiceId, {
      text,
      modelId,
      outputFormat,
      languageCode,
    });

    const arrayBuffer = await new Response(
      audioStream as unknown as ReadableStream,
    ).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const dir = targetDir ?? this.outputDir;
    await mkdir(dir, { recursive: true });
    const extension = outputFormat.split('_')[0] || 'mp3';
    const filename = `tts_${Date.now()}.${extension}`;
    const filePath = join(dir, filename);
    await writeFile(filePath, buffer);

    return {
      voiceId,
      modelId,
      outputFormat,
      languageCode,
      bytes: buffer.length,
      filePath,
    };
  }

  private normalizeOutputFormat(
    value?: string,
  ): ElevenLabs.TextToSpeechConvertRequestOutputFormat {
    const fallback: ElevenLabs.TextToSpeechConvertRequestOutputFormat =
      'mp3_44100_128';
    const v = (value ?? '').trim();
    if (!v) return fallback;

    const allowed: ElevenLabs.TextToSpeechConvertRequestOutputFormat[] = [
      'mp3_44100_128',
      'mp3_44100_64',
      'mp3_22050_32',
      'pcm_44100',
      'pcm_22050',
      'ulaw_8000',
      'alaw_8000',
    ];

    return (allowed as string[]).includes(v)
      ? (v as ElevenLabs.TextToSpeechConvertRequestOutputFormat)
      : fallback;
  }
}
