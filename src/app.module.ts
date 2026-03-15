import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PexelsController } from './pexels/pexels.controller';
import { PexelsService } from './pexels/pexels.service';
import { RenderController } from './render/render.controller';
import { RenderService } from './render/render.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { SoraController } from './sora/sora.controller';
import { SoraService } from './sora/sora.service';
import { RunwayController } from './runway/runway.controller';
import { RunwayService } from './runway/runway.service';
import { TtsController } from './tts/tts.controller';
import { TtsService } from './tts/tts.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [
    AppController,
    PexelsController,
    TtsController,
    RenderController,
    HealthController,
    SoraController,
    RunwayController,
  ],
  providers: [
    AppService,
    PexelsService,
    TtsService,
    RenderService,
    HealthService,
    SoraService,
    RunwayService,
  ],
})
export class AppModule {}
