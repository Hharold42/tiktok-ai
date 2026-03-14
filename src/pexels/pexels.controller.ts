import { Body, Controller, Post } from '@nestjs/common';
import { PexelsSearchDto } from './pexels.dto';
import { PexelsService } from './pexels.service';

@Controller('assets')
export class PexelsController {
  constructor(private readonly pexels: PexelsService) {}

  @Post('search')
  async search(@Body() body: PexelsSearchDto) {
    return this.pexels.searchVideos(body);
  }
}
