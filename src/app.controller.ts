import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { GenerateRequestDto } from './dto/generate.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('generate')
  async generate(@Body() body: GenerateRequestDto) {
    return this.appService.generateScenario(body);
  }
}
