import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';

import { computeStandings, roundTypeLabel, WeekCell } from '../../core/league-math';
import { DataStore } from '../../data/data-store';
import { formatDay, scoreClass, ToParPipe, totalClass } from '../../shared/format';

/** One player's rounds in the viewed league, hole by hole. */
@Component({
  selector: 'app-player',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule, ToParPipe],
  template: `
    <div class="page narrow">
      <a mat-button routerLink="/standings" class="back"><mat-icon>arrow_back</mat-icon> Poredak</a>
      @if (!store.ready() || !store.viewedRounds()) {
        <div class="loading"><mat-spinner diameter="40" /></div>
      } @else if (!row()) {
        <div class="empty-state">
          <mat-icon>person_off</mat-icon>
          <h2>Nema rundi</h2>
          <p>Ovaj igrač nema rundi u ligi {{ store.viewedLeague()?.name }}.</p>
        </div>
      } @else {
        @let r = row()!;
        <header class="page-head">
          <div>
            <h1>{{ r.name }}</h1>
            <p class="muted sub">{{ store.viewedLeague()?.name }} · {{ r.division === 'W' ? 'Žene' : 'Muškarci' }}</p>
          </div>
          <div class="stats">
            <div><span class="stat" [class]="totalClass(r.total)">{{ r.total | toPar }}</span><span class="muted">Ukupno</span></div>
            <div><span class="stat">{{ r.rank ? (r.tied ? 'T' : '') + r.rank : '–' }}</span><span class="muted">Mjesto</span></div>
            <div><span class="stat">{{ r.counted }}</span><span class="muted">Tjedni</span></div>
          </div>
        </header>

        @for (cell of cells(); track cell.week) {
          <article class="panel week" [class.faded]="cell.dropped || cell.pending">
            <div class="week-head">
              <strong>Tjedan {{ cell.week }}</strong>
              <span class="chip">{{ typeLabel(cell.round.type) }}</span>
              @if (cell.pending) {
                <span class="chip">Broji se od {{ cell.week }}. tjedna</span>
              }
              @if (cell.dropped) {
                <span class="chip">Ne broji se</span>
              }
              <span class="spacer"></span>
              <span class="score" [class]="totalClass(cell.round.toPar)">{{ cell.round.toPar | toPar }}</span>
              <span class="muted">{{ cell.round.strokes }}</span>
            </div>
            <div class="holes">
              @for (h of cell.round.holes; track h.number) {
                <div class="h" [class]="scoreClass(h.strokes - h.par)">
                  <span class="hn">{{ h.number }}</span>
                  <span class="hs">{{ h.strokes }}</span>
                </div>
              }
            </div>
            <p class="muted meta">
              Odigrano {{ day(cell.round.playedAt) }}{{ cell.round.scoredBy && cell.round.scoredBy !== r.name ? ' · zapisničar: ' + cell.round.scoredBy : '' }}
              @if (cell.replaced) {
                · ponovljena; prvi pokušaj bio je {{ cell.replaced.toPar | toPar }} ({{ cell.replaced.strokes }})
              }
            </p>
          </article>
        }
      }
    </div>
  `,
  styles: `
    .narrow { max-width: 760px; }
    .back { margin: -8px 0 8px -8px; }
    .sub { margin: 4px 0 0; }
    .stats { display: flex; gap: 20px; }
    .stats > div { display: flex; flex-direction: column; align-items: center; font: var(--mat-sys-label-small); }
    .stat { font: var(--mat-sys-headline-small); }
    .week { margin-bottom: 12px; }
    .week.faded { opacity: 0.65; }
    .week-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .spacer { flex: 1; }
    .score { font: var(--mat-sys-title-large); }
    .holes { display: grid; grid-template-columns: repeat(auto-fill, minmax(34px, 1fr)); gap: 4px; }
    .h { display: flex; flex-direction: column; align-items: center; padding: 3px 0; border-radius: 8px; background: var(--score-bg, var(--mat-sys-surface-container-high)); color: var(--score-fg, inherit); }
    .hn { font-size: 10px; opacity: 0.7; }
    .hs { font-weight: 700; }
    .meta { margin: 10px 0 0; font: var(--mat-sys-body-small); }
  `,
})
export class PlayerPage {
  protected readonly store = inject(DataStore);
  readonly id = input.required<string>();

  protected readonly scoreClass = scoreClass;
  protected readonly totalClass = totalClass;
  protected readonly typeLabel = roundTypeLabel;
  protected readonly day = formatDay;

  protected readonly row = computed(() => {
    const league = this.store.viewedLeague();
    const rounds = this.store.viewedRounds();
    if (!league || !rounds) return null;
    const mine = rounds.filter((r) => r.playerId === this.id());
    if (!mine.length) return null;
    const player = this.store.players().find((p) => p.id === this.id());
    const division = player?.division ?? mine[0].division;
    // Rank needs everyone in the division, so compute the full table and pick this row.
    return (
      computeStandings(league, rounds, this.store.players(), division, this.store.now()).rows.find(
        (r) => r.playerId === this.id(),
      ) ?? null
    );
  });

  protected readonly cells = computed(() =>
    (this.row()?.cells ?? []).filter((c): c is WeekCell => !!c).reverse(),
  );
}
