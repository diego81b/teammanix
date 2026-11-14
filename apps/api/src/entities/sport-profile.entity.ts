import { Entity, Property } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';
import type { StaffPolicyModel } from './enums';

export type UnitTerm = 'team' | 'group';

/** A staff role the profile suggests: the code names it in the frontend, the model and the flag are what the role gets. */
export interface SuggestedStaffRole {
  code: string;
  policyModel: StaffPolicyModel;
  mustBeAvailable: boolean;
}

/**
 * Sport configuration, populated by seed. Shared by all clubs: no tenant.
 * The data schema is the same for every sport, the profile only changes optional features.
 * No text here: sport name, positions and terminology are codes translated by the frontend.
 */
@Entity({ tableName: 'sport_profiles' })
export class SportProfile extends BaseEntity {
  /** Stable seed key, for example 'calcio', 'scherma', 'pallavolo', 'generico'. */
  @Property({ length: 40, unique: true })
  code!: string;

  /** Codes of the allowed positions (lowercase, underscore). Empty: the profile has no positions. */
  @Property({ type: 'json' })
  positions: string[] = [];

  /** Staff roles the admin may add to the club's catalog for a team with this profile. Never added on their own. */
  @Property({ type: 'json', default: '[]' })
  suggestedStaffRoles: SuggestedStaffRole[] = [];

  /** Enables the starter or bench toggle on called-up players. Football yes, fencing no. */
  @Property({ default: false })
  starterBench: boolean = false;

  /** Warning threshold on starters (football 11). Not a block. */
  @Property({ type: 'int', nullable: true })
  maxStarters: number | null = null;

  /** Modules that can be enabled for teams with this profile. */
  @Property({ type: 'json' })
  modulesAvailable: string[] = [];

  /** Code of the word for the team unit: the frontend says "squadra" or "gruppo" from it. */
  @Property({ length: 10, default: 'team' })
  unitTerm: UnitTerm = 'team';
}
