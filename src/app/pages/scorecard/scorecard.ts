import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';

import { RoundOption, roundOptions, sameSlot } from '../../core/league-math';
import { Round } from '../../core/models';
import { DataStore, describeError, SaveResult } from '../../data/data-store';
import { CardPlayer, CardService } from '../../play/card.service';
import { Confirm } from '../../shared/confirm';
import { scoreClass, ToParPipe, totalClass } from '../../shared/format';

const MAX_STROKES = 20;

@Component({
  selector: 'app-scorecard',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ToParPipe,
  ],
  templateUrl: './scorecard.html',
  styleUrl: './scorecard.scss',
})
export class ScorecardPage {
  protected readonly store = inject(DataStore);
  private readonly cards = inject(CardService);
  private readonly router = inject(Router);
  private readonly confirm = inject(Confirm);

  protected readonly card = this.cards.card;
  protected readonly view = signal<'hole' | 'review' | 'done'>('hole');
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly submitted = signal<{ result: SaveResult; rounds: Round[] } | null>(null);
  protected readonly scoreClass = scoreClass;
  protected readonly totalClass = totalClass;

  protected readonly index = computed(() => this.card()?.holeIndex ?? 0);
  protected readonly hole = computed(() => this.card()?.holes[this.index()] ?? null);
  protected readonly isLast = computed(() => this.index() === (this.card()?.holes.length ?? 0) - 1);

  /** Why each player's round can't be submitted yet (null = ready). */
  protected readonly problems = computed(() => {
    const card = this.card();
    if (!card) return {};
    const out: Record<string, string | null> = {};
    for (const p of card.players) out[p.playerId] = this.problemFor(p);
    return out;
  });

  protected readonly canSubmit = computed(() => {
    const card = this.card();
    return !!card?.players.length && Object.values(this.problems()).every((p) => !p);
  });

  constructor() {
    effect(() => {
      if (!this.card() && this.view() !== 'done') this.router.navigate(['/play']);
    });
  }

  protected score(p: CardPlayer, holeIndex: number): number | null {
    return this.card()?.scores[p.playerId]?.[holeIndex] ?? null;
  }

  protected holeDone(holeIndex: number): boolean {
    return !!this.card()?.players.every((p) => this.score(p, holeIndex) != null);
  }

  protected thru(p: CardPlayer): number {
    return (this.card()?.scores[p.playerId] ?? []).filter((s) => s != null).length;
  }

  protected toPar(p: CardPlayer): number {
    const card = this.card();
    if (!card) return 0;
    return card.holes.reduce((sum, h, i) => {
      const s = card.scores[p.playerId]?.[i];
      return s == null ? sum : sum + s - h.par;
    }, 0);
  }

  protected strokes(p: CardPlayer): number {
    return (this.card()?.scores[p.playerId] ?? []).reduce<number>((sum, s) => sum + (s ?? 0), 0);
  }

  protected change(p: CardPlayer, delta: number): void {
    const hole = this.hole();
    if (!hole) return;
    const current = this.score(p, this.index()) ?? hole.par;
    this.cards.setScore(p.playerId, this.index(), Math.min(MAX_STROKES, Math.max(1, current + delta)));
  }

  protected confirmPar(p: CardPlayer): void {
    const hole = this.hole();
    if (hole && this.score(p, this.index()) == null) this.cards.setScore(p.playerId, this.index(), hole.par);
  }

  protected next(): void {
    this.cards.fillPar(this.index());
    if (this.isLast()) this.view.set('review');
    else this.cards.goToHole(this.index() + 1);
  }

  protected prev(): void {
    this.cards.goToHole(this.index() - 1);
  }

  protected goToHole(i: number): void {
    this.cards.goToHole(i);
    this.view.set('hole');
  }

  protected review(): void {
    this.view.set('review');
  }

  protected optionsFor(p: CardPlayer): RoundOption[] {
    const league = this.store.activeLeague();
    const week = this.store.activeWeek();
    const rounds = this.store.activeRounds();
    if (!league || !week || !rounds) return [];
    return roundOptions(league, week.week, rounds.filter((r) => r.playerId === p.playerId));
  }

  protected optionKey(o: RoundOption): string {
    return `${o.week}-${o.attempt}`;
  }

  protected setOption(p: CardPlayer, key: string): void {
    const option = this.optionsFor(p).find((o) => this.optionKey(o) === key);
    if (option) this.cards.setOption(p.playerId, option);
  }

  protected removePlayer(p: CardPlayer): void {
    this.cards.removePlayer(p.playerId);
  }

  protected async discard(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Discard round?',
      message: 'All scores on this card will be lost.',
      confirmText: 'Discard',
      danger: true,
    });
    if (ok) this.cards.discard();
  }

  protected async submit(): Promise<void> {
    const card = this.card();
    if (!card || !this.canSubmit()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const rounds = this.cards.buildRounds(card);
      const result = await this.store.submitRounds(card.leagueId, rounds);
      this.submitted.set({ result, rounds });
      this.view.set('done');
      this.cards.discard();
    } catch (e) {
      this.saveError.set(describeError(e));
    } finally {
      this.saving.set(false);
    }
  }

  private problemFor(p: CardPlayer): string | null {
    const card = this.card()!;
    const missing = card.holes.filter((_, i) => this.score(p, i) == null).length;
    if (missing) return `${missing} hole${missing > 1 ? 's' : ''} without a score.`;
    if (this.store.activeLeague()?.id !== card.leagueId) return 'The active league changed. Ask the admin.';
    const options = this.optionsFor(p);
    if (!options.some((o) => sameSlot(o, p.option))) {
      return options.length
        ? `${p.option.label} for week ${p.option.week} is already saved. Choose another round.`
        : 'Nothing left to play this week. Remove this player from the card.';
    }
    return null;
  }
}
