import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';

import { computeStandings, disabledHoles, parseYmd, weekRange } from '../../core/league-math';
import { Division } from '../../core/models';
import { DataStore } from '../../data/data-store';
import { DivisionSwitch } from '../../shared/division-switch';
import { formatDay, formatRange, plural, roman, ToParPipe, totalClass } from '../../shared/format';

const DIVISION_KEY = 'icarus-fall.division';

@Component({
  selector: 'app-standings',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    DivisionSwitch,
    ToParPipe,
  ],
  templateUrl: './standings.html',
  styleUrl: './standings.scss',
})
export class StandingsPage {
  protected readonly store = inject(DataStore);
  protected readonly totalClass = totalClass;
  protected readonly plural = plural;
  protected readonly roman = roman;

  protected readonly division = signal<Division>(readDivision());
  protected readonly league = this.store.viewedLeague;
  protected readonly isActiveLeague = computed(() => this.league()?.id === this.store.activeLeague()?.id);

  protected readonly standingsByDivision = computed(() => {
    const league = this.league();
    const rounds = this.store.viewedRounds();
    if (!league || !rounds) return null;
    const now = this.store.now();
    const players = this.store.players();
    return {
      M: computeStandings(league, rounds, players, 'M', now),
      W: computeStandings(league, rounds, players, 'W', now),
    };
  });

  protected readonly standings = computed(() => this.standingsByDivision()?.[this.division()] ?? null);

  protected readonly divisionCounts = computed(() => {
    const all = this.standingsByDivision();
    return { M: all?.M.rows.length ?? 0, W: all?.W.rows.length ?? 0 };
  });

  protected readonly weeks = computed(() =>
    Array.from({ length: this.league()?.totalWeeks ?? 0 }, (_, i) => i + 1),
  );

  /** One segment per week for the season progress strip. */
  protected readonly season = computed(() => {
    const info = this.standings()?.info;
    if (!info) return [];
    return this.weeks().map((week) => ({
      week,
      state:
        info.status === 'finished' || (info.status === 'running' && week < info.week)
          ? 'done'
          : info.status === 'running' && week === info.week
            ? 'now'
            : 'next',
    }));
  });

  protected readonly weekLabel = computed(() => {
    const league = this.league();
    const info = this.standings()?.info;
    if (!league || !info) return '';
    const range = formatRange(weekRange(league, info.week));
    const weeks = `${league.totalWeeks} ${plural(league.totalWeeks, 'tjedan', 'tjedna', 'tjedana')}`;
    switch (info.status) {
      case 'upcoming':
        return `Počinje ${formatDay(parseYmd(league.startDate))} · ${weeks}`;
      case 'finished':
        return `Završeno · ${weeks}`;
      default:
        return `Tjedan ${info.week} od ${league.totalWeeks} · ${range}`;
    }
  });

  protected readonly closedHoles = computed(() => {
    const league = this.league();
    const info = this.standings()?.info;
    return league && info?.status === 'running' ? disabledHoles(league, info.week) : [];
  });

  protected setDivision(division: Division): void {
    this.division.set(division);
    try {
      localStorage.setItem(DIVISION_KEY, division);
    } catch {
      // Not remembered; fine.
    }
  }
}

function readDivision(): Division {
  try {
    return localStorage.getItem(DIVISION_KEY) === 'W' ? 'W' : 'M';
  } catch {
    return 'M';
  }
}
