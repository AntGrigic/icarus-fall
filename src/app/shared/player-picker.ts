import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { fullName, matchesSearch, tidyName } from '../core/league-math';
import { Division, DIVISIONS, Player } from '../core/models';
import { DataStore } from '../data/data-store';
import { DivisionSwitch } from './division-switch';

const NEW_PLAYER = '__new__';

/**
 * "Find your name" box: pick an existing player, or add yourself if it's your first time.
 * Typing a name that already exists selects that player instead of creating a duplicate.
 */
@Component({
  selector: 'app-player-picker',
  imports: [
    FormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    DivisionSwitch,
  ],
  template: `
    @if (!creating()) {
      <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
        <mat-label>{{ label() }}</mat-label>
        <mat-icon matPrefix>person_search</mat-icon>
        <!-- Only what the user types goes into query; the box is cleared after a pick (displayWith). -->
        <input
          matInput
          [matAutocomplete]="auto"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          placeholder="Start typing your name"
          autocomplete="off"
        />
        <mat-autocomplete
          #auto="matAutocomplete"
          [displayWith]="blank"
          (optionSelected)="onSelected($event)"
        >
          @for (p of matches(); track p.id) {
            @let reason = unavailable()(p);
            <mat-option [value]="p.id" [disabled]="!!reason">
              <span class="opt-name">{{ name(p) }}</span>
              <span class="opt-meta">{{ divisionLabel(p.division) }}{{ reason ? ' · ' + reason : '' }}</span>
            </mat-option>
          }
          <mat-option [value]="newPlayer" class="new-option">
            <mat-icon>person_add</mat-icon>
            First time? Add {{ query().trim() ? '"' + query().trim() + '"' : 'a new player' }}
          </mat-option>
        </mat-autocomplete>
      </mat-form-field>
    } @else {
      <form class="new-player panel" (ngSubmit)="create()">
        <h3>New player</h3>
        <div class="fields">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>First name</mat-label>
            <input matInput name="firstName" [(ngModel)]="firstName" required autocomplete="given-name" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Last name</mat-label>
            <input matInput name="lastName" [(ngModel)]="lastName" required autocomplete="family-name" />
          </mat-form-field>
        </div>
        <app-division-switch [(value)]="division" />
        @if (existing(); as e) {
          <p class="muted hint">{{ name(e) }} is already registered and will be added.</p>
        }
        <div class="actions">
          <button mat-button type="button" (click)="cancel()">Cancel</button>
          <button mat-flat-button type="submit" [disabled]="!firstName().trim() || !lastName().trim()">
            Add player
          </button>
        </div>
      </form>
    }
  `,
  styles: `
    .opt-name {
      font-weight: 500;
    }
    .opt-meta {
      margin-left: 8px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .new-option mat-icon {
      color: var(--mat-sys-primary);
    }
    .new-player {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .hint {
      margin: 0;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class PlayerPicker {
  private readonly store = inject(DataStore);

  readonly label = input('Add player');
  /** Players already chosen; they are hidden from the list. */
  readonly exclude = input<string[]>([]);
  /** Returns why a player can't be picked (shown greyed out), or null. */
  readonly unavailable = input<(p: Player) => string | null>(() => null);
  readonly picked = output<Player>();

  protected readonly newPlayer = NEW_PLAYER;
  protected readonly name = fullName;
  protected readonly blank = () => '';
  protected readonly query = signal('');
  protected readonly creating = signal(false);
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly division = signal<Division>('M');

  protected readonly matches = computed(() => {
    const q = this.query();
    const excluded = new Set(this.exclude());
    return this.store
      .sortedPlayers()
      .filter((p) => !excluded.has(p.id) && (!q.trim() || matchesSearch(p, q)))
      .slice(0, 30);
  });

  protected readonly existing = computed(() =>
    this.firstName().trim() && this.lastName().trim()
      ? this.store.findPlayerByName(this.firstName(), this.lastName())
      : undefined,
  );

  protected divisionLabel(d: Division): string {
    return DIVISIONS.find((x) => x.id === d)?.label ?? d;
  }

  protected onSelected(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value as string;
    if (value === NEW_PLAYER) {
      const [first = '', ...rest] = tidyName(this.query()).split(' ');
      this.firstName.set(first);
      this.lastName.set(rest.join(' '));
      this.creating.set(true);
    } else {
      const player = this.store.players().find((p) => p.id === value);
      if (player) this.picked.emit(player);
    }
    this.query.set('');
  }

  protected async create(): Promise<void> {
    if (!this.firstName().trim() || !this.lastName().trim()) return;
    const player = await this.store.addPlayer({
      firstName: this.firstName(),
      lastName: this.lastName(),
      division: this.division(),
    });
    const reason = this.unavailable()(player);
    if (reason) {
      this.store.reportError(new Error(`${fullName(player)}: ${reason}`));
    } else if (!this.exclude().includes(player.id)) {
      this.picked.emit(player);
    }
    this.cancel();
  }

  protected cancel(): void {
    this.creating.set(false);
    this.firstName.set('');
    this.lastName.set('');
    this.division.set('M');
  }
}
