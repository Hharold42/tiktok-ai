export class RunwayTestDto {
  promptText?: string;
  ratio?: '1280:720' | '720:1280' | '1080:1920' | '1920:1080';
  duration?: 4 | 6 | 8;
  model?: 'gen4.5' | 'veo3.1' | 'veo3.1_fast' | 'veo3';
  audio?: boolean;
}
