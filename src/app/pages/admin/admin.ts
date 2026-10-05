import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';

import { League } from '../../core/models';
import { DataStore, describeError } from '../../data/data-store';
import { Confirm } from '../../shared/confirm';
import { LeagueSettings } from './league-settings';
import { PlayersAdmin } from './players-admin';
import { RoundsAdmin } from './rounds-admin';
import { WeeksSettings } from './weeks-settings';

@Component({
  selector: 'app-admin',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTabsModule,
    LeagueSettings,
    WeeksSettings,
    PlayersAdmin,
    RoundsAdmin,
  ],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class AdminPage {
  protected readonly store = inject(DataStore);
  private readonly confirm = inject(Confirm);
  private readonly snackBar = inject(MatSnackBar);

  /** The league being administered is the one shown on the standings page too. */
  protected readonly league = this.store.viewedLeague;
  protected readonly creating = signal(false);

  protected readonly signingIn = signal(false);
  protected readonly loginError = signal<string | null>(null);

  protected async signIn(): Promise<void> {
    this.signingIn.set(true);
    this.loginError.set(null);
    try {
      await this.store.signIn();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      // Closing the Google pop-up is not an error.
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        this.loginError.set(describeError(e));
      }
    } finally {
      this.signingIn.set(false);
    }
  }

  protected async copyUid(uid: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(uid);
      this.snackBar.open('UID copied', undefined, { duration: 2000 });
    } catch {
      this.snackBar.open('Could not copy. Select the UID and copy it by hand.', undefined, { duration: 4000 });
    }
  }

  protected onCreated(league: League): void {
    this.creating.set(false);
    this.store.viewedLeagueId.set(league.id);
  }

  protected async resetDemo(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Reset demo data?',
      message: 'All leagues, players and rounds in this browser are replaced with the sample league.',
      confirmText: 'Reset',
      danger: true,
    });
    if (ok) {
      await this.store.resetDemo();
      this.store.viewedLeagueId.set(null);
    }
  }
}
