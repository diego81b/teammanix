import { Entity, Enum, Index, ManyToOne, Property, type Rel } from '@mikro-orm/core';
import { DocumentCategory } from './enums';
import { Person } from './person.entity';
import { TenantEntity } from './tenant.entity';
import { User } from './user.entity';

/**
 * File of a person kept in private (encrypted) storage. The record holds only metadata: the content never
 * goes through the DB. Whoever owns it (for example `MedicalCertificate.document`) decides who can read it and how it is traced.
 * Each new category adds a value to `DocumentCategory` and its own access rules.
 */
@Entity({ tableName: 'documents' })
@Index({ properties: ['person', 'category'] })
export class Document extends TenantEntity<'uploadedBy'> {
  @ManyToOne(() => Person, { deleteRule: 'cascade' })
  person!: Rel<Person>;

  @Enum({ items: () => DocumentCategory, length: 30 })
  category!: DocumentCategory;

  /** File type, derived from the content at upload. */
  @Property({ length: 30 })
  mime!: string;

  @Property({ type: 'int' })
  size!: number;

  /** Key in storage (`clubId/uuid`). Never exposed by the API. */
  @Property({ type: 'text', hidden: true })
  storageKey!: string;

  @ManyToOne(() => User, { nullable: true, deleteRule: 'set null' })
  uploadedBy: Rel<User> | null = null;
}
