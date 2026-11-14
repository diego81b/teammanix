import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth, AdminOnly } from '../common/decorators';
import {
  CreateSectionDto,
  CreateTeamDto,
  CreateSeasonDto,
  EditSectionDto,
  EditTeamDto,
  EditSeasonDto,
} from './dto';
import { StructureService } from './structure.service';

/** For now the structure is read and edited by admin only: reading by scope arrives with the role screens. */
@AdminOnly()
@Controller()
export class StructureController {
  constructor(private readonly structure: StructureService) {}

  @Get('sport-profiles')
  profiles() {
    return this.structure.profiles();
  }

  @Get('structure')
  tree() {
    return this.structure.tree();
  }

  @Post('sections')
  createSection(@CurrentAuth() a: AuthContext, @Body() dto: CreateSectionDto) {
    return this.structure.createSection(a, dto);
  }

  @Patch('sections/:id')
  editSection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditSectionDto) {
    return this.structure.editSection(id, dto);
  }

  /** The teams of the section stay, without a section. Refused while roles or invitations point to it. */
  @Delete('sections/:id')
  @HttpCode(204)
  removeSection(@Param('id', ParseUUIDPipe) id: string) {
    return this.structure.removeSection(id);
  }

  @Post('teams')
  createTeam(@CurrentAuth() a: AuthContext, @Body() dto: CreateTeamDto) {
    return this.structure.createTeam(a, dto);
  }

  @Patch('teams/:id')
  editTeam(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditTeamDto) {
    return this.structure.editTeam(id, dto);
  }

  @Post('teams/:id/seasons')
  createSeason(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateSeasonDto) {
    return this.structure.createSeason(a, id, dto);
  }

  @Patch('seasons/:id')
  editSeason(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditSeasonDto) {
    return this.structure.editSeason(id, dto);
  }

  @Post('seasons/:id/close')
  @HttpCode(200)
  close(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.structure.closeSeason(a, id);
  }

  @Post('seasons/:id/active')
  @HttpCode(200)
  active(@Param('id', ParseUUIDPipe) id: string) {
    return this.structure.activeSeason(id);
  }
}
