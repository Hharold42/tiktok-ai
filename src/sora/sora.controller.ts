import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SoraService } from './sora.service';
import { SoraCreateDto } from './sora.dto';

@Controller('sora')
export class SoraController {
  constructor(private readonly sora: SoraService) {}

  @Post('test')
  async create(@Body() body: SoraCreateDto) {
    return this.sora.create(body);
  }

  @Get(':id')
  async retrieve(@Param('id') id: string) {
    return this.sora.retrieve(id);
  }

  @Post(':id/download')
  async download(@Param('id') id: string) {
    return this.sora.download(id);
  }
}
