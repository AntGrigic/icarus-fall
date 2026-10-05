import { effect, Injectable, signal } from '@angular/core';

import { RoundOption, scoreTotals } from '../core/league-math';
import { Division, Hole, Round } from '../core/models';

export interface CardPlayer {
  playerId: string;
  name: string;
  division: Division;
  option: RoundOption;
}

/** A round in progress. Lives only on the scorekeeper's phone until it is submitted. */
export interface Card {
  id: string;
  leagueId: string;
  createdAt: number;
  holes: Hole[];
  players: CardPlayer[];
  /** playerId → strokes per hole (same order as `holes`); null = not entered yet. */
  scores: Record<string, (number | null)[]>;
  holeIndex: number;
}

const CARD_KEY = 'icarus-fall.card';

@Injectable({ providedIn: 'root' })
export class CardService {
  readonly card = signal<Card | null>(load());

  constructor() {
    // Survives refreshes, a closed tab or a dead battery half-way through the round.
    effect(() => {
      const card = this.card();
      try {
        if (card) localStorage.setItem(CARD_KEY, JSON.stringify(card));
        else localStorage.removeItem(CARD_KEY);
      } catch {
        // Storage blocked: the card still works until the page is closed.
      }
    });
  }

  start(card: Card): void {
    this.card.set(card);
  }

  discard(): void {
    this.card.set(null);
  }

  goToHole(index: number): void {
    this.patch((c) => ({ ...c, holeIndex: Math.max(0, Math.min(c.holes.length - 1, index)) }));
  }

  setScore(playerId: string, holeIndex: number, strokes: number | null): void {
    this.patch((c) => {
      const row = [...(c.scores[playerId] ?? [])];
      row[holeIndex] = strokes;
      return { ...c, scores: { ...c.scores, [playerId]: row } };
    });
  }

  /** Marks untouched scores on a hole as par (like UDisc does when you move on). */
  fillPar(holeIndex: number): void {
    const card = this.card();
    if (!card) return;
    for (const p of card.players) {
      if (card.scores[p.playerId]?.[holeIndex] == null) this.setScore(p.playerId, holeIndex, card.holes[holeIndex].par);
    }
  }

  setOption(playerId: string, option: RoundOption): void {
    this.patch((c) => ({
      ...c,
      players: c.players.map((p) => (p.playerId === playerId ? { ...p, option } : p)),
    }));
  }

  removePlayer(playerId: string): void {
    this.patch((c) => ({ ...c, players: c.players.filter((p) => p.playerId !== playerId) }));
  }

  buildRounds(card: Card): Round[] {
    const scoredBy = card.players[0]?.name ?? '';
    const playedAt = Date.now();
    return card.players.map((p) => {
      const holes = card.holes.map((h, i) => ({ ...h, strokes: card.scores[p.playerId][i]! }));
      return {
        playerId: p.playerId,
        playerName: p.name,
        division: p.division,
        week: p.option.week,
        attempt: p.option.attempt,
        type: p.option.type,
        holes,
        ...scoreTotals(holes),
        cardId: card.id,
        scoredBy,
        playedAt,
      };
    });
  }

  private patch(fn: (card: Card) => Card): void {
    this.card.update((c) => (c ? fn(c) : c));
  }
}

function load(): Card | null {
  try {
    const raw = localStorage.getItem(CARD_KEY);
    return raw ? (JSON.parse(raw) as Card) : null;
  } catch {
    return null;
  }
}
