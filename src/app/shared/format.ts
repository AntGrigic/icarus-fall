import { Pipe, PipeTransform } from '@angular/core';

import { formatToPar } from '../core/league-math';

/** CSS class for a hole score relative to par (colours live in styles.scss). */
export function scoreClass(diff: number | null | undefined): string {
  if (diff == null) return '';
  if (diff <= -2) return 'score-eagle';
  if (diff === -1) return 'score-birdie';
  if (diff === 0) return 'score-par';
  if (diff === 1) return 'score-bogey';
  return 'score-double';
}

/** Colour class for a round or total relative to par. */
export function totalClass(toPar: number | null | undefined): string {
  if (toPar == null || toPar === 0) return '';
  return toPar < 0 ? 'under-par' : 'over-par';
}

@Pipe({ name: 'toPar' })
export class ToParPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatToPar(value);
  }
}

const dayMonth = new Intl.DateTimeFormat('hr', { day: 'numeric', month: 'long' });

/** "5. – 11. listopada", or "26. listopada – 1. studenoga" when the month changes. */
export function formatRange(range: { start: Date; end: Date }): string {
  const { start, end } = range;
  const from = start.getMonth() === end.getMonth() ? `${start.getDate()}.` : dayMonth.format(start);
  return `${from} – ${dayMonth.format(end)}`;
}

export function formatDay(date: Date | number): string {
  return dayMonth.format(date);
}

/** Croatian plural: plural(n, 'tjedan', 'tjedna', 'tjedana') → 1 tjedan, 3 tjedna, 5 tjedana, 12 tjedana, 21 tjedan. */
export function plural(n: number, one: string, few: string, many: string): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (last === 1 && lastTwo !== 11) return one;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

const NUMERALS: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** Roman numeral for week labels: roman(4) → "IV", roman(12) → "XII". */
export function roman(n: number): string {
  let out = '';
  for (const [value, letters] of NUMERALS) {
    while (n >= value) {
      out += letters;
      n -= value;
    }
  }
  return out;
}
