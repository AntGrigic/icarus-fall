import { addDays, fullName, roundKey, scoreTotals, toYmd } from '../core/league-math';
import { AppConfig, Attempt, Division, League, Player, Round, RoundType } from '../core/models';

export interface LocalDb {
  config: AppConfig;
  leagues: Record<string, League>;
  players: Record<string, Player>;
  /** leagueId → week → roundKey → round (same shape as Firestore). */
  rounds: Record<string, Record<string, Record<string, Round>>>;
}

const PARS = [3, 3, 4, 3, 3, 3, 4, 3, 3, 3, 4, 3, 3, 3, 5, 3, 3, 4];

/** [first name, last name, division, skill: average strokes over par per hole] */
const PEOPLE: [string, string, Division, number][] = [
  ['Bato', 'Horvat', 'M', -0.2],
  ['Marko', 'Babić', 'M', -0.1],
  ['Ivan', 'Novak', 'M', 0.05],
  ['Luka', 'Marić', 'M', 0.15],
  ['Petar', 'Jurić', 'M', 0.3],
  ['Tomislav', 'Knežević', 'M', 0.2],
  ['Ante', 'Vuković', 'M', 0.45],
  ['Josip', 'Perić', 'M', 0.6],
  ['Ana', 'Kovačević', 'W', 0.1],
  ['Maja', 'Pavlović', 'W', 0.3],
  ['Ivana', 'Božić', 'W', 0.45],
  ['Petra', 'Tomić', 'W', 0.6],
];

/** Small deterministic PRNG so the demo looks the same every time it is reset. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A league in its 4th week, with a few weeks of rounds, a repeat and an advance round. */
export function createDemoDb(now = new Date()): LocalDb {
  const rand = mulberry32(7);
  const start = addDays(now, -24);
  const leagueId = 'demo-league';
  const league: League = {
    id: leagueId,
    name: `Jesenska liga ${now.getFullYear()}`,
    startDate: toYmd(start),
    totalWeeks: 8,
    holes: PARS.map((par, i) => ({ number: i + 1, par })),
    dropWorst: 0,
    currentWeekOverride: null,
    weeks: { '4': { disabledHoles: [9, 10] } },
    createdAt: start.getTime(),
  };

  const players: Player[] = PEOPLE.map(([firstName, lastName, division], i) => ({
    id: `demo-player-${i + 1}`,
    firstName,
    lastName,
    division,
    createdAt: start.getTime(),
  }));

  const rounds: Record<string, Record<string, Round>> = {};
  const add = (player: Player, skill: number, week: number, attempt: Attempt, type: RoundType) => {
    const closed = league.weeks[String(week)]?.disabledHoles ?? [];
    const holes = league.holes
      .filter((h) => !closed.includes(h.number))
      .map((h) => ({ ...h, strokes: holeScore(h.par, skill, rand) }));
    const day = addDays(start, (week - 1) * 7 + Math.floor(rand() * 6)).getTime() + 17 * 3_600_000;
    const playedAt = Math.min(day, now.getTime() - 3_600_000); // never in the future
    (rounds[week] ??= {})[roundKey(player.id, attempt)] = {
      playerId: player.id,
      playerName: fullName(player),
      division: player.division,
      week,
      attempt,
      type,
      holes,
      ...scoreTotals(holes),
      cardId: `demo-card-${week}`,
      scoredBy: fullName(player),
      playedAt,
    };
  };

  players.forEach((player, i) => {
    const skill = PEOPLE[i][3];
    for (let week = 1; week <= 3; week++) {
      // Bato never misses a week; others skip now and then.
      if (i === 0 || rand() < 0.8) add(player, skill, week, 1, 'first');
    }
    if (i % 2 === 0) add(player, skill, 4, 1, 'first');
  });
  add(players[1], PEOPLE[1][3], 2, 2, 'repeat'); // Marko repeated week 2
  add(players[2], PEOPLE[2][3], 5, 1, 'advance'); // Ivan already played week 5

  return {
    config: { activeLeagueId: leagueId },
    leagues: { [leagueId]: league },
    players: Object.fromEntries(players.map((p) => [p.id, p])),
    rounds: { [leagueId]: rounds },
  };
}

function holeScore(par: number, skill: number, rand: () => number): number {
  const clamp = (p: number) => Math.max(0.01, p);
  const birdie = clamp(0.2 - skill * 0.2);
  const bogey = clamp(0.15 + skill * 0.3);
  const double = clamp(0.03 + skill * 0.08);
  const x = rand();
  if (x < birdie) return par - 1;
  if (x < birdie + bogey) return par + 1;
  if (x < birdie + bogey + double) return par + 2;
  return par;
}
