import { ANONYMIZED, archiveAction, exportFileName } from './erasure.rules';

describe('export and permanent deletion from the archive', () => {
  const when = new Date('2026-11-01T10:00:00Z');

  it('allows both only on a disabled person', () => {
    expect(archiveAction({ disabledAt: when, anonymizedAt: null })).toBe('ok');
  });

  it('refuses an active person', () => {
    expect(archiveAction({ disabledAt: null, anonymizedAt: null })).toBe('PERSON_NOT_DISABLED');
  });

  it('an already deleted person is gone: nothing left to export or delete', () => {
    expect(archiveAction({ disabledAt: when, anonymizedAt: when })).toBe('PERSON_NOT_FOUND');
  });
});

describe('anonymizing the record', () => {
  it('clears every personal field and keeps no display text in the database', () => {
    expect(ANONYMIZED).toEqual({
      name: '',
      surname: null,
      birthDate: null,
      email: null,
      phone: null,
      photoUrl: null,
      completedAt: null,
    });
  });
});

describe('the export file name', () => {
  it('carries the id, never the name', () => {
    expect(exportFileName('0b5c3d1e-1111-4222-8333-444455556666')).toBe('person-0b5c3d1e-1111-4222-8333-444455556666.json');
  });
});
