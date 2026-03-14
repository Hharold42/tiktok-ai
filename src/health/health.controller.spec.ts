import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            checkOpenAI: jest.fn().mockReturnValue({ service: 'openai', status: 'ok' }),
            checkPexels: jest.fn().mockReturnValue({ service: 'pexels', status: 'ok' }),
            checkElevenLabs: jest.fn().mockReturnValue({ service: 'elevenlabs', status: 'ok' }),
            checkFfmpeg: jest.fn().mockReturnValue({ service: 'ffmpeg', status: 'ok' }),
            checkAll: jest.fn().mockReturnValue([{ service: 'openai', status: 'ok' }]),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  it('returns openai health', () => {
    expect(controller.check('openai')).toEqual({ service: 'openai', status: 'ok' });
    expect(service.checkOpenAI).toHaveBeenCalled();
  });

  it('returns pexels health', () => {
    expect(controller.check('pexels')).toEqual({ service: 'pexels', status: 'ok' });
    expect(service.checkPexels).toHaveBeenCalled();
  });

  it('returns elevenlabs health', () => {
    expect(controller.check('elevenlabs')).toEqual({ service: 'elevenlabs', status: 'ok' });
    expect(service.checkElevenLabs).toHaveBeenCalled();
  });

  it('returns ffmpeg health', () => {
    expect(controller.check('ffmpeg')).toEqual({ service: 'ffmpeg', status: 'ok' });
    expect(service.checkFfmpeg).toHaveBeenCalled();
  });

  it('returns all health', () => {
    expect(controller.check('all')).toEqual([{ service: 'openai', status: 'ok' }]);
    expect(service.checkAll).toHaveBeenCalled();
  });

  it('handles unknown service', () => {
    expect(controller.check('unknown')).toEqual({
      service: 'unknown',
      status: 'error',
      message: 'unknown service',
    });
  });
});
