import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { newId } from '../../core/ids';
import { currentWeek, fullName, playableHoles, scoreTotals } from '../../core/league-math';
import { Attempt, HoleScore, League, Round, RoundType } from '../../core/models';
import { DataStore, describeError } from '../../data/data-store';
import { scoreClass, ToParPipe } from '../../shared/format';

export interface RoundEditorData {
  league: League;
  /** null = add a round (e.g. from a paper scorecard). */
  round: Round | null;
}

/** Admin dialog to fix hole scores of a round, or to add a round by hand. */
@Component({
  selector: 'app-round-editor',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatSelectModule, ToParPipe],
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
      <p class="total">
        Ukupno {{ totals().strokes }} ·
        <strong>{{ totals().toPar | toPar }}</strong>
      </p>
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
    .holes { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
    .hole {
      display: flex; flex-direction: column; padding: 8px; border-radius: 14px;
      background: var(--score-bg, color-mix(in srgb, var(--mat-sys-surface-container-highest) 70%, transparent));
      color: var(--score-fg, inherit); transition: background-color 300ms, color 300ms;
    }
    .hn { font: var(--mat-sys-label-medium); }
    .hn small { opacity: 0.7; }
    .hole input {
      width: 100%; box-sizing: border-box; margin-top: 4px; padding: 4px;
      font: var(--mat-sys-title-medium); text-align: center;
      font-family: 'Space Grotesk', sans-serif; font-weight: 700;
      border: 1px solid var(--glass-border-strong); border-radius: 10px;
      background: var(--mat-sys-surface); color: var(--mat-sys-on-surface);
    }
    .total { margin: 16px 0 0; font: var(--mat-sys-title-medium); }
    .total strong { font: 700 20px / 1 'Space Grotesk', sans-serif; }
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

  protected readonly playerId = signal(this.data.round?.playerId ?? '');
  protected readonly week = signal(this.data.round?.week ?? currentWeek(this.data.league, new Date()).week);
  protected readonly slot = signal<RoundType>(this.data.round?.type ?? 'first');
  protected readonly holes = signal<HoleScore[]>(
    this.data.round
      ? this.data.round.holes.map((h) => ({ ...h }))
      : playableHoles(this.data.league, this.week()).map((h) => ({ ...h, strokes: h.par })),
  );
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly totals = computed(() => scoreTotals(this.holes()));
  protected readonly attempt = computed<Attempt>(() => (this.slot() === 'repeat' ? 2 : 1));

  protected readonly existing = computed(() =>
    (this.store.viewedRounds() ?? []).find(
      (r) => r.playerId === this.playerId() && r.week === this.week() && r.attempt === this.attempt(),
    ),
  );

  protected readonly valid = computed(
    () =>
      !!this.playerId() &&
      this.holes().length > 0 &&
      this.holes().every((h) => Number.isInteger(h.strokes) && h.strokes >= 1 && h.strokes <= 20),
  );

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

  protected setStrokes(index: number, value: number | null): void {
    this.holes.update((list) => list.map((h, i) => (i === index ? { ...h, strokes: Number(value) } : h)));
  }

  protected async save(): Promise<void> {
    if (!this.valid()) return;
    const player = this.store.players().find((p) => p.id === this.playerId());
    const base = this.data.round;
    const holes = this.holes();
    const round: Round = {
      playerId: this.playerId(),
      playerName: player ? fullName(player) : (base?.playerName ?? ''),
      division: player?.division ?? base?.division ?? 'M',
      week: base?.week ?? this.week(),
      attempt: base?.attempt ?? this.attempt(),
      type: base?.type ?? this.slot(),
      holes,
      ...scoreTotals(holes),
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
