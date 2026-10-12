import { holeRows, weeksLabel } from './scorecard-image';

describe('scorecard image layout', () => {
  it('puts up to nine holes in a row and splits longer courses evenly', () => {
    expect(holeRows(9)).toEqual([9]);
    expect(holeRows(18)).toEqual([9, 9]);
    expect(holeRows(16)).toEqual([8, 8]);
    expect(holeRows(17)).toEqual([9, 8]);
    expect(holeRows(27)).toEqual([9, 9, 9]);
    expect(holeRows(0)).toEqual([]);
  });

  it('names the week in Roman numerals', () => {
    expect(weeksLabel([4, 4, 4])).toBe('Tjedan IV');
    expect(weeksLabel([5, 4])).toBe('Tjedni IV i V');
    expect(weeksLabel([3, 1, 2])).toBe('Tjedni I, II i III');
  });
});
