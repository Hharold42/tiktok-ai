import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PexelsSearchDto } from './pexels.dto';

type PexelsVideoFile = {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  link: string;
};

type PexelsVideo = {
  id: number;
  url: string;
  image: string;
  duration: number;
  user: { id: number; name: string; url: string };
  video_files: PexelsVideoFile[];
};

type PexelsSearchResponse = {
  page: number;
  per_page: number;
  total_results: number;
  url: string;
  videos: PexelsVideo[];
};

@Injectable()
export class PexelsService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.pexels.com';

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('PEXELS_API_KEY');
    if (!apiKey) {
      throw new Error('PEXELS_API_KEY is not set');
    }
    this.apiKey = apiKey;
  }

  async searchVideos(input: PexelsSearchDto) {
    const query = (input.query ?? '').trim();
    if (!query) {
      throw new BadRequestException('query is required');
    }

    const perPage = this.clampNumber(input.perPage, 1, 80, 10);
    const page = this.clampNumber(input.page, 1, 1000, 1);

    const params = new URLSearchParams({
      query,
      per_page: String(perPage),
      page: String(page),
    });

    if (input.orientation) params.set('orientation', input.orientation);
    if (input.size) params.set('size', input.size);
    if (input.locale) params.set('locale', input.locale);
    if (Number.isFinite(input.minDuration))
      params.set('min_duration', String(Math.max(0, Math.floor(input.minDuration as number))));
    if (Number.isFinite(input.maxDuration))
      params.set('max_duration', String(Math.max(1, Math.floor(input.maxDuration as number))));

    const url = `${this.baseUrl}/videos/search?${params.toString()}`;

    const res = await this.fetchWithTimeout(url, {
      headers: {
        Authorization: this.apiKey,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new InternalServerErrorException(
        `Pexels API error: ${res.status} ${res.statusText} - ${body}`,
      );
    }

    const data = (await res.json()) as PexelsSearchResponse;

    return {
      page: data.page,
      per_page: data.per_page,
      total_results: data.total_results,
      url: data.url,
      videos: data.videos.map((v) => ({
        id: v.id,
        url: v.url,
        image: v.image,
        duration: v.duration,
        user: v.user,
        video_files: v.video_files.map((f) => ({
          id: f.id,
          quality: f.quality,
          file_type: f.file_type,
          width: f.width,
          height: f.height,
          link: f.link,
        })),
      })),
    };
  }

  private clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.round(value as number)));
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (timeoutMs < 60000) {
        return await this.fetchWithTimeout(url, init, timeoutMs + 10000);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
