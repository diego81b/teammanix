import { Check, Entity, OneToOne, Property, type Rel } from '@mikro-orm/core';
import { Enrollment } from './enrollment.entity';
import { TenantEntity } from './tenant.entity';

/**
 * Staff expect a player to be out: recorded on one player enrollment, read for the person in every team, as the
 * injured state. `returnDate` is the first day available again. Dates only, never a cause or a note (health data,
 * art. 9). It never blocks: confirming sets the injured state and removes the period.
 */
@Entity({ tableName: 'expected_injuries' })
@Check({ name: 'expected_injuries_dates', expression: 'return_date > start_date' })
export class ExpectedInjury extends TenantEntity {
  @OneToOne(() => Enrollment, { owner: true, unique: true, deleteRule: 'cascade' })
  enrollment!: Rel<Enrollment>;

  @Property({ type: 'date' })
  startDate!: string;

  @Property({ type: 'date' })
  returnDate!: string;
}
