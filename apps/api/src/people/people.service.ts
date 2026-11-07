import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '../common/auth-context';
import { Person } from '../entities/person.entity';
import type { CompleteRecordDto } from './dto';

export interface RecordDto {
  id: string;
  name: string;
  surname: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  toComplete: boolean;
}

@Injectable()
export class PeopleService {
  constructor(private readonly em: EntityManager) {}

  async my(a: AuthContext): Promise<RecordDto> {
    return this.dto(await this.load(a));
  }

  /** The person completes their own record. Can be redone to fix the data. */
  async completeMy(a: AuthContext, dto: CompleteRecordDto): Promise<RecordDto> {
    const data = new Date(`${dto.birthDate}T00:00:00Z`);
    if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== dto.birthDate) {
      throw new BadRequestException({ message: 'Invalid birth date', code: 'INVALID_BIRTH_DATE' });
    }
    if (data.getTime() > Date.now() || data.getUTCFullYear() < 1900) {
      throw new BadRequestException({ message: 'Invalid birth date', code: 'INVALID_BIRTH_DATE' });
    }
    const p = await this.load(a);
    p.surname = dto.surname;
    p.birthDate = dto.birthDate;
    if (dto.phone) p.phone = dto.phone;
    p.completedAt ??= new Date();
    await this.em.flush();
    return this.dto(p);
  }

  private async load(a: AuthContext): Promise<Person> {
    if (!a.personId) throw new NotFoundException({ message: 'No record linked to your account in this club', code: 'NO_RECORD' });
    return this.em.findOneOrFail(Person, a.personId);
  }

  private dto(p: Person): RecordDto {
    return {
      id: p.id,
      name: p.name,
      surname: p.surname,
      birthDate: p.birthDate,
      email: p.email,
      phone: p.phone,
      toComplete: !p.completedAt,
    };
  }
}
