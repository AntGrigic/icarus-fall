import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';

import { fullName, matchesSearch } from '../../core/league-math';
import { Division, League, Player } from '../../core/models';
import { DataStore, describeError } from '../../data/data-store';
import { Confirm } from '../../shared/confirm';
import { DivisionSwitch } from '../../shared/division-switch';
import { plural } from '../../shared/format';

interface PlayerForm {
  firstName: string;
  lastName: string;
  division: Division;
}

@Component({
  selector: 'app-players-admin',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    DivisionSwitch,
  ],
  template: `
    <div class="players">
      <div class="bar">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="search">
          <mat-icon matPrefix>search</mat-icon>
          <mat-label>Traži igrače</mat-label>
          <input matInput [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </mat-form-field>
        <button mat-flat-button (click)="startAdd()">
          <mat-icon>person_add</mat-icon>
          Dodaj igrača
        </button>
      </div>

      @if (editingId() !== null) {
        <form class="panel edit" (ngSubmit)="save()">
          <h3>{{ editingId() ? 'Uredi igrača' : 'Novi igrač' }}</h3>
          <div class="fields">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Ime</mat-label>
              <input matInput name="first" [(ngModel)]="form.firstName" required />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Prezime</mat-label>
              <input matInput name="last" [(ngModel)]="form.lastName" required />
            </mat-form-field>
            <app-division-switch [(value)]="form.division" />
          </div>
          @if (formError()) {
            <p class="error-text">{{ formError() }}</p>
          }
          <div class="actions">
            <button mat-button type="button" (click)="editingId.set(null)">Odustani</button>
            <button mat-flat-button type="submit">Spremi</button>
          </div>
        </form>
      }

      <p class="muted count">
        {{ filtered().length }} {{ plural(filtered().length, 'igrač', 'igrača', 'igrača') }} · broj rundi u ligi {{ league().name }}
      </p>

      <ul class="list panel">
        @for (p of filtered(); track p.id) {
          <li>
            <div class="who">
              <span class="pname">{{ name(p) }}</span>
              <span class="muted meta">
                @let rounds = roundCounts().get(p.id) ?? 0;
                {{ p.division === 'W' ? 'Žene' : 'Muškarci' }} · {{ rounds }} {{ plural(rounds, 'runda', 'runde', 'rundi') }}
              </span>
            </div>
            <button mat-icon-button (click)="startEdit(p)" [attr.aria-label]="'Uredi ' + name(p)">
              <mat-icon>edit</mat-icon>
            </button>
            <button mat-icon-button (click)="remove(p)" [attr.aria-label]="'Obriši ' + name(p)">
              <mat-icon>delete</mat-icon>
            </button>
          </li>
        } @empty {
          <li class="muted">Nema pronađenih igrača.</li>
        }
      </ul>
    </div>
  `,
  styles: `
    .players { padding-top: 16px; display: flex; flex-direction: column; gap: 12px; }
    .bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .search { flex: 1; min-width: 220px; }
    .edit { display: flex; flex-direction: column; gap: 12px; }
    .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: center; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    .count { margin: 0; font: var(--mat-sys-body-small); }
    .list { list-style: none; margin: 0; padding: 4px 8px 4px 16px; }
    .list li { display: flex; align-items: center; gap: 4px; padding: 6px 0; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    .list li:last-child { border-bottom: 0; }
    .who { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .pname { font-weight: 500; }
    .meta { font: var(--mat-sys-body-small); }
  `,
})
export class PlayersAdmin {
  private readonly store = inject(DataStore);
  private readonly confirm = inject(Confirm);
  private readonly snackBar = inject(MatSnackBar);

  readonly league = input.required<League>();

  protected readonly name = fullName;
  protected readonly plural = plural;
  protected readonly query = signal('');
  /** null = form closed, '' = adding, otherwise the id being edited. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected form: PlayerForm = { firstName: '', lastName: '', division: 'M' };

  protected readonly filtered = computed(() => {
    const q = this.query().trim();
    return this.store.sortedPlayers().filter((p) => !q || matchesSearch(p, q));
  });

  protected readonly roundCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const r of this.store.viewedRounds() ?? []) counts.set(r.playerId, (counts.get(r.playerId) ?? 0) + 1);
    return counts;
  });

  protected startAdd(): void {
    this.form = { firstName: '', lastName: '', division: 'M' };
    this.formError.set(null);
    this.editingId.set('');
  }

  protected startEdit(p: Player): void {
    this.form = { firstName: p.firstName, lastName: p.lastName, division: p.division };
    this.formError.set(null);
    this.editingId.set(p.id);
  }

  protected async save(): Promise<void> {
    const { firstName, lastName, division } = this.form;
    if (!firstName.trim() || !lastName.trim()) {
      this.formError.set('Ime i prezime su obavezni.');
      return;
    }
    const id = this.editingId();
    const duplicate = this.store.findPlayerByName(firstName, lastName);
    if (duplicate && duplicate.id !== id) {
      this.formError.set(`${fullName(duplicate)} već postoji.`);
      return;
    }
    try {
      if (id) {
        const existing = this.store.players().find((p) => p.id === id)!;
        await this.store.updatePlayer({ ...existing, firstName, lastName, division });
      } else {
        await this.store.addPlayer({ firstName, lastName, division });
      }
      this.editingId.set(null);
      this.snackBar.open('Igrač je spremljen', undefined, { duration: 2000 });
    } catch (e) {
      this.formError.set(describeError(e));
    }
  }

  protected async remove(p: Player): Promise<void> {
    const count = this.roundCounts().get(p.id) ?? 0;
    const ok = await this.confirm.ask({
      title: `Obrisati igrača ${fullName(p)}?`,
      message:
        (count
          ? `Obrisat će se i ${count} ${plural(count, 'runda', 'runde', 'rundi')} ovog igrača u ligi ${this.league().name}. `
          : '') + 'Runde u drugim ligama zadržavaju ime igrača.',
      confirmText: 'Obriši',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.store.deletePlayer(p, this.league());
      this.snackBar.open(`Obrisano: ${fullName(p)}`, undefined, { duration: 2500 });
    } catch (e) {
      this.store.reportError(e);
    }
  }
}
