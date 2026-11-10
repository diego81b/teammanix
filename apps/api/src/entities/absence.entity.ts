import { Check, Entity, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { Enrollment } from './enrollment.entity';
import { TenantEntity } from './tenant.entity';

/**
 * Absence declared by a player or a staff member on their own enrollment (rule 10): so it belongs to one team and one
 * season, and never reaches another team. Dates only: no reason and no free text, because a reason or a long duration
 * would let others guess an injury. Periods may overlap or touch; they are fused when read, not when stored.
 */
@Entity({ tableName: 'absences' })
@Check({ expression: '(end_date is null or end_date >= start_date)' })
export class Absence extends TenantEntity {
  @ManyToOne(() => Enrollment, { index: true, deleteRule: 'cascade' })
  enrollment!: Rel<Enrollment>;

  @Property({ type: 'date' })
  startDate!: string;

  /** null means "until further notice". */
  @Property({ type: 'date', nullable: true })
  endDate: string | null = null;
}
