import { Check, Entity, Enum, Index, ManyToOne, OneToOne, Property, type Rel } from '@mikro-orm/core';
import { TenantEntity } from './tenant.entity';
import { Document } from './document.entity';
import { Person } from './person.entity';
import { CertificateType } from './enums';

/**
 * Health data (GDPR art. 9). By default only type, issue and expiry are stored.
 * The file is optional: it lives in a `Document` on private storage, with access traced in AuditLog.
 * Applies to all of the person's teams. What counts for eligibility is the certificate with the furthest expiry.
 */
@Entity({ tableName: 'medical_certificates' })
@Index({ properties: ['person', 'expiryDate'] })
@Check({ expression: 'expiry_date >= issue_date' })
export class MedicalCertificate extends TenantEntity<'document'> {
  @ManyToOne(() => Person, { deleteRule: 'cascade' })
  person!: Rel<Person>;

  @Enum({ items: () => CertificateType, length: 20 })
  type!: CertificateType;

  @Property({ type: 'date' })
  issueDate!: string;

  @Property({ type: 'date', index: true })
  expiryDate!: string;

  /** null = no file uploaded. */
  @OneToOne(() => Document, { nullable: true, deleteRule: 'set null', hidden: true })
  document: Rel<Document> | null = null;
}
