export class SoraCreateDto {
  prompt!: string;
  model?: 'sora-2' | 'sora-2-pro';
  seconds?: '4' | '8' | '12';
  size?: '720x1280' | '1280x720' | '1024x1792' | '1792x1024';
}
