import { Component, computed, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';

import { currentWeek, disabledHoles, weekRange } from '../../core/league-math';
import { League } from '../../core/models';
import { DataStore } from '../../data/data-store';
import { formatRange } from '../../shared/format';

/** Close holes for single weeks (e.g. holes 9 and 10 when it's too slippery). */
@Component({
  selector: 'app-weeks-settings',
  imports: [MatIconModule],
  template: `
    <div class="weeks">
      <p class="muted help">
        Dodirni koš da ga zatvoriš za taj tjedan. Zatvoreni koševi neće biti na scorecardu za runde
        započete tog tjedna. Već spremljene runde se ne mijenjaju, a poredak uspoređuje rezultate s parom,
        pa je i kraća runda poštena.
      </p>
      @for (w of weeks(); track w.week) {
        <section class="panel week" [class.current]="w.week === current().week && current().status === 'running'">
          <div class="week-head">
            <strong>Tjedan {{ w.week }}</strong>
            <span class="muted">{{ w.range }}</span>
            @if (w.week === current().week && current().status === 'running') {
              <span class="chip">Ovaj tjedan</span>
            }
            <span class="spacer"></span>
            @if (w.closed.length) {
              <span class="closed-text">Zatvoreni: {{ w.closed.join(', ') }}</span>
            } @else {
              <span class="muted">Svi koševi su otvoreni</span>
            }
          </div>
          <div class="holes">
            @for (h of league().holes; track h.number) {
              @let closed = w.closed.includes(h.number);
              <button
                type="button"
                class="hole"
                [class.closed]="closed"
                [disabled]="busy()"
                (click)="toggle(w.week, h.number)"
                [attr.aria-pressed]="closed"
                [attr.aria-label]="'Koš ' + h.number + (closed ? ' zatvoren' : ' otvoren')"
              >
                @if (closed) {
                  <mat-icon>block</mat-icon>
                }
                {{ h.number }}
              </button>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .weeks { display: flex; flex-direction: column; gap: 10px; padding-top: 16px; }
    .help { margin: 0 0 6px; font: var(--mat-sys-body-small); }
    .week.current { border-color: var(--mat-sys-primary); box-shadow: inset 0 0 0 1px var(--mat-sys-primary); }
    .week-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .spacer { flex: 1; }
    .closed-text { color: var(--mat-sys-error); font: var(--mat-sys-label-large); }
    .holes { display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 6px; }
    .hole {
      display: flex; align-items: center; justify-content: center; gap: 2px;
      height: 38px; border-radius: 10px; cursor: pointer; font: var(--mat-sys-label-large);
      border: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface); color: var(--mat-sys-on-surface);
    }
    .hole.closed {
      background: var(--mat-sys-error-container); color: var(--mat-sys-on-error-container);
      border-color: transparent; text-decoration: line-through;
    }
    .hole mat-icon { font-size: 14px; width: 14px; height: 14px; }
  `,
})
export class WeeksSettings {
  private readonly store = inject(DataStore);
  private readonly snackBar = inject(MatSnackBar);

  readonly league = input.required<League>();
  protected readonly busy = signal(false);

  protected readonly current = computed(() => currentWeek(this.league(), this.store.now()));

  protected readonly weeks = computed(() => {
    const league = this.league();
    return Array.from({ length: league.totalWeeks }, (_, i) => {
      const week = i + 1;
      return { week, range: formatRange(weekRange(league, week)), closed: disabledHoles(league, week) };
    });
  });

  protected async toggle(week: number, hole: number): Promise<void> {
    const league = this.league();
    const closed = new Set(disabledHoles(league, week));
    if (closed.has(hole)) closed.delete(hole);
    else closed.add(hole);
    if (closed.size >= league.holes.length) {
      this.snackBar.open('Barem jedan koš mora ostati otvoren.', undefined, { duration: 3000 });
      return;
    }

    const weeks = { ...league.weeks };
    if (closed.size) weeks[week] = { ...weeks[week], disabledHoles: [...closed].sort((a, b) => a - b) };
    else delete weeks[week];

    this.busy.set(true);
    try {
      await this.store.saveLeague({ ...league, weeks });
    } catch (e) {
      this.store.reportError(e);
    } finally {
      this.busy.set(false);
    }
  }
}
