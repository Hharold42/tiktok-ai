import { Body, Controller, Post } from '@nestjs/common';
import { TtsRequestDto } from './tts.dto';
import { TtsService } from './tts.service';

@Controller('tts')
export class TtsController {
  constructor(private readonly tts: TtsService) {}

  @Post()
  async synthesize(@Body() body: TtsRequestDto) {
    return this.tts.synthesize(body);
  }
}
