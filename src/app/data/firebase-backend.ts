import { FirebaseOptions, initializeApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteField,
  doc,
  DocumentData,
  FieldPath,
  Firestore,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  Unsubscribe,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { roundKey } from '../core/league-math';
import { League, Player, Round } from '../core/models';
import { Backend, BackendSink } from './backend';

/**
 * Firestore layout (designed so a whole league loads in ~10 document reads):
 *
 *   config/app                     { activeLeagueId }
 *   leagues/{leagueId}             League (without id)
 *   leagues/{leagueId}/weeks/{n}   { rounds: { "<playerId>_<attempt>": Round } }
 *   directory/players              { players: { "<playerId>": Player } }
 *   admins/{uid}                   exists ⇒ that signed-in user is an admin
 */
export class FirebaseBackend implements Backend {
  readonly mode = 'firebase';
  private readonly db: Firestore;
  private readonly auth: Auth;
  private readonly roundSubs = new Map<string, Unsubscribe>();
  private adminSub: Unsubscribe | null = null;

  constructor(
    config: FirebaseOptions,
    private readonly sink: BackendSink,
  ) {
    const app = initializeApp(config);
    // Persistent cache: the app keeps working on the course without signal and syncs later.
    this.db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
    this.auth = getAuth(app);

    const waiting = new Set(['config', 'leagues', 'players']);
    const loaded = (part: string) => {
      waiting.delete(part);
      if (!waiting.size) sink.setReady();
    };
    const onError = (err: unknown) => sink.reportError(err);

    onSnapshot(
      doc(this.db, 'config', 'app'),
      (snap) => {
        sink.setConfig({ activeLeagueId: snap.data()?.['activeLeagueId'] ?? null });
        loaded('config');
      },
      onError,
    );
    onSnapshot(
      collection(this.db, 'leagues'),
      (snap) => {
        sink.setLeagues(snap.docs.map((d) => toLeague(d.id, d.data())));
        loaded('leagues');
      },
      onError,
    );
    onSnapshot(
      doc(this.db, 'directory', 'players'),
      (snap) => {
        const map: Record<string, Omit<Player, 'id'>> = snap.data()?.['players'] ?? {};
        sink.setPlayers(Object.entries(map).map(([id, p]) => ({ ...p, id })));
        loaded('players');
      },
      onError,
    );

    // Players never see a login: every device silently gets an anonymous account.
    onAuthStateChanged(this.auth, (user) => {
      this.adminSub?.();
      this.adminSub = null;
      if (!user) {
        sink.setAuth({ isAdmin: false, email: null, uid: null });
        signInAnonymously(this.auth).catch(onError);
        return;
      }
      if (user.isAnonymous) {
        sink.setAuth({ isAdmin: false, email: null, uid: user.uid });
        return;
      }
      this.adminSub = onSnapshot(
        doc(this.db, 'admins', user.uid),
        (snap) => sink.setAuth({ isAdmin: snap.exists(), email: user.email, uid: user.uid }),
        () => sink.setAuth({ isAdmin: false, email: user.email, uid: user.uid }),
      );
    });
  }

  watchRounds(leagueIds: string[]): void {
    for (const [id, unsubscribe] of this.roundSubs) {
      if (!leagueIds.includes(id)) {
        unsubscribe();
        this.roundSubs.delete(id);
      }
    }
    for (const id of leagueIds) {
      if (this.roundSubs.has(id)) continue;
      const unsubscribe = onSnapshot(
        collection(this.db, 'leagues', id, 'weeks'),
        (snap) => {
          const rounds = snap.docs.flatMap((d) =>
            Object.values((d.data()['rounds'] ?? {}) as Record<string, Round>).map((r) => ({
              ...r,
              week: Number(d.id),
            })),
          );
          this.sink.setRounds(id, rounds);
        },
        (err) => this.sink.reportError(err),
      );
      this.roundSubs.set(id, unsubscribe);
    }
  }

  addPlayer(player: Player): Promise<void> {
    return this.setPlayer(player);
  }

  submitRounds(leagueId: string, rounds: Round[]): Promise<void> {
    // One batch: either every player's round on the card is saved, or none is.
    const batch = writeBatch(this.db);
    for (const round of rounds) {
      const key = roundKey(round.playerId, round.attempt);
      batch.set(
        this.weekRef(leagueId, round.week),
        { rounds: { [key]: round } },
        { mergeFields: [new FieldPath('rounds', key)] },
      );
    }
    return batch.commit();
  }

  updatePlayer(player: Player): Promise<void> {
    return this.setPlayer(player);
  }

  deletePlayer(playerId: string, leagueId: string | null, rounds: Round[]): Promise<void> {
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'directory', 'players'), new FieldPath('players', playerId), deleteField());
    if (leagueId) {
      for (const round of rounds) {
        batch.update(
          this.weekRef(leagueId, round.week),
          new FieldPath('rounds', roundKey(round.playerId, round.attempt)),
          deleteField(),
        );
      }
    }
    return batch.commit();
  }

  saveRound(leagueId: string, round: Round): Promise<void> {
    const key = roundKey(round.playerId, round.attempt);
    return setDoc(
      this.weekRef(leagueId, round.week),
      { rounds: { [key]: round } },
      { mergeFields: [new FieldPath('rounds', key)] },
    );
  }

  deleteRound(leagueId: string, round: Round): Promise<void> {
    return updateDoc(
      this.weekRef(leagueId, round.week),
      new FieldPath('rounds', roundKey(round.playerId, round.attempt)),
      deleteField(),
    );
  }

  saveLeague(league: League): Promise<void> {
    const { id, ...data } = league;
    return setDoc(doc(this.db, 'leagues', id), data);
  }

  setActiveLeague(leagueId: string): Promise<void> {
    return setDoc(doc(this.db, 'config', 'app'), { activeLeagueId: leagueId }, { merge: true });
  }

  async signIn(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // pick the right Gmail if you have several
    await signInWithPopup(this.auth, provider);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth); // onAuthStateChanged signs the device back in anonymously
  }

  private setPlayer(player: Player): Promise<void> {
    const { id, ...data } = player;
    return setDoc(
      doc(this.db, 'directory', 'players'),
      { players: { [id]: data } },
      { mergeFields: [new FieldPath('players', id)] },
    );
  }

  private weekRef(leagueId: string, week: number) {
    return doc(this.db, 'leagues', leagueId, 'weeks', String(week));
  }
}

function toLeague(id: string, data: DocumentData): League {
  return {
    id,
    name: data['name'] ?? 'Liga',
    startDate: data['startDate'],
    totalWeeks: data['totalWeeks'] ?? 8,
    holes: data['holes'] ?? [],
    dropWorst: data['dropWorst'] ?? 0,
    currentWeekOverride: data['currentWeekOverride'] ?? null,
    weeks: data['weeks'] ?? {},
    createdAt: data['createdAt'] ?? 0,
  };
}
