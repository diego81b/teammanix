import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth } from '../common/decorators';
import { CertificatesDueService } from './certificates-due.service';

/** Not admin only: the permission `certificates.status` in the team of the season decides. */
@Controller()
export class CertificatesDueController {
  constructor(private readonly due: CertificatesDueService) {}

  @Get('seasons/:id/certificates-due')
  ofSeason(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.due.ofSeason(a, id);
  }
}
