export class GenerateRequestDto {
  topic!: string;
  language?: string;
  platform?: 'tiktok' | 'shorts' | 'reels';
  durationSec?: number;
  style?: string;
  assetsPerKeyword?: number;
  assetsOrientation?: 'landscape' | 'portrait' | 'square';
  assetsMinDuration?: number;
  assetsMaxDuration?: number;
}
