import { TextFieldModule } from '@angular/cdk/text-field';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';

import { DEFAULT_RULES, parseRules } from '../../core/rules';
import { DataStore, describeError } from '../../data/data-store';

/** The league's rules of play. Admins can edit them right here. */
@Component({
  selector: 'app-rules',
  imports: [
    NgTemplateOutlet,
    FormsModule,
    TextFieldModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './rules.html',
  styleUrl: './rules.scss',
})
export class RulesPage {
  protected readonly store = inject(DataStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly league = this.store.viewedLeague;
  protected readonly text = computed(() => this.league()?.rules ?? DEFAULT_RULES);
  protected readonly blocks = computed(() => parseRules(this.text()));

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected draft = '';

  protected edit(): void {
    this.draft = this.text();
    this.error.set(null);
    this.editing.set(true);
  }

  protected async save(): Promise<void> {
    const league = this.league();
    if (!league) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.saveLeague({ ...league, rules: this.draft.trim() });
      this.editing.set(false);
      this.snackBar.open('Pravila su spremljena', undefined, { duration: 2500 });
    } catch (e) {
      this.error.set(describeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}
