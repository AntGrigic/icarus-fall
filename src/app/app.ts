import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter, map } from 'rxjs';

import { CardService } from './play/card.service';
import { DataStore } from './data/data-store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly store = inject(DataStore);
  protected readonly cards = inject(CardService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly nav = [
    { path: '/standings', icon: 'leaderboard', label: 'Poredak' },
    { path: '/play', icon: 'edit_note', label: 'Igraj' },
    { path: '/admin', icon: 'admin_panel_settings', label: 'Admin' },
  ];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Which nav item the sliding highlight sits under. A player's page belongs to the standings. */
  protected readonly activeIndex = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    if (path.startsWith('/admin')) return 2;
    if (path === '/play' || path.startsWith('/play/')) return 1;
    return 0;
  });

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
