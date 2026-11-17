import { isDiscardableDraft } from './draft.rules';

const unused = { createdByInvitation: true, hasUser: false, completed: false, enrollments: 0, certificates: 0, otherOpenInvitations: 0 };

describe('isDiscardableDraft', () => {
  it('a draft made by the invitation and never used can go', () => {
    expect(isDiscardableDraft(unused)).toBe(true);
  });

  it.each([
    ['a record the invitation did not create', { createdByInvitation: false }],
    ['linked to an account', { hasUser: true }],
    ['completed by the person', { completed: true }],
    ['enrolled in a team', { enrollments: 1 }],
    ['with a certificate', { certificates: 2 }],
    ['still target of another open invitation', { otherOpenInvitations: 1 }],
  ])('stays: %s', (_label, change) => {
    expect(isDiscardableDraft({ ...unused, ...change })).toBe(false);
  });
});
