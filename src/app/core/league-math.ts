import { Attempt, Division, Hole, HoleScore, League, Player, Round, RoundType } from './models';

// ---------------------------------------------------------------------------
// Dates & weeks
// ---------------------------------------------------------------------------

/** Parses 'YYYY-MM-DD' as local midnight. */
export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toYmd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Whole calendar days from a to b (DST-safe). */
function daysBetween(a: Date, b: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export type LeagueStatus = 'upcoming' | 'running' | 'finished';

export interface WeekInfo {
  /** Current week, always within 1..totalWeeks. */
  week: number;
  status: LeagueStatus;
  /** True when the admin forced the week instead of using dates. */
  overridden: boolean;
}

/** Week 1 starts on league.startDate; every following week starts 7 days later. */
export function currentWeek(league: League, now: Date): WeekInfo {
  if (league.currentWeekOverride) {
    return {
      week: clamp(league.currentWeekOverride, 1, league.totalWeeks),
      status: 'running',
      overridden: true,
    };
  }
  const raw = Math.floor(daysBetween(parseYmd(league.startDate), now) / 7) + 1;
  if (raw < 1) return { week: 1, status: 'upcoming', overridden: false };
  if (raw > league.totalWeeks) return { week: league.totalWeeks, status: 'finished', overridden: false };
  return { week: raw, status: 'running', overridden: false };
}

export function weekRange(league: League, week: number): { start: Date; end: Date } {
  const start = addDays(parseYmd(league.startDate), (week - 1) * 7);
  return { start, end: addDays(start, 6) };
}

export function disabledHoles(league: League, week: number): number[] {
  return league.weeks[String(week)]?.disabledHoles ?? [];
}

export function playableHoles(league: League, week: number): Hole[] {
  const closed = new Set(disabledHoles(league, week));
  return league.holes.filter((h) => !closed.has(h.number));
}

// ---------------------------------------------------------------------------
// Scores & names
// ---------------------------------------------------------------------------

export function formatToPar(toPar: number | null | undefined): string {
  if (toPar == null) return '–';
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

export function scoreTotals(holes: HoleScore[]): { strokes: number; par: number; toPar: number } {
  let strokes = 0;
  let par = 0;
  for (const h of holes) {
    strokes += h.strokes;
    par += h.par;
  }
  return { strokes, par, toPar: strokes - par };
}

/**
 * Who throws first on a hole: the lowest score on the previous hole goes first, and ties keep
 * the order they threw in on that hole (the usual disc golf rule). A hole that not everyone has
 * a score on yet leaves the order as it was.
 */
export function throwingOrder(
  startOrder: string[],
  scores: Record<string, (number | null)[]>,
  holeIndex: number,
): string[] {
  let order = startOrder;
  for (let i = 0; i < holeIndex; i++) {
    if (order.some((id) => scores[id]?.[i] == null)) continue;
    order = [...order].sort((a, b) => scores[a][i]! - scores[b][i]!); // stable: ties keep their order
  }
  return order;
}

/** Key of a round inside its week document: one slot per player per attempt. */
export function roundKey(playerId: string, attempt: Attempt): string {
  return `${playerId}_${attempt}`;
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

/** Lowercase, accents removed, single spaces — used to compare and search names. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identity used to spot duplicates: "Marko  Horvat" and "marko horvat" are the same player. */
export function nameKey(firstName: string, lastName: string): string {
  return normalizeText(`${firstName} ${lastName}`);
}

/** Trims, collapses spaces and capitalises each word ("marko  horvat" → "Marko Horvat"). */
export function tidyName(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toLocaleUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Every word of the query must appear somewhere in the player's name. */
export function matchesSearch(p: { firstName: string; lastName: string }, query: string): boolean {
  const key = nameKey(p.firstName, p.lastName);
  return normalizeText(query)
    .split(' ')
    .every((part) => key.includes(part));
}

// ---------------------------------------------------------------------------
// Round options (first / repeat / advance)
// ---------------------------------------------------------------------------

export interface RoundOption {
  week: number;
  attempt: Attempt;
  type: RoundType;
  label: string;
  hint: string;
}

export function sameSlot(a: { week: number; attempt: Attempt }, b: { week: number; attempt: Attempt }) {
  return a.week === b.week && a.attempt === b.attempt;
}

/**
 * What a player may play right now, given the current week:
 * - first round of the current week (if not played yet), otherwise one repeat of it;
 * - next week's round in advance, otherwise one repeat of that advance round.
 * Past weeks can never be played or repeated.
 */
export function roundOptions(league: League, week: number, playerRounds: Round[]): RoundOption[] {
  const find = (w: number, a: Attempt) => playerRounds.find((r) => r.week === w && r.attempt === a);
  const options: RoundOption[] = [];

  const first = find(week, 1);
  if (!first) {
    options.push({ week, attempt: 1, type: 'first', label: 'First round', hint: `Week ${week}` });
  } else if (!find(week, 2)) {
    options.push({
      week,
      attempt: 2,
      type: 'repeat',
      label: 'Repeat round',
      hint: `Week ${week} · replaces ${formatToPar(first.toPar)}`,
    });
  }

  const next = week + 1;
  if (next <= league.totalWeeks) {
    const advance = find(next, 1);
    if (!advance) {
      options.push({ week: next, attempt: 1, type: 'advance', label: 'Round in advance', hint: `Week ${next}` });
    } else if (!find(next, 2)) {
      options.push({
        week: next,
        attempt: 2,
        type: 'repeat',
        label: 'Repeat advance round',
        hint: `Week ${next} · replaces ${formatToPar(advance.toPar)}`,
      });
    }
  }
  return options;
}

export function roundTypeLabel(type: RoundType): string {
  switch (type) {
    case 'first':
      return 'First round';
    case 'advance':
      return 'In advance';
    case 'repeat':
      return 'Repeat';
  }
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export interface EffectiveRound {
  /** The round that counts for the week: the repeat if there is one. */
  round: Round;
  /** The first attempt, when a repeat replaced it. */
  replaced: Round | null;
}

/** playerId → week → round that counts for that week. */
export function effectiveRounds(rounds: Round[]): Map<string, Map<number, EffectiveRound>> {
  const slots = new Map<string, Map<number, { 1?: Round; 2?: Round }>>();
  for (const r of rounds) {
    let weeks = slots.get(r.playerId);
    if (!weeks) slots.set(r.playerId, (weeks = new Map()));
    const slot = weeks.get(r.week) ?? {};
    slot[r.attempt] = r;
    weeks.set(r.week, slot);
  }

  const result = new Map<string, Map<number, EffectiveRound>>();
  for (const [playerId, weeks] of slots) {
    const out = new Map<number, EffectiveRound>();
    for (const [week, slot] of weeks) {
      const round = slot[2] ?? slot[1]!;
      out.set(week, { round, replaced: slot[2] ? (slot[1] ?? null) : null });
    }
    result.set(playerId, out);
  }
  return result;
}

export interface WeekCell extends EffectiveRound {
  week: number;
  /** Part of the player's total. */
  counted: boolean;
  /** Played, but dropped as one of the worst weeks. */
  dropped: boolean;
  /** Played in advance; counts once its week starts. */
  pending: boolean;
}

export interface StandingRow {
  playerId: string;
  name: string;
  division: Division;
  /** Index = week - 1. */
  cells: (WeekCell | null)[];
  /** Weeks played so far (not counting rounds played in advance for future weeks). */
  played: number;
  counted: number;
  /** Sum of counted rounds relative to par. */
  total: number | null;
  strokes: number;
  rank: number | null;
  tied: boolean;
}

export interface Standings {
  rows: StandingRow[];
  info: WeekInfo;
  /** Weeks that already count (1..consideredWeeks). */
  consideredWeeks: number;
  /** How many of those weeks count per player after dropping the worst ones. */
  countingWeeks: number;
}

/**
 * Ranking: more counted weeks first, then lowest total to par.
 *
 * Every week that has started counts, so a player who skipped weeks can't beat
 * someone who played them all. With `dropWorst = N`, each player's N worst weeks
 * are ignored — a missed week is the worst possible week, so it is dropped first.
 */
export function computeStandings(
  league: League,
  rounds: Round[],
  players: Player[],
  division: Division,
  now: Date,
): Standings {
  const info = currentWeek(league, now);
  const consideredWeeks =
    info.status === 'finished' ? league.totalWeeks : info.status === 'upcoming' ? 0 : info.week;
  const countingWeeks = consideredWeeks > 0 ? Math.max(1, consideredWeeks - league.dropWorst) : 0;
  const playersById = new Map(players.map((p) => [p.id, p]));

  const rows: StandingRow[] = [];
  for (const [playerId, weeks] of effectiveRounds(rounds)) {
    const player = playersById.get(playerId);
    const latest = [...weeks.values()].map((w) => w.round).sort((a, b) => b.playedAt - a.playedAt)[0];
    const rowDivision = player?.division ?? latest.division;
    if (rowDivision !== division) continue;

    const cells: (WeekCell | null)[] = Array.from({ length: league.totalWeeks }, () => null);
    const eligible: WeekCell[] = [];
    for (const [week, effective] of weeks) {
      if (week < 1 || week > league.totalWeeks) continue;
      const cell: WeekCell = { ...effective, week, counted: false, dropped: false, pending: week > consideredWeeks };
      cells[week - 1] = cell;
      if (!cell.pending) eligible.push(cell);
    }

    eligible.sort((a, b) => a.round.toPar - b.round.toPar || a.week - b.week);
    const counted = eligible.slice(0, countingWeeks);
    counted.forEach((c) => (c.counted = true));
    eligible.slice(countingWeeks).forEach((c) => (c.dropped = true));

    rows.push({
      playerId,
      name: player ? fullName(player) : latest.playerName,
      division: rowDivision,
      cells,
      played: eligible.length,
      counted: counted.length,
      total: counted.length ? counted.reduce((s, c) => s + c.round.toPar, 0) : null,
      strokes: counted.reduce((s, c) => s + c.round.strokes, 0),
      rank: null,
      tied: false,
    });
  }

  rows.sort(
    (a, b) =>
      b.counted - a.counted || (a.total ?? 0) - (b.total ?? 0) || a.name.localeCompare(b.name),
  );

  const sameScore = (a: StandingRow, b: StandingRow) => a.counted === b.counted && a.total === b.total;
  rows.forEach((row, i) => {
    if (!row.counted) return;
    const prev = rows[i - 1];
    row.rank = prev && sameScore(prev, row) ? prev.rank : i + 1;
    row.tied = (!!prev && sameScore(prev, row)) || (!!rows[i + 1] && sameScore(rows[i + 1], row));
  });

  return { rows, info, consideredWeeks, countingWeeks };
}
