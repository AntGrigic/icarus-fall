import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';

import { newId } from '../../core/ids';
import { currentWeek, toYmd, weekRange } from '../../core/league-math';
import { League, WeekSettings } from '../../core/models';
import { DataStore, describeError } from '../../data/data-store';
import { formatRange } from '../../shared/format';

interface Draft {
  id: string | null;
  name: string;
  startDate: string;
  totalWeeks: number;
  dropWorst: number;
  /** 0 = automatic (from dates). */
  override: number;
  pars: number[];
  weeks: Record<string, WeekSettings>;
  createdAt: number;
}

/** Create or edit a league: name, length, dates, scoring and the course layout. */
@Component({
  selector: 'app-league-settings',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './league-settings.html',
  styleUrl: './league-settings.scss',
})
export class LeagueSettings {
  protected readonly store = inject(DataStore);
  private readonly snackBar = inject(MatSnackBar);

  /** null = create a new league. */
  readonly league = input<League | null>(null);
  readonly saved = output<League>();
  readonly cancelled = output<void>();

  // Reset the form only when the league's content really changes, not on every live update.
  private readonly source = computed(() => JSON.stringify(this.league()));
  protected readonly draft = linkedSignal<string, Draft>({
    source: this.source,
    computation: (json) => this.toDraft(JSON.parse(json) as League | null),
  });

  protected readonly makeActive = signal(true);
  protected readonly saving = signal(false);
  protected readonly errors = signal<string[]>([]);
  protected readonly isNew = computed(() => !this.league());
  protected readonly isActive = computed(() => this.league()?.id === this.store.activeLeague()?.id);
  protected readonly parOptions = [2, 3, 4, 5, 6];

  protected weekNumbers(d: Draft): number[] {
    return Array.from({ length: Math.max(0, d.totalWeeks || 0) }, (_, i) => i + 1);
  }

  protected autoWeekText(d: Draft): string {
    if (!d.startDate || !d.totalWeeks) return '';
    const info = currentWeek(this.fromDraft({ ...d, override: 0 }), this.store.now());
    if (info.status === 'upcoming') return 'not started yet';
    if (info.status === 'finished') return 'finished';
    return `week ${info.week}`;
  }

  protected lastWeekText(d: Draft): string {
    if (!d.startDate || !d.totalWeeks) return '';
    return formatRange(weekRange(this.fromDraft(d), d.totalWeeks));
  }

  protected setHoleCount(d: Draft, count: number): void {
    const n = Math.max(1, Math.min(36, Math.floor(Number(count) || 0)));
    d.pars = Array.from({ length: n }, (_, i) => d.pars[i] ?? 3);
  }

  protected setPar(d: Draft, index: number, par: number): void {
    d.pars = d.pars.map((p, i) => (i === index ? par : p));
  }

  protected totalPar(d: Draft): number {
    return d.pars.reduce((s, p) => s + p, 0);
  }

  protected async save(): Promise<void> {
    const d = this.draft();
    const errors = this.validate(d);
    this.errors.set(errors);
    if (errors.length) return;

    this.saving.set(true);
    try {
      const league = this.fromDraft(d);
      await this.store.saveLeague(league);
      if (this.isNew() && (this.makeActive() || !this.store.activeLeague())) {
        await this.store.setActiveLeague(league.id);
      }
      this.snackBar.open(this.isNew() ? 'League created' : 'League saved', undefined, { duration: 2500 });
      this.saved.emit(league);
    } catch (e) {
      this.errors.set([describeError(e)]);
    } finally {
      this.saving.set(false);
    }
  }

  protected async activate(): Promise<void> {
    const league = this.league();
    if (!league) return;
    try {
      await this.store.setActiveLeague(league.id);
      this.snackBar.open(`${league.name} is now the active league`, undefined, { duration: 2500 });
    } catch (e) {
      this.store.reportError(e);
    }
  }

  private validate(d: Draft): string[] {
    const errors: string[] = [];
    if (!d.name.trim()) errors.push('Give the league a name.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate)) errors.push('Pick the start date.');
    if (!Number.isInteger(d.totalWeeks) || d.totalWeeks < 1 || d.totalWeeks > 52) {
      errors.push('Number of weeks must be between 1 and 52.');
    }
    if (!Number.isInteger(d.dropWorst) || d.dropWorst < 0 || d.dropWorst >= d.totalWeeks) {
      errors.push('Dropped weeks must be at least 0 and less than the number of weeks.');
    }
    if (!d.pars.length) errors.push('The course needs at least one hole.');
    return errors;
  }

  private toDraft(league: League | null): Draft {
    if (league) {
      return {
        id: league.id,
        name: league.name,
        startDate: league.startDate,
        totalWeeks: league.totalWeeks,
        dropWorst: league.dropWorst,
        override: league.currentWeekOverride ?? 0,
        pars: league.holes.map((h) => h.par),
        weeks: league.weeks,
        createdAt: league.createdAt,
      };
    }
    // New league: reuse the course from the current league, it is usually the same.
    const template = this.store.activeLeague();
    return {
      id: null,
      name: `League ${new Date().getFullYear()}`,
      startDate: toYmd(new Date()),
      totalWeeks: template?.totalWeeks ?? 8,
      dropWorst: template?.dropWorst ?? 0,
      override: 0,
      pars: template?.holes.map((h) => h.par) ?? Array.from({ length: 18 }, () => 3),
      weeks: {},
      createdAt: Date.now(),
    };
  }

  private fromDraft(d: Draft): League {
    const holeCount = d.pars.length;
    // Drop settings for weeks or holes that no longer exist.
    const weeks: Record<string, WeekSettings> = {};
    for (const [week, settings] of Object.entries(d.weeks)) {
      if (Number(week) > d.totalWeeks) continue;
      const disabledHoles = (settings.disabledHoles ?? []).filter((n) => n <= holeCount);
      if (disabledHoles.length) weeks[week] = { ...settings, disabledHoles };
    }
    return {
      id: d.id ?? newId(),
      name: d.name.trim(),
      startDate: d.startDate,
      totalWeeks: d.totalWeeks,
      holes: d.pars.map((par, i) => ({ number: i + 1, par })),
      dropWorst: d.dropWorst,
      currentWeekOverride: d.override ? Math.min(d.override, d.totalWeeks) : null,
      weeks,
      createdAt: d.createdAt,
    };
  }
}
