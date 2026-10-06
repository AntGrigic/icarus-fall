import {
  computeStandings,
  currentWeek,
  formatToPar,
  matchesSearch,
  nameKey,
  playableHoles,
  roundOptions,
  throwingOrder,
  tidyName,
} from './league-math';
import { Attempt, League, Player, Round, RoundType } from './models';

function league(overrides: Partial<League> = {}): League {
  return {
    id: 'L1',
    name: 'Test league',
    startDate: '2026-09-07', // a Monday
    totalWeeks: 8,
    holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 3 })),
    dropWorst: 0,
    currentWeekOverride: null,
    weeks: {},
    createdAt: 0,
    ...overrides,
  };
}

function player(id: string, division: 'M' | 'W' = 'M'): Player {
  return { id, firstName: id, lastName: 'Test', division, createdAt: 0 };
}

let playedAt = 1;
function round(playerId: string, week: number, toPar: number, attempt: Attempt = 1, type?: RoundType): Round {
  return {
    playerId,
    playerName: `${playerId} Test`,
    division: 'M',
    week,
    attempt,
    type: type ?? (attempt === 2 ? 'repeat' : 'first'),
    holes: [],
    strokes: 54 + toPar,
    par: 54,
    toPar,
    cardId: 'c',
    scoredBy: playerId,
    playedAt: playedAt++,
  };
}

const at = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

describe('currentWeek', () => {
  it('is upcoming before the start date', () => {
    expect(currentWeek(league(), at('2026-09-06'))).toEqual({ week: 1, status: 'upcoming', overridden: false });
  });

  it('counts 7-day weeks from the start date', () => {
    expect(currentWeek(league(), at('2026-09-07')).week).toBe(1);
    expect(currentWeek(league(), at('2026-09-13')).week).toBe(1);
    expect(currentWeek(league(), at('2026-09-14')).week).toBe(2);
    expect(currentWeek(league(), at('2026-10-28')).week).toBe(8);
  });

  it('is finished after the last week', () => {
    expect(currentWeek(league(), at('2026-11-02'))).toEqual({ week: 8, status: 'finished', overridden: false });
  });

  it('uses the admin override', () => {
    expect(currentWeek(league({ currentWeekOverride: 5 }), at('2026-09-01'))).toEqual({
      week: 5,
      status: 'running',
      overridden: true,
    });
  });
});

describe('playableHoles', () => {
  it('skips holes closed for that week only', () => {
    const l = league({ weeks: { '3': { disabledHoles: [9, 10] } } });
    expect(playableHoles(l, 3).map((h) => h.number)).not.toContain(9);
    expect(playableHoles(l, 3)).toHaveLength(16);
    expect(playableHoles(l, 4)).toHaveLength(18);
  });
});

describe('roundOptions', () => {
  const l = league();
  const slots = (rounds: Round[], week = 4) =>
    roundOptions(l, week, rounds).map((o) => `${o.type}:${o.week}/${o.attempt}`);

  it('offers first round and advance round to someone who joins in week 4', () => {
    expect(slots([])).toEqual(['first:4/1', 'advance:5/1']);
  });

  it('offers one repeat after the first round', () => {
    expect(slots([round('a', 4, 0)])).toEqual(['repeat:4/2', 'advance:5/1']);
  });

  it('offers one repeat of the advance round, and nothing for past weeks', () => {
    const rounds = [round('a', 3, 0), round('a', 4, 0), round('a', 4, 1, 2), round('a', 5, 0, 1, 'advance')];
    expect(slots(rounds)).toEqual(['repeat:5/2']);
  });

  it('lets the advance round be repeated once its week arrives', () => {
    expect(slots([round('a', 5, 0, 1, 'advance')], 5)).toEqual(['repeat:5/2', 'advance:6/1']);
  });

  it('has no advance round in the last week', () => {
    expect(slots([], 8)).toEqual(['first:8/1']);
  });

  it('offers nothing when every slot is used', () => {
    const rounds = [round('a', 4, 0), round('a', 4, 0, 2), round('a', 5, 0), round('a', 5, 0, 2)];
    expect(slots(rounds)).toEqual([]);
  });
});

describe('computeStandings', () => {
  const finished = at('2026-12-01');

  it('ranks a player who played every week above one who skipped weeks', () => {
    // Bato: 8 weeks, total -20, including two bad days (+10, +5).
    const bato = [-6, -5, 10, -4, 5, -7, -6, -7].map((s, i) => round('bato', i + 1, s));
    // Ivan: only 3 weeks, -23.
    const ivan = [-8, -8, -7].map((s, i) => round('ivan', i + 1, s));
    const { rows } = computeStandings(league(), [...bato, ...ivan], [player('bato'), player('ivan')], 'M', finished);

    expect(rows.map((r) => [r.playerId, r.total, r.counted, r.rank])).toEqual([
      ['bato', -20, 8, 1],
      ['ivan', -23, 3, 2],
    ]);
  });

  it('drops the worst weeks when the admin enables it', () => {
    const bato = [-6, -5, 10, -4, 5, -7, -6, -7].map((s, i) => round('bato', i + 1, s));
    const { rows, countingWeeks } = computeStandings(league({ dropWorst: 2 }), bato, [player('bato')], 'M', finished);

    expect(countingWeeks).toBe(6);
    expect(rows[0].total).toBe(-35);
    expect(rows[0].cells[2]!.dropped).toBe(true);
    expect(rows[0].cells[4]!.dropped).toBe(true);
  });

  it('treats missed weeks as the dropped ones', () => {
    // 7 of 8 weeks played, drop 2 → best 6 count, the missed week is one of the dropped two.
    const rounds = [0, 1, 2, 3, 4, 5, 6].map((s, i) => round('a', i + 1, s));
    const { rows } = computeStandings(league({ dropWorst: 2 }), rounds, [player('a')], 'M', finished);
    expect(rows[0]).toMatchObject({ played: 7, counted: 6, total: 15 });
  });

  it('counts the repeat round instead of the first one, even when it is worse', () => {
    const rounds = [round('a', 1, -5), round('a', 1, 2, 2)];
    const { rows } = computeStandings(league(), rounds, [player('a')], 'M', finished);
    expect(rows[0].total).toBe(2);
    expect(rows[0].cells[0]!.replaced!.toPar).toBe(-5);
  });

  it('does not count an advance round until its week starts', () => {
    const rounds = [round('a', 2, -3), round('a', 3, -4, 1, 'advance')];
    const { rows } = computeStandings(league(), rounds, [player('a')], 'M', at('2026-09-15')); // week 2
    expect(rows[0]).toMatchObject({ played: 1, total: -3 });
    expect(rows[0].cells[2]!.pending).toBe(true);
  });

  it('marks ties and keeps divisions apart', () => {
    const rounds = [round('a', 1, -2), round('b', 1, -2), round('c', 1, 0), { ...round('w', 1, -9), division: 'W' as const }];
    const players = [player('a'), player('b'), player('c'), player('w', 'W')];
    const { rows } = computeStandings(league(), rounds, players, 'M', finished);
    expect(rows.map((r) => [r.playerId, r.rank, r.tied])).toEqual([
      ['a', 1, true],
      ['b', 1, true],
      ['c', 3, false],
    ]);
  });
});

describe('names and formatting', () => {
  it('normalizes names for duplicate detection', () => {
    expect(nameKey('  Đuro ', 'Šimić')).toBe('duro simic');
    expect(nameKey('marko', 'HORVAT')).toBe(nameKey('Marko', 'Horvat'));
  });

  it('tidies typed names', () => {
    expect(tidyName('  marko   horvat ')).toBe('Marko Horvat');
  });

  it('matches searches in any order, ignoring accents', () => {
    expect(matchesSearch({ firstName: 'Ivan', lastName: 'Kovačević' }, 'kovac iv')).toBe(true);
    expect(matchesSearch({ firstName: 'Ivan', lastName: 'Kovačević' }, 'marko')).toBe(false);
  });

  it('formats scores relative to par', () => {
    expect([formatToPar(-3), formatToPar(0), formatToPar(4), formatToPar(null)]).toEqual(['-3', 'E', '+4', '–']);
  });
});

describe('throwingOrder', () => {
  const start = ['aki', 'bato', 'cro'];

  it('keeps the start order on the first hole', () => {
    expect(throwingOrder(start, { aki: [3], bato: [2], cro: [4] }, 0)).toEqual(start);
  });

  it('lets the best score on the previous hole throw first', () => {
    expect(throwingOrder(start, { aki: [3], bato: [2], cro: [4] }, 1)).toEqual(['bato', 'aki', 'cro']);
  });

  it('keeps the order from the hole before when scores tie', () => {
    const scores = { aki: [3, 3], bato: [2, 3], cro: [4, 3] };
    expect(throwingOrder(start, scores, 2)).toEqual(['bato', 'aki', 'cro']);
  });

  it('skips holes that are not fully scored yet', () => {
    const scores = { aki: [3, null], bato: [2, 2], cro: [4, 5] };
    expect(throwingOrder(start, scores, 2)).toEqual(['bato', 'aki', 'cro']);
  });
});
