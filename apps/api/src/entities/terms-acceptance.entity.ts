import { Entity, Enum, Index, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';
import { Club } from './club.entity';
import { User } from './user.entity';
import { TypeLegalDocument } from './enums';

/**
 * Proof of acceptance (click-wrap) of terms, privacy and DPA under art. 28 GDPR.
 * The DPA is accepted by whoever creates the club, on behalf of the club that owns the data. Immutable rows, never updated.
 * No IP stored: minimization. club is null for the acceptance of the terms at registration.
 * Kept as evidence of signature and acceptance (archival): deleting the account sets `user` to null, and the signer
 * stays identified by the name and email frozen on the row. The row goes only with its club.
 */
@Entity({ tableName: 'terms_acceptances' })
@Index({ properties: ['user', 'type', 'version'] })
export class TermsAcceptance extends BaseEntity<'acceptedAt'> {
  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null' })
  user: Rel<User> | null = null;

  @Property({ length: 210 })
  signerName!: string;

  @Property({ length: 320 })
  signerEmail!: string;

  @ManyToOne(() => Club, { nullable: true, deleteRule: 'cascade' })
  club: Rel<Club> | null = null;

  @Enum({ items: () => TypeLegalDocument, length: 20 })
  type!: TypeLegalDocument;

  /** Version of the accepted document, for example '2026-11-01'. */
  @Property({ length: 30 })
  version!: string;

  @Property({ type: 'timestamptz' })
  acceptedAt: Date = new Date();
}
