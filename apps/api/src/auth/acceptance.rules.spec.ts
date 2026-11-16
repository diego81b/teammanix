import { signerOf } from './acceptance.rules';

describe('signerOf', () => {
  it('freezes name and email of the account as the signer of the acceptance', () => {
    expect(signerOf({ name: 'Mario', surname: 'Rossi', email: 'mario@test.it' })).toEqual({
      signerName: 'Mario Rossi',
      signerEmail: 'mario@test.it',
    });
  });

  it('does not leave stray spaces when a part is empty', () => {
    expect(signerOf({ name: ' Mario ', surname: '', email: 'mario@test.it' }).signerName).toBe('Mario');
  });
});
