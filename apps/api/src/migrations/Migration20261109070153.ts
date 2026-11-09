import { Migration } from '@mikro-orm/migrations';

/**
 * Events: the `postponed` status, and a unique name per club for venues.
 * The generated script also renamed the seasons' partial indexes: the database already has the final names
 * (see Migration20261107095035), only the snapshot was stale, so those statements were removed.
 */
export class Migration20261109070153 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "events" drop constraint if exists "events_status_check";`);

    this.addSql(`alter table "venues" add constraint "venues_club_id_name_unique" unique ("club_id", "name");`);

    this.addSql(`alter table "events" add constraint "events_status_check" check("status" in ('scheduled', 'cancelled', 'postponed', 'concluded'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "events" drop constraint if exists "events_status_check";`);

    this.addSql(`alter table "venues" drop constraint "venues_club_id_name_unique";`);

    this.addSql(`alter table "events" add constraint "events_status_check" check("status" in ('scheduled', 'cancelled', 'concluded'));`);
  }

}
