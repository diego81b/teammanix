import { Entity, Filter, ManyToOne, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';
import { Club } from './club.entity';

export const TENANT_FILTER = 'tenant';

/**
 * Base of every club entity. The filter is active by default and fails closed:
 * if the request does not set clubId, the query throws instead of returning everyone's data.
 *
 * Per request: em.setFilterParams(TENANT_FILTER, { clubId }).
 * For flows without tenant (registration, invitation acceptance, system jobs): explicit { filters: false }.
 */
@Filter({
  name: TENANT_FILTER,
  cond: (args: { clubId?: string }) => {
    if (!args.clubId) {
      throw new Error('Tenant filter active but clubId not set on the request');
    }
    return { club: args.clubId };
  },
  default: true,
})
@Entity({ abstract: true })
export abstract class TenantEntity<Optional extends string = never> extends BaseEntity<Optional> {
  @ManyToOne(() => Club, { index: true, deleteRule: 'cascade' })
  club!: Rel<Club>;
}
