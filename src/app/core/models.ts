export type Division = 'M' | 'W';

export const DIVISIONS: readonly { id: Division; label: string }[] = [
  { id: 'M', label: 'Muškarci' },
  { id: 'W', label: 'Žene' },
];

export interface Hole {
  number: number;
  par: number;
}

export interface WeekSettings {
  /** Hole numbers that are not played this week (e.g. closed because of danger). */
  disabledHoles?: number[];
}

export interface League {
  id: string;
  name: string;
  /** First day of week 1, as 'YYYY-MM-DD' (local time). */
  startDate: string;
  totalWeeks: number;
  holes: Hole[];
  /** How many worst weeks are dropped from each player's total. 0 = every week counts. */
  dropWorst: number;
  /** Admin can force the current week instead of calculating it from dates. */
  currentWeekOverride: number | null;
  /** Per-week settings keyed by week number. */
  weeks: Record<string, WeekSettings>;
  createdAt: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  division: Division;
  createdAt: number;
}

export type RoundType = 'first' | 'advance' | 'repeat';

/** 1 = the first round counted for a week, 2 = the one allowed repeat (which replaces attempt 1). */
export type Attempt = 1 | 2;

export interface HoleScore {
  number: number;
  par: number;
  strokes: number;
}

export interface Round {
  playerId: string;
  /** Name/division snapshot so old standings survive a deleted player. */
  playerName: string;
  division: Division;
  week: number;
  attempt: Attempt;
  type: RoundType;
  holes: HoleScore[];
  strokes: number;
  par: number;
  toPar: number;
  cardId: string;
  /** Who kept the card. */
  scoredBy: string;
  playedAt: number;
  editedAt?: number;
}

export interface AppConfig {
  activeLeagueId: string | null;
}
