import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth, AdminOnly } from '../common/decorators';
import { CertificatesService } from './certificates.service';
import { CreateCertificateDto, EditCertificateDto } from './dto';

const EXTENSION: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** For now admin only. The player uploading their own certificate arrives with the player home. */
@AdminOnly()
@Controller()
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('people/:id/certificates')
  list(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.certificates.list(a, id);
  }

  @Post('people/:id/certificates')
  create(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCertificateDto) {
    return this.certificates.create(a, id, dto);
  }

  @Patch('certificates/:id')
  edit(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditCertificateDto) {
    return this.certificates.edit(a, id, dto);
  }

  @Delete('certificates/:id')
  @HttpCode(204)
  remove(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.certificates.remove(a, id);
  }

  /** Binary body (application/pdf, image/jpeg, image/png): the parser is registered in `create-app.ts`. */
  @Put('certificates/:id/file')
  @HttpCode(200)
  loadFile(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    return this.certificates.loadFile(a, id, req.body);
  }

  @Get('certificates/:id/file')
  async readFile(
    @CurrentAuth() a: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { data, type } = await this.certificates.readFile(a, id);
    // Health data: no browser or proxy caching, no type sniffing by the browser.
    res.header('Content-Type', type);
    res.header('Content-Disposition', `inline; filename="certificato.${EXTENSION[type]}"`);
    res.header('Cache-Control', 'no-store');
    res.header('X-Content-Type-Options', 'nosniff');
    return data;
  }

  @Delete('certificates/:id/file')
  @HttpCode(204)
  deleteFile(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.certificates.deleteFile(a, id);
  }
}
