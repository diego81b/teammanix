import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/decorators';
import { MailService } from './mail.service';

@Controller('__test/outbox')
export class OutboxController {
  constructor(private readonly mail: MailService) {}

  @Public()
  @Get()
  list(@Query('a') a?: string) {
    if (!a) return [];
    const recipient = a.toLowerCase();
    return this.mail.outbox.filter((m) => m.a.toLowerCase() === recipient);
  }
}
