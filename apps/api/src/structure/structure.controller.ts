import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { CurrentAuth, AdminOnly } from '../common/decorators';
import {
  CreateActivityDto,
  CreateTeamDto,
  CreateSeasonDto,
  EditActivityDto,
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

  @Post('activities')
  createActivity(@CurrentAuth() a: AuthContext, @Body() dto: CreateActivityDto) {
    return this.structure.createActivity(a, dto);
  }

  @Patch('activities/:id')
  editActivity(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditActivityDto) {
    return this.structure.editActivity(id, dto);
  }

  @Post('activities/:id/teams')
  createTeam(@CurrentAuth() a: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTeamDto) {
    return this.structure.createTeam(a, id, dto);
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
