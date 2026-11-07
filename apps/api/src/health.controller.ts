import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './common/decorators';

@Controller('health')
export class HealthController {
  @Public()
  @SkipThrottle()
  @Get()
  status() {
    return { status: 'ok' };
  }
}
