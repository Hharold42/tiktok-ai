export class PexelsSearchDto {
  query!: string;
  perPage?: number;
  page?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
  size?: 'large' | 'medium' | 'small';
  locale?: string;
  minDuration?: number;
  maxDuration?: number;
}
