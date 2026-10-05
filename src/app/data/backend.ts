import { AppConfig, League, Player, Round } from '../core/models';

export interface AuthState {
  isAdmin: boolean;
  email: string | null;
  uid: string | null;
}

/** Callbacks a backend uses to push live data into the DataStore. */
export interface BackendSink {
  setConfig(config: AppConfig): void;
  setLeagues(leagues: League[]): void;
  setPlayers(players: Player[]): void;
  setRounds(leagueId: string, rounds: Round[]): void;
  setAuth(auth: AuthState): void;
  setReady(): void;
  reportError(error: unknown): void;
}

/**
 * Storage implementation. Firebase is used when configured; otherwise a local
 * demo backend keeps everything in this browser's localStorage.
 */
export interface Backend {
  readonly mode: 'firebase' | 'demo';
  /** Keep live round data flowing for exactly these leagues. */
  watchRounds(leagueIds: string[]): void;

  addPlayer(player: Player): Promise<void>;
  /** Players may only add rounds into empty slots (enforced by Firestore rules). */
  submitRounds(leagueId: string, rounds: Round[]): Promise<void>;

  // Admin only
  updatePlayer(player: Player): Promise<void>;
  deletePlayer(playerId: string, leagueId: string | null, rounds: Round[]): Promise<void>;
  saveRound(leagueId: string, round: Round): Promise<void>;
  deleteRound(leagueId: string, round: Round): Promise<void>;
  saveLeague(league: League): Promise<void>;
  setActiveLeague(leagueId: string): Promise<void>;

  /** Admin sign-in (Google account in Firebase mode). */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  resetDemo?(): void;
}
