import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';

import { newId } from '../../core/ids';
import {
  disabledHoles,
  fullName,
  parseYmd,
  playableHoles,
  RoundOption,
  roundOptions,
  sameSlot,
  weekRange,
} from '../../core/league-math';
import { Player } from '../../core/models';
import { DataStore } from '../../data/data-store';
import { CardService } from '../../play/card.service';
import { Confirm } from '../../shared/confirm';
import { formatDay, formatRange, plural } from '../../shared/format';
import { PlayerPicker } from '../../shared/player-picker';

interface Draft {
  player: Player;
  option: RoundOption | null;
}

/** Set up a card: who is in the flight and which round each of them is playing. */
@Component({
  selector: 'app-play',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule, PlayerPicker],
  templateUrl: './play.html',
  styleUrl: './play.scss',
})
export class PlayPage {
  protected readonly store = inject(DataStore);
  protected readonly cards = inject(CardService);
  private readonly router = inject(Router);
  private readonly confirm = inject(Confirm);

  protected readonly league = this.store.activeLeague;
  protected readonly week = this.store.activeWeek;
  protected readonly drafts = signal<Draft[]>([]);
  protected readonly name = fullName;
  protected readonly sameSlot = sameSlot;
  protected readonly plural = plural;

  protected readonly weekText = computed(() => {
    const league = this.league();
    const week = this.week();
    if (!league || !week) return '';
    const holes = playableHoles(league, week.week).length;
    return `Tjedan ${week.week} · ${formatRange(weekRange(league, week.week))} · ${holes} ${plural(holes, 'koš', 'koša', 'koševa')}`;
  });

  protected readonly startsOn = computed(() => {
    const league = this.league();
    return league ? formatDay(parseYmd(league.startDate)) : '';
  });

  protected readonly closedHoles = computed(() => {
    const league = this.league();
    const week = this.week();
    return league && week ? disabledHoles(league, week.week) : [];
  });

  protected readonly selectedIds = computed(() => this.drafts().map((d) => d.player.id));

  protected readonly canStart = computed(
    () => this.drafts().length > 0 && this.drafts().every((d) => d.option),
  );

  /** Used by the picker to grey out players with nothing left to play this week. */
  protected readonly unavailable = (p: Player): string | null =>
    this.optionsFor(p).length ? null : 'ovaj tjedan nema više rundi za igranje';

  protected optionsFor(player: Player): RoundOption[] {
    const league = this.league();
    const week = this.week();
    const rounds = this.store.activeRounds();
    if (!league || !week || !rounds) return [];
    return roundOptions(
      league,
      week.week,
      rounds.filter((r) => r.playerId === player.id),
    );
  }

  protected add(player: Player): void {
    const options = this.optionsFor(player);
    // Only pre-select a plain first round; a repeat replaces a score, so that must be a deliberate choice.
    const option = options[0]?.type === 'first' ? options[0] : null;
    this.drafts.update((list) => [...list, { player, option }]);
  }

  protected remove(playerId: string): void {
    this.drafts.update((list) => list.filter((d) => d.player.id !== playerId));
  }

  protected choose(playerId: string, option: RoundOption): void {
    this.drafts.update((list) => list.map((d) => (d.player.id === playerId ? { ...d, option } : d)));
  }

  protected async start(): Promise<void> {
    const league = this.league();
    const week = this.week();
    if (!league || !week || !this.canStart()) return;
    if (
      this.cards.card() &&
      !(await this.confirm.ask({
        title: 'Započeti novu rundu?',
        message: 'Runda koja je u tijeku na ovom mobitelu bit će odbačena.',
        confirmText: 'Započni novu rundu',
        danger: true,
      }))
    ) {
      return;
    }

    const holes = playableHoles(league, week.week);
    this.cards.start({
      id: newId(),
      leagueId: league.id,
      createdAt: Date.now(),
      holes,
      players: this.drafts().map((d) => ({
        playerId: d.player.id,
        name: fullName(d.player),
        division: d.player.division,
        option: d.option!,
      })),
      startOrder: shuffle(this.drafts().map((d) => d.player.id)),
      scores: Object.fromEntries(this.drafts().map((d) => [d.player.id, holes.map(() => null)])),
      holeIndex: 0,
    });
    this.drafts.set([]);
    this.router.navigate(['/play/card']);
  }

  protected async discard(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Odbaciti rundu?',
      message: 'Rezultati upisani na ovaj scorecard bit će izgubljeni.',
      confirmText: 'Odbaci',
      danger: true,
    });
    if (ok) this.cards.discard();
  }
}

/** Fisher–Yates: every order is equally likely. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
