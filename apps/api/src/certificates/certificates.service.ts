import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../common/auth-context';
import { AuditAction, DocumentCategory, CertificateType, EnrollmentType } from '../entities/enums';
import { MedicalCertificate } from '../entities/medical-certificate.entity';
import { Document } from '../entities/document.entity';
import { Enrollment } from '../entities/enrollment.entity';
import { Person } from '../entities/person.entity';
import { Club } from '../entities/club.entity';
import { User } from '../entities/user.entity';
import { StorageService } from '../storage/storage.service';
import { currentCertificate, todayIso, type CertificateStatus, certificateStatus, validateCertificateDates } from './certificate.rules';
import type { CreateCertificateDto, EditCertificateDto } from './dto';
import { MAX_FILE_SIZE, detectFile, type FileType } from './file.rules';

export interface CertificateDto {
  id: string;
  personId: string;
  type: CertificateType;
  issueDate: string;
  expiryDate: string;
  status: CertificateStatus;
  hasFile: boolean;
  fileType: string | null;
}

export interface SummaryCertificate {
  status: CertificateStatus;
  expiry: string | null;
}

export interface PersonCertificates extends SummaryCertificate {
  certificates: CertificateDto[];
}

const personNotFound = () => new NotFoundException({ message: 'Person not found', code: 'PERSON_NOT_FOUND' });
const certificateNotFound = () => new NotFoundException({ message: 'Certificate not found', code: 'CERTIFICATE_NOT_FOUND' });
const fileNotFound = () => new NotFoundException({ message: 'File not found', code: 'CERTIFICATE_FILE_NOT_FOUND' });
const invalidDates = () =>
  new BadRequestException({ message: 'Invalid certificate dates', code: 'INVALID_DATE_CERTIFICATE' });

/**
 * Medical certificate: health data (GDPR art. 9). Every read of a person's list and every change ends up
 * in AuditLog, never writing dates or other content in meta.
 */
@Injectable()
export class CertificatesService {
  private readonly logger = new Logger('Certificates');

  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async list(a: AuthContext, personId: string): Promise<PersonCertificates> {
    await this.person(personId);
    const certificates = await this.em.find(MedicalCertificate, { person: personId }, { populate: ['document'], orderBy: { expiryDate: 'desc' } });
    await this.audit.register({
      action: AuditAction.CERTIFICATE_READ,
      userId: a.userId,
      clubId: a.clubId,
      entity: 'Person',
      entityId: personId,
    });
    const today = todayIso();
    const expiry = currentCertificate(certificates)?.expiryDate ?? null;
    return { status: certificateStatus(expiry, today), expiry, certificates: certificates.map((c) => this.dto(c, today)) };
  }

  async create(a: AuthContext, personId: string, dto: CreateCertificateDto): Promise<CertificateDto> {
    const person = await this.person(personId);
    if (person.disabledAt) this.disabled();
    if (validateCertificateDates(dto.issueDate, dto.expiryDate, todayIso())) throw invalidDates();
    if (await this.onlyStaff(personId)) {
      throw new ConflictException({ message: 'The medical certificate does not apply to staff', code: 'CERTIFICATE_NOT_EXPECTED' });
    }
    const c = this.em.create(MedicalCertificate, {
      club: a.clubId as string,
      person,
      type: dto.type,
      issueDate: dto.issueDate,
      expiryDate: dto.expiryDate,
    });
    await this.em.flush();
    await this.track(a, c.id, 'created');
    return this.dto(c, todayIso());
  }

  async edit(a: AuthContext, id: string, dto: EditCertificateDto): Promise<CertificateDto> {
    if (dto.type === undefined && dto.issueDate === undefined && dto.expiryDate === undefined) {
      throw new BadRequestException({ message: 'No data to modify', code: 'INVALID_DATA' });
    }
    const c = await this.certificate(id);
    const issue = dto.issueDate ?? c.issueDate;
    const expiry = dto.expiryDate ?? c.expiryDate;
    if (validateCertificateDates(issue, expiry, todayIso())) throw invalidDates();
    c.type = dto.type ?? c.type;
    c.issueDate = issue;
    c.expiryDate = expiry;
    await this.em.flush();
    await this.track(a, c.id, 'modified');
    return this.dto(c, todayIso());
  }

  async remove(a: AuthContext, id: string): Promise<void> {
    const c = await this.certificate(id);
    const key = c.document?.storageKey ?? null;
    if (c.document) this.em.remove(c.document);
    this.em.remove(c);
    await this.em.flush();
    await this.removeFromStorage(key);
    await this.track(a, id, 'deleted');
  }

  /**
   * The file is optional and the club must have enabled it. The type is derived from the content, not from the client.
   * A new upload replaces the previous one, which is deleted from storage.
   */
  async loadFile(a: AuthContext, id: string, body: unknown): Promise<CertificateDto> {
    const c = await this.certificate(id);
    const club = await this.em.findOneOrFail(Club, a.clubId as string);
    if (!club.certificatesWithFile) {
      throw new ConflictException({ message: 'The club does not store certificate files', code: 'CERTIFICATE_FILE_NOT_ENABLED' });
    }
    const data = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
    if (data.length > MAX_FILE_SIZE) {
      throw new PayloadTooLargeException({ message: 'File too large (maximum 5 MB)', code: 'CERTIFICATE_FILE_TOO_BIG' });
    }
    const type: FileType | null = detectFile(data);
    if (!type) {
      throw new BadRequestException({ message: 'The file must be a PDF, a JPEG or a PNG', code: 'INVALID_CERTIFICATE_FILE' });
    }
    const previous = c.document;
    const previousKey = previous?.storageKey ?? null;
    const fresh = await this.storage.save(a.clubId as string, data);
    try {
      c.document = this.em.create(Document, {
        club: a.clubId as string,
        person: c.person,
        category: DocumentCategory.CERTIFICATE_MEDICAL,
        mime: type,
        size: data.length,
        storageKey: fresh,
        uploadedBy: this.em.getReference(User, a.userId),
      });
      if (previous) this.em.remove(previous);
      await this.em.flush();
    } catch (e) {
      await this.removeFromStorage(fresh);
      throw e;
    }
    await this.removeFromStorage(previousKey);
    await this.track(a, id, 'file_loaded');
    return this.dto(c, todayIso());
  }

  /** Access to health data: every successful read is traced. */
  async readFile(a: AuthContext, id: string): Promise<{ data: Buffer; type: string }> {
    const c = await this.certificate(id);
    if (!c.document) throw fileNotFound();
    const data = await this.storage.read(c.document.storageKey);
    await this.audit.register({
      action: AuditAction.FILE_CERTIFICATE_READ,
      userId: a.userId,
      clubId: a.clubId,
      entity: 'MedicalCertificate',
      entityId: id,
    });
    return { data, type: c.document.mime };
  }

  async deleteFile(a: AuthContext, id: string): Promise<void> {
    const c = await this.certificate(id);
    const document = c.document;
    if (!document) throw fileNotFound();
    const key = document.storageKey;
    c.document = null;
    this.em.remove(document);
    await this.em.flush();
    await this.removeFromStorage(key);
    await this.track(a, id, 'file_deleted');
  }

  /**
   * Status and expiry of the current certificate for each person. Not an access to the certificate:
   * it only shows the status, so it writes no audit.
   */
  async summary(personIds: string[]): Promise<Map<string, SummaryCertificate>> {
    const byKey = new Map<string, MedicalCertificate[]>();
    if (personIds.length) {
      for (const c of await this.em.find(MedicalCertificate, { person: { $in: personIds } })) {
        byKey.set(c.person.id, [...(byKey.get(c.person.id) ?? []), c]);
      }
    }
    const today = todayIso();
    return new Map(
      personIds.map((id) => {
        const expiry = currentCertificate(byKey.get(id) ?? [])?.expiryDate ?? null;
        return [id, { status: certificateStatus(expiry, today), expiry }];
      }),
    );
  }

  private async person(id: string): Promise<Person> {
    const p = await this.em.findOne(Person, id);
    if (!p) throw personNotFound();
    return p;
  }

  private async certificate(id: string): Promise<MedicalCertificate> {
    const c = await this.em.findOne(MedicalCertificate, id, { populate: ['person', 'document'] });
    if (!c) throw certificateNotFound();
    if (c.person.disabledAt) this.disabled();
    return c;
  }

  /** After commit: if deletion fails an orphan but encrypted file remains, and the error does not block the request. */
  private async removeFromStorage(key: string | null): Promise<void> {
    if (!key) return;
    try {
      await this.storage.remove(key);
    } catch (e) {
      this.logger.error(`storage deletion failed: ${(e as Error).message}`);
    }
  }

  private disabled(): never {
    throw new ConflictException({ message: 'The person is disabled', code: 'PERSON_DISABLED' });
  }

  /** Rule 11: staff-only people have no certificate. A person without enrollments can still become a player. */
  private async onlyStaff(personId: string): Promise<boolean> {
    const types = (await this.em.find(Enrollment, { person: personId }, { fields: ['type'] })).map((i) => i.type);
    return types.length > 0 && !types.includes(EnrollmentType.PLAYER);
  }

  private track(a: AuthContext, id: string, operation: string) {
    return this.audit.register({
      action: AuditAction.CERTIFICATE_MODIFIED,
      userId: a.userId,
      clubId: a.clubId,
      entity: 'MedicalCertificate',
      entityId: id,
      meta: { operation },
    });
  }

  private dto(c: MedicalCertificate, today: string): CertificateDto {
    return {
      id: c.id,
      personId: c.person.id,
      type: c.type,
      issueDate: c.issueDate,
      expiryDate: c.expiryDate,
      status: certificateStatus(c.expiryDate, today),
      hasFile: c.document !== null,
      fileType: c.document?.mime ?? null,
    };
  }
}
