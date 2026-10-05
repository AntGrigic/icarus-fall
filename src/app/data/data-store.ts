import { computed, effect, Injectable, signal } from '@angular/core';

import { newId } from '../core/ids';
import { currentWeek, fullName, nameKey, tidyName } from '../core/league-math';
import { AppConfig, Division, League, Player, Round } from '../core/models';
import { AuthState, Backend, BackendSink } from './backend';
import { loadFirebaseConfig } from './firebase.config';
import { LocalBackend } from './local-backend';

export type SaveResult = 'saved' | 'queued';

/** App-wide live state. Components read signals; writes go through the backend. */
@Injectable({ providedIn: 'root' })
export class DataStore {
  /** null until we know whether a Firebase config is present. */
  readonly mode = signal<'firebase' | 'demo' | null>(null);

  readonly ready = signal(false);
  readonly config = signal<AppConfig>({ activeLeagueId: null });
  readonly leagues = signal<League[]>([]);
  readonly players = signal<Player[]>([]);
  readonly auth = signal<AuthState>({ isAdmin: false, email: null, uid: null });
  readonly lastError = signal<{ message: string; at: number } | null>(null);
  /** Ticks every minute so the current week rolls over without a reload. */
  readonly now = signal(new Date());
  /** League picked on the standings page; null = the active league. */
  readonly viewedLeagueId = signal<string | null>(null);

  private readonly roundsByLeague = signal<Record<string, Round[]>>({});
  private readonly backend: Promise<Backend>;

  readonly isAdmin = computed(() => this.auth().isAdmin);

  readonly sortedLeagues = computed(() =>
    [...this.leagues()].sort((a, b) => b.startDate.localeCompare(a.startDate)),
  );

  /** The league that is being played now. */
  readonly activeLeague = computed(() => {
    const id = this.config().activeLeagueId;
    return this.leagues().find((l) => l.id === id) ?? this.sortedLeagues().at(0) ?? null;
  });

  readonly viewedLeague = computed(
    () => this.leagues().find((l) => l.id === this.viewedLeagueId()) ?? this.activeLeague(),
  );

  readonly activeWeek = computed(() => {
    const league = this.activeLeague();
    return league ? currentWeek(league, this.now()) : null;
  });

  /** Rounds of the active league; null while still loading. */
  readonly activeRounds = computed(() => this.roundsOf(this.activeLeague()));
  readonly viewedRounds = computed(() => this.roundsOf(this.viewedLeague()));

  readonly sortedPlayers = computed(() =>
    [...this.players()].sort(
      (a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName),
    ),
  );

  constructor() {
    const sink: BackendSink = {
      setConfig: (c) => this.config.set(c),
      setLeagues: (l) => this.leagues.set(l),
      setPlayers: (p) => this.players.set(p),
      setRounds: (id, r) => this.roundsByLeague.update((all) => ({ ...all, [id]: r })),
      setAuth: (a) => this.auth.set(a),
      setReady: () => this.ready.set(true),
      reportError: (e) => this.reportError(e),
    };
    this.backend = loadFirebaseConfig().then(async (firebaseConfig) => {
      if (!firebaseConfig) {
        this.mode.set('demo');
        return new LocalBackend(sink);
      }
      const { FirebaseBackend } = await import('./firebase-backend');
      this.mode.set('firebase');
      return new FirebaseBackend(firebaseConfig, sink);
    });

    // A string so the effect only re-runs when the set of league ids changes,
    // not every time a live update hands us new league objects.
    const watchedIds = computed(() =>
      [...new Set([this.activeLeague()?.id, this.viewedLeague()?.id])].filter(Boolean).sort().join(','),
    );
    effect(() => {
      const ids = watchedIds() ? watchedIds().split(',') : [];
      this.backend.then((b) => b.watchRounds(ids));
    });

    setInterval(() => this.now.set(new Date()), 60_000);
  }

  findPlayerByName(firstName: string, lastName: string): Player | undefined {
    const key = nameKey(firstName, lastName);
    return this.players().find((p) => nameKey(p.firstName, p.lastName) === key);
  }

  /** Adds a player, or returns the existing one with the same name. Works offline. */
  async addPlayer(input: { firstName: string; lastName: string; division: Division }): Promise<Player> {
    const existing = this.findPlayerByName(input.firstName, input.lastName);
    if (existing) return existing;
    const player: Player = {
      id: newId(),
      firstName: tidyName(input.firstName),
      lastName: tidyName(input.lastName),
      division: input.division,
      createdAt: Date.now(),
    };
    const backend = await this.backend;
    backend.addPlayer(player).catch((e) => this.reportError(e));
    return player;
  }

  /**
   * Saves a finished card. Resolves 'queued' when the phone is offline: Firestore keeps
   * the write and sends it as soon as there is signal again.
   */
  async submitRounds(leagueId: string, rounds: Round[]): Promise<SaveResult> {
    const write = (await this.backend).submitRounds(leagueId, rounds);
    const timeout = new Promise<SaveResult>((resolve) => setTimeout(() => resolve('queued'), 5000));
    const result = await Promise.race([write.then((): SaveResult => 'saved'), timeout]);
    if (result === 'queued') write.catch((e) => this.reportError(e));
    return result;
  }

  async updatePlayer(player: Player): Promise<void> {
    await (await this.backend).updatePlayer({
      ...player,
      firstName: tidyName(player.firstName),
      lastName: tidyName(player.lastName),
    });
  }

  /** Deletes the player and their rounds in the given league. Rounds in other leagues keep the name. */
  async deletePlayer(player: Player, league: League | null): Promise<void> {
    const rounds = (this.roundsOf(league) ?? []).filter((r) => r.playerId === player.id);
    await (await this.backend).deletePlayer(player.id, league?.id ?? null, rounds);
  }

  async saveRound(leagueId: string, round: Round): Promise<void> {
    await (await this.backend).saveRound(leagueId, round);
  }

  async deleteRound(leagueId: string, round: Round): Promise<void> {
    await (await this.backend).deleteRound(leagueId, round);
  }

  async saveLeague(league: League): Promise<void> {
    await (await this.backend).saveLeague(league);
  }

  async setActiveLeague(leagueId: string): Promise<void> {
    await (await this.backend).setActiveLeague(leagueId);
  }

  async signIn(): Promise<void> {
    await (await this.backend).signIn();
  }

  async signOut(): Promise<void> {
    await (await this.backend).signOut();
  }

  async resetDemo(): Promise<void> {
    (await this.backend).resetDemo?.();
  }

  playerName(id: string): string {
    const p = this.players().find((x) => x.id === id);
    return p ? fullName(p) : 'Unknown player';
  }

  reportError(error: unknown): void {
    console.error(error);
    this.lastError.set({ message: describeError(error), at: Date.now() });
  }

  private roundsOf(league: League | null): Round[] | null {
    return league ? (this.roundsByLeague()[league.id] ?? null) : [];
  }
}

export function describeError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'permission-denied') {
    return 'Not allowed. Someone may already have saved this round, or you are not an admin.';
  }
  if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') {
    return 'This sign-in method is turned off. Enable Anonymous and Google in Firebase → Authentication → Sign-in method.';
  }
  if (code === 'auth/popup-blocked') return 'The browser blocked the Google pop-up. Allow pop-ups for this site and try again.';
  if (code === 'auth/unauthorized-domain') {
    return `${location.hostname} may not sign in yet. Add it in Firebase → Authentication → Settings → Authorized domains.`;
  }
  if (code === 'unavailable') return 'No connection. Changes will sync when you are back online.';
  return (error as Error)?.message || 'Something went wrong.';
}
