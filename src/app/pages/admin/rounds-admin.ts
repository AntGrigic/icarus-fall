import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';

import { fullName, normalizeText, roundTypeLabel } from '../../core/league-math';
import { League, Round } from '../../core/models';
import { DataStore } from '../../data/data-store';
import { Confirm } from '../../shared/confirm';
import { formatDay, ToParPipe, totalClass } from '../../shared/format';
import { RoundEditor, RoundEditorData } from './round-editor';

@Component({
  selector: 'app-rounds-admin',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, ToParPipe],
  template: `
    <div class="rounds">
      <div class="bar">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="week">
          <mat-label>Week</mat-label>
          <mat-select [ngModel]="week()" (ngModelChange)="week.set($event)">
            <mat-option [value]="0">All weeks</mat-option>
            @for (w of weeks(); track w) {
              <mat-option [value]="w">Week {{ w }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
          <mat-icon matPrefix>search</mat-icon>
          <mat-label>Player</mat-label>
          <input matInput [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </mat-form-field>
        <button mat-flat-button (click)="open(null)">
          <mat-icon>add</mat-icon>
          Add round
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Wk</th>
              <th class="left">Player</th>
              <th class="left">Round</th>
              <th>Score</th>
              <th>Strokes</th>
              <th>Played</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rounds(); track r.playerId + r.week + r.attempt) {
              <tr [class.replaced]="isReplaced(r)">
                <td>{{ r.week }}</td>
                <td class="left">{{ nameOf(r) }}</td>
                <td class="left">
                  {{ typeLabel(r.type) }}
                  @if (isReplaced(r)) {
                    <span class="chip">replaced</span>
                  }
                  @if (r.editedAt) {
                    <span class="chip">edited</span>
                  }
                </td>
                <td [class]="totalClass(r.toPar)">{{ r.toPar | toPar }}</td>
                <td>{{ r.strokes }}</td>
                <td class="muted">{{ day(r.playedAt) }}</td>
                <td class="actions">
                  <button mat-icon-button (click)="open(r)" aria-label="Edit round"><mat-icon>edit</mat-icon></button>
                  <button mat-icon-button (click)="remove(r)" aria-label="Delete round"><mat-icon>delete</mat-icon></button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="muted empty">No rounds.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: `
    .rounds { padding-top: 16px; display: flex; flex-direction: column; gap: 12px; }
    .bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .week { width: 150px; }
    .search { flex: 1; min-width: 180px; }
    .table-wrap { overflow-x: auto; border: 1px solid var(--mat-sys-outline-variant); border-radius: var(--radius); }
    table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    th, td { padding: 6px 8px; text-align: center; white-space: nowrap; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    th { font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface-variant); background: var(--mat-sys-surface-container); padding: 10px 8px; }
    tbody tr:last-child td { border-bottom: 0; }
    .left { text-align: left; }
    .actions { text-align: right; }
    .replaced td { opacity: 0.55; }
    .chip { margin-left: 4px; }
    .empty { padding: 24px; }
  `,
})
export class RoundsAdmin {
  private readonly store = inject(DataStore);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(Confirm);
  private readonly snackBar = inject(MatSnackBar);

  readonly league = input.required<League>();

  protected readonly week = signal(0);
  protected readonly query = signal('');
  protected readonly typeLabel = roundTypeLabel;
  protected readonly totalClass = totalClass;
  protected readonly day = formatDay;

  protected readonly weeks = computed(() => Array.from({ length: this.league().totalWeeks }, (_, i) => i + 1));

  private readonly all = computed(() => this.store.viewedRounds() ?? []);

  protected readonly rounds = computed(() => {
    const week = this.week();
    const q = normalizeText(this.query());
    return this.all()
      .filter((r) => (!week || r.week === week) && (!q || normalizeText(this.nameOf(r)).includes(q)))
      .sort((a, b) => b.week - a.week || this.nameOf(a).localeCompare(this.nameOf(b)) || a.attempt - b.attempt);
  });

  /** Current name from the player list; the name saved on the round if the player was deleted. */
  protected nameOf(r: Round): string {
    const p = this.store.players().find((x) => x.id === r.playerId);
    return p ? fullName(p) : r.playerName;
  }

  protected isReplaced(r: Round): boolean {
    return r.attempt === 1 && this.all().some((x) => x.playerId === r.playerId && x.week === r.week && x.attempt === 2);
  }

  protected open(round: Round | null): void {
    this.dialog.open<RoundEditor, RoundEditorData>(RoundEditor, {
      data: { league: this.league(), round },
      width: '640px',
      maxWidth: '96vw',
    });
  }

  protected async remove(r: Round): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete round?',
      message: `${this.nameOf(r)}, week ${r.week} (${this.typeLabel(r.type).toLowerCase()}, ${r.strokes} strokes).`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.store.deleteRound(this.league().id, r);
      this.snackBar.open('Round deleted', undefined, { duration: 2000 });
    } catch (e) {
      this.store.reportError(e);
    }
  }
}
