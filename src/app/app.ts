import { Component, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';

import { CardService } from './play/card.service';
import { DataStore } from './data/data-store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly store = inject(DataStore);
  protected readonly cards = inject(CardService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly nav = [
    { path: '/standings', icon: 'leaderboard', label: 'Poredak' },
    { path: '/play', icon: 'edit_note', label: 'Igraj' },
    { path: '/admin', icon: 'admin_panel_settings', label: 'Admin' },
  ];

  constructor() {
    effect(() => {
      const error = this.store.lastError();
      if (error) this.snackBar.open(error.message, 'U redu', { duration: 8000 });
    });

    const updates = inject(SwUpdate);
    if (updates.isEnabled) {
      updates.versionUpdates.subscribe((event) => {
        if (event.type !== 'VERSION_READY') return;
        this.snackBar
          .open('Dostupna je nova verzija aplikacije.', 'Osvježi')
          .onAction()
          .subscribe(() => document.location.reload());
      });
    }
  }
}
