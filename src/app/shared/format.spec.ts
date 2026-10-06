import { roman } from './format';

describe('roman', () => {
  it('writes week numbers as Roman numerals', () => {
    expect([1, 4, 8, 9, 12, 14, 19, 40].map(roman)).toEqual([
      'I',
      'IV',
      'VIII',
      'IX',
      'XII',
      'XIV',
      'XIX',
      'XL',
    ]);
  });
});
