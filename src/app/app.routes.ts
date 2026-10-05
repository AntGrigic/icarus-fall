import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'standings' },
  {
    path: 'standings',
    title: 'Standings',
    loadComponent: () => import('./pages/standings/standings').then((m) => m.StandingsPage),
  },
  {
    path: 'player/:id',
    title: 'Player',
    loadComponent: () => import('./pages/player/player').then((m) => m.PlayerPage),
  },
  {
    path: 'play',
    title: 'Play',
    loadComponent: () => import('./pages/play/play').then((m) => m.PlayPage),
  },
  {
    path: 'play/card',
    title: 'Scorecard',
    loadComponent: () => import('./pages/scorecard/scorecard').then((m) => m.ScorecardPage),
  },
  {
    path: 'admin',
    title: 'Admin',
    loadComponent: () => import('./pages/admin/admin').then((m) => m.AdminPage),
  },
  { path: '**', redirectTo: 'standings' },
];
