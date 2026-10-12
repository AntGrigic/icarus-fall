import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { newId } from '../../core/ids';
import {
  currentWeek,
  fullName,
  isTotalOnly,
  MAX_STROKES_PER_HOLE,
  playableHoles,
  scoreTotals,
  totalRange,
} from '../../core/league-math';
import { Attempt, HoleScore, League, Round, RoundType } from '../../core/models';
import { DataStore, describeError } from '../../data/data-store';
import { scoreClass, ToParPipe } from '../../shared/format';

export interface RoundEditorData {
  league: League;
  /** null = add a round (e.g. from a paper scorecard). */
  round: Round | null;
  /** Player picked in advance when adding a round from the player's page. */
  playerId?: string;
}

/** Admin dialog to add a round by hand (just the final score, or hole by hole) or to fix one. */
@Component({
  selector: 'app-round-editor',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ToParPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ isNew ? 'Dodaj rundu' : 'Uredi rundu' }}</h2>
    <mat-dialog-content>
      @if (isNew) {
        <div class="fields">
          <mat-form-field appearance="outline" class="player-field">
            <mat-label>Igrač</mat-label>
            <mat-select [ngModel]="playerId()" (ngModelChange)="playerId.set($event)" name="player">
              @for (p of store.sortedPlayers(); track p.id) {
                <mat-option [value]="p.id">{{ name(p) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Tjedan</mat-label>
            <mat-select [ngModel]="week()" (ngModelChange)="setWeek($event)" name="week">
              @for (w of weeks; track w) {
                <mat-option [value]="w">Tjedan {{ w }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Runda</mat-label>
            <mat-select [ngModel]="slot()" (ngModelChange)="setSlot($event)" name="slot">
              <mat-option value="first">Prva runda</mat-option>
              <mat-option value="advance">Prva runda, odigrana unaprijed</mat-option>
              <mat-option value="repeat">Ponovljena (zamjenjuje prvu rundu)</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        @if (existing()) {
          <p class="warn">Ovaj igrač već ima tu rundu za {{ week() }}. tjedan. Spremanje će je zamijeniti.</p>
        }
      } @else {
        <p class="who">
          <strong>{{ data.round!.playerName }}</strong> · tjedan {{ data.round!.week }} ·
          {{ data.round!.attempt === 2 ? 'ponovljena' : data.round!.type === 'advance' ? 'unaprijed' : 'prva runda' }}
        </p>
      }

      <mat-form-field appearance="outline" class="mode-field">
        <mat-label>Upis</mat-label>
        <mat-select [ngModel]="mode()" (ngModelChange)="setMode($event)" name="mode">
          <mat-option value="total">Samo konačni rezultat</mat-option>
          <mat-option value="holes">Koš po koš</mat-option>
        </mat-select>
      </mat-form-field>

      @if (mode() === 'total') {
        <mat-form-field appearance="outline" class="strokes-field">
          <mat-label>Ukupno bacanja</mat-label>
          <input
            matInput
            type="number"
            inputmode="numeric"
            [min]="range().min"
            [max]="range().max"
            [placeholder]="'' + par()"
            [ngModel]="strokes()"
            (ngModelChange)="setTotal($event)"
            name="strokes"
          />
          <mat-hint>Par {{ par() }}</mat-hint>
        </mat-form-field>
      } @else {
        <div class="holes">
          @for (h of holes(); track h.number; let i = $index) {
            <label class="hole" [class]="scoreClass(h.strokes - h.par)">
              <span class="hn">{{ h.number }}<small> · par {{ h.par }}</small></span>
              <input
                type="number"
                min="1"
                max="20"
                inputmode="numeric"
                [ngModel]="h.strokes"
                (ngModelChange)="setStrokes(i, $event)"
                [name]="'h' + i"
                [attr.aria-label]="'Bacanja na košu ' + h.number"
              />
            </label>
          }
        </div>
      }
      @if (totals(); as t) {
        <p class="total">
          Ukupno {{ t.strokes }} ·
          <strong>{{ t.toPar | toPar }}</strong>
        </p>
      }
      @if (error()) {
        <p class="error-text">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Odustani</button>
      <button mat-flat-button (click)="save()" [disabled]="saving() || !valid()">Spremi</button>
    </mat-dialog-actions>
  `,
  styles: `
    .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; padding-top: 6px; }
    .player-field { grid-column: 1 / -1; }
    .warn { margin: 0 0 12px; color: var(--mat-sys-tertiary); }
    .who { margin-top: 0; }
    .mode-field, .strokes-field { width: 100%; }
    .strokes-field input { font: 700 24px / 1.2 var(--font-text); }
    .holes { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
    .hole {
      display: flex; flex-direction: column; padding: 8px; border-radius: var(--radius-sm);
      background: var(--score-bg, color-mix(in srgb, var(--mat-sys-surface-container-highest) 70%, transparent));
      color: var(--score-fg, inherit); transition: background-color 300ms, color 300ms;
    }
    .hn { font: var(--mat-sys-label-medium); }
    .hn small { opacity: 0.7; }
    .hole input {
      width: 100%; box-sizing: border-box; margin-top: 4px; padding: 4px;
      font: var(--mat-sys-title-medium); text-align: center;
      font-family: var(--font-text); font-weight: 700;
      border: 1px solid var(--rule-strong); border-radius: 3px;
      background: var(--mat-sys-surface); color: var(--mat-sys-on-surface);
    }
    .total { margin: 16px 0 0; font: var(--mat-sys-title-medium); }
    .total strong { font: 700 22px / 1 var(--font-text); }
  `,
})
export class RoundEditor {
  protected readonly data = inject<RoundEditorData>(MAT_DIALOG_DATA);
  protected readonly store = inject(DataStore);
  private readonly ref = inject(MatDialogRef<RoundEditor>);

  protected readonly isNew = !this.data.round;
  protected readonly name = fullName;
  protected readonly scoreClass = scoreClass;
  protected readonly weeks = Array.from({ length: this.data.league.totalWeeks }, (_, i) => i + 1);

  protected readonly playerId = signal(this.data.round?.playerId ?? this.data.playerId ?? '');
  protected readonly week = signal(this.data.round?.week ?? currentWeek(this.data.league, new Date()).week);
  protected readonly slot = signal<RoundType>(this.data.round?.type ?? 'first');
  /** New rounds start with just the final score: the quickest way to add one. */
  protected readonly mode = signal<'total' | 'holes'>(
    !this.data.round || isTotalOnly(this.data.round) ? 'total' : 'holes',
  );
  protected readonly holes = signal<HoleScore[]>(
    this.data.round && !isTotalOnly(this.data.round)
      ? this.data.round.holes.map((h) => ({ ...h }))
      : playableHoles(this.data.league, this.week()).map((h) => ({ ...h, strokes: h.par })),
  );
  /** Final score in 'total' mode; null = not typed yet. */
  protected readonly strokes = signal<number | null>(
    this.data.round && isTotalOnly(this.data.round) ? this.data.round.strokes : null,
  );
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Par of the round: as saved for an existing final-score round, otherwise that of the open holes. */
  protected readonly par = computed(() =>
    this.data.round && isTotalOnly(this.data.round) && this.mode() === 'total'
      ? this.data.round.par
      : this.holes().reduce((sum, h) => sum + h.par, 0),
  );
  protected readonly range = computed(() => totalRange(this.holes().length));

  protected readonly totals = computed(() => {
    if (this.mode() === 'holes') return scoreTotals(this.holes());
    const strokes = this.strokes();
    return strokes == null ? null : { strokes, par: this.par(), toPar: strokes - this.par() };
  });
  protected readonly attempt = computed<Attempt>(() => (this.slot() === 'repeat' ? 2 : 1));

  protected readonly existing = computed(() =>
    (this.store.viewedRounds() ?? []).find(
      (r) => r.playerId === this.playerId() && r.week === this.week() && r.attempt === this.attempt(),
    ),
  );

  protected readonly valid = computed(() => {
    if (!this.playerId() || !this.holes().length) return false;
    if (this.mode() === 'holes') {
      return this.holes().every(
        (h) => Number.isInteger(h.strokes) && h.strokes >= 1 && h.strokes <= MAX_STROKES_PER_HOLE,
      );
    }
    const strokes = this.strokes();
    const { min, max } = this.range();
    return strokes != null && Number.isInteger(strokes) && strokes >= min && strokes <= max;
  });

  protected setWeek(week: number): void {
    this.week.set(week);
    // Use that week's open holes, keeping scores already typed for the same holes.
    const typed = new Map(this.holes().map((h) => [h.number, h.strokes]));
    this.holes.set(
      playableHoles(this.data.league, week).map((h) => ({ ...h, strokes: typed.get(h.number) ?? h.par })),
    );
  }

  protected setSlot(slot: RoundType): void {
    this.slot.set(slot);
  }

  protected setMode(mode: 'total' | 'holes'): void {
    // Switching a hole-by-hole round to a final score keeps its total.
    if (mode === 'total' && this.strokes() == null && this.data.round && !isTotalOnly(this.data.round)) {
      this.strokes.set(this.data.round.strokes);
    }
    this.mode.set(mode);
  }

  protected setTotal(value: number | string | null): void {
    this.strokes.set(value === '' || value == null ? null : Number(value));
  }

  protected setStrokes(index: number, value: number | null): void {
    this.holes.update((list) => list.map((h, i) => (i === index ? { ...h, strokes: Number(value) } : h)));
  }

  protected async save(): Promise<void> {
    if (!this.valid()) return;
    const player = this.store.players().find((p) => p.id === this.playerId());
    const base = this.data.round;
    const holes = this.mode() === 'holes' ? this.holes() : [];
    const round: Round = {
      playerId: this.playerId(),
      playerName: player ? fullName(player) : (base?.playerName ?? ''),
      division: player?.division ?? base?.division ?? 'M',
      week: base?.week ?? this.week(),
      attempt: base?.attempt ?? this.attempt(),
      type: base?.type ?? this.slot(),
      holes,
      ...this.totals()!,
      cardId: base?.cardId ?? `admin-${newId()}`,
      scoredBy: base?.scoredBy ?? 'Admin',
      playedAt: base?.playedAt ?? Date.now(),
      editedAt: Date.now(),
    };
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.saveRound(this.data.league.id, round);
      this.ref.close(true);
    } catch (e) {
      this.error.set(describeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
