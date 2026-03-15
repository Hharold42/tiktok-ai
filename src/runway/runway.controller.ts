import { Body, Controller, Post } from '@nestjs/common';
import { RunwayService } from './runway.service';
import { RunwayTestDto } from './runway.dto';

@Controller('runway')
export class RunwayController {
  constructor(private readonly runway: RunwayService) {}

  @Post('test')
  async test(@Body() body: RunwayTestDto) {
    return this.runway.test(body);
  }

  @Post('veo')
  async veo(@Body() body: RunwayTestDto) {
    return this.runway.testVeo(body);
  }

  @Post('veo/wedding')
  async veoWedding(@Body() body: RunwayTestDto) {
    return this.runway.testVeoWedding(body);
  }
}
