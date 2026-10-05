import { roundKey } from '../core/league-math';
import { League, Player, Round } from '../core/models';
import { Backend, BackendSink } from './backend';
import { createDemoDb, LocalDb } from './demo-data';

const DB_KEY = 'icarus-fall.demo-db';
const ADMIN_KEY = 'icarus-fall.demo-admin';

/**
 * Demo backend used until Firebase is configured. Data lives in this browser's
 * localStorage only, and other tabs stay in sync through the `storage` event.
 */
export class LocalBackend implements Backend {
  readonly mode = 'demo';
  private db: LocalDb;
  private readonly watched = new Set<string>();
  private isAdmin = sessionStorage.getItem(ADMIN_KEY) === '1';

  constructor(private readonly sink: BackendSink) {
    this.db = this.load() ?? createDemoDb();
    this.save();
    window.addEventListener('storage', (e) => {
      if (e.key !== DB_KEY) return;
      this.db = this.load() ?? createDemoDb();
      this.emit();
    });
    queueMicrotask(() => {
      this.emit();
      this.emitAuth();
      sink.setReady();
    });
  }

  watchRounds(leagueIds: string[]): void {
    this.watched.clear();
    leagueIds.forEach((id) => this.watched.add(id));
    this.emitRounds(structuredClone(this.db.rounds));
  }

  addPlayer(player: Player): Promise<void> {
    return this.commit((db) => {
      if (!db.players[player.id]) db.players[player.id] = player;
    });
  }

  submitRounds(leagueId: string, rounds: Round[]): Promise<void> {
    // Same rule as Firestore: a filled slot can't be overwritten, and nothing is saved if one is taken.
    const weeks = this.db.rounds[leagueId] ?? {};
    if (rounds.some((r) => weeks[r.week]?.[roundKey(r.playerId, r.attempt)])) {
      return Promise.reject(Object.assign(new Error('Round already saved'), { code: 'permission-denied' }));
    }
    return this.commit((db) => {
      for (const r of rounds) ((db.rounds[leagueId] ??= {})[r.week] ??= {})[roundKey(r.playerId, r.attempt)] = r;
    });
  }

  updatePlayer(player: Player): Promise<void> {
    return this.admin((db) => (db.players[player.id] = player));
  }

  deletePlayer(playerId: string, leagueId: string | null, rounds: Round[]): Promise<void> {
    return this.admin((db) => {
      delete db.players[playerId];
      if (leagueId) for (const r of rounds) delete db.rounds[leagueId]?.[r.week]?.[roundKey(r.playerId, r.attempt)];
    });
  }

  saveRound(leagueId: string, round: Round): Promise<void> {
    return this.admin((db) => {
      ((db.rounds[leagueId] ??= {})[round.week] ??= {})[roundKey(round.playerId, round.attempt)] = round;
    });
  }

  deleteRound(leagueId: string, round: Round): Promise<void> {
    return this.admin((db) => {
      delete db.rounds[leagueId]?.[round.week]?.[roundKey(round.playerId, round.attempt)];
    });
  }

  saveLeague(league: League): Promise<void> {
    return this.admin((db) => (db.leagues[league.id] = league));
  }

  setActiveLeague(leagueId: string): Promise<void> {
    return this.admin((db) => (db.config.activeLeagueId = leagueId));
  }

  async signIn(): Promise<void> {
    // Demo mode: any email/password works.
    this.isAdmin = true;
    sessionStorage.setItem(ADMIN_KEY, '1');
    this.emitAuth();
  }

  async signOut(): Promise<void> {
    this.isAdmin = false;
    sessionStorage.removeItem(ADMIN_KEY);
    this.emitAuth();
  }

  resetDemo(): void {
    this.db = createDemoDb();
    this.save();
    this.emit();
  }

  private admin(mutate: (db: LocalDb) => void): Promise<void> {
    if (!this.isAdmin) {
      return Promise.reject(Object.assign(new Error('Admins only'), { code: 'permission-denied' }));
    }
    return this.commit(mutate);
  }

  private commit(mutate: (db: LocalDb) => void): Promise<void> {
    mutate(this.db);
    this.save();
    this.emit();
    return Promise.resolve();
  }

  private emit(): void {
    // Hand out copies so nothing outside can mutate the stored data.
    const db: LocalDb = structuredClone(this.db);
    this.sink.setConfig(db.config);
    this.sink.setLeagues(Object.values(db.leagues));
    this.sink.setPlayers(Object.values(db.players));
    this.emitRounds(db.rounds);
  }

  private emitRounds(rounds: LocalDb['rounds']): void {
    for (const id of this.watched) {
      const weeks = rounds[id] ?? {};
      this.sink.setRounds(id, Object.values(weeks).flatMap((w) => Object.values(w)));
    }
  }

  private emitAuth(): void {
    this.sink.setAuth({ isAdmin: this.isAdmin, email: this.isAdmin ? 'demo-admin' : null, uid: null });
  }

  private load(): LocalDb | null {
    try {
      const raw = localStorage.getItem(DB_KEY);
      return raw ? (JSON.parse(raw) as LocalDb) : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.db));
    } catch {
      // Storage full or blocked: the demo keeps working in memory.
    }
  }
}
