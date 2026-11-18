import { activeModules } from './memberships.rules';

describe('activeModules', () => {
  it('is empty with no team', () => {
    expect(activeModules([])).toEqual([]);
  });

  it('merges the modules of several teams, without repeats and sorted', () => {
    expect(activeModules([['standings', 'attendances'], ['sanctions', 'attendances']])).toEqual(['attendances', 'sanctions', 'standings']);
  });

  it('ignores a team with no module on', () => {
    expect(activeModules([[], ['attendances']])).toEqual(['attendances']);
  });
});
