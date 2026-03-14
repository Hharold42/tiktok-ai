export class TtsRequestDto {
  text!: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  languageCode?: string;
}
