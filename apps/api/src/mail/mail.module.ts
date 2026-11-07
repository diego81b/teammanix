import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { OutboxController } from './outbox.controller';
import { outboxEnabled } from './outbox';

@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
  controllers: outboxEnabled(process.env) ? [OutboxController] : [],
})
export class MailModule {}
