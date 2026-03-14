import { Body, Controller, Post } from '@nestjs/common';
import { RenderRequestDto } from './render.dto';
import { RenderService } from './render.service';

@Controller('render')
export class RenderController {
  constructor(private readonly renderService: RenderService) {}

  @Post()
  async render(@Body() body: RenderRequestDto) {
    return this.renderService.renderLatestOr(body.generationId);
  }
}
