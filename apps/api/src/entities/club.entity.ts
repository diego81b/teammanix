import { Entity, Property } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

/** Tenant. It has no tenant filter: it is the tenant itself. */
@Entity({ tableName: 'clubs' })
export class Club extends BaseEntity<'theme' | 'blockCertificateExpired' | 'certificatesWithFile'> {
  @Property({ length: 200 })
  name!: string;

  @Property({ type: 'text', nullable: true })
  logoUrl: string | null = null;

  /** Theme variables (stylesheet colors). */
  @Property({ type: 'json', nullable: true })
  theme: Record<string, string> | null = null;

  /**
   * Expired or missing certificate.
   * true = player not callable, false = callable with a warning. Applies to all activities.
   */
  @Property({ default: true })
  blockCertificateExpired: boolean = true;

  /**
   * Minimization (GDPR art. 5): by default only type, issue and expiry are recorded.
   * true = the club may also keep the certificate file, encrypted on private storage.
   */
  @Property({ default: false })
  certificatesWithFile: boolean = false;
}
