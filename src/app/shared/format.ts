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

const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

export function formatRange(range: { start: Date; end: Date }): string {
  return `${dayMonth.format(range.start)} – ${dayMonth.format(range.end)}`;
}

export function formatDay(date: Date | number): string {
  return dayMonth.format(date);
}
