import { formatToPar, roundTypeLabel } from '../core/league-math';
import { Round } from '../core/models';
import { plural, roman, scoreClass } from '../shared/format';

/**
 * Draws a finished scorecard as a PNG for sharing (WhatsApp group): every player's name,
 * score and holes, in the app's Roman style. Drawn on a canvas in the browser, so it costs
 * nothing and works offline. Always the light look, whatever theme the phone uses.
 */

const WIDTH = 1080;
const PAD = 48;
const BLOCK_PAD = 28;
const CELL_HEIGHT = 84;
const CELL_GAP = 8;

const DISPLAY = "Cinzel, 'Times New Roman', serif";
const TEXT = "'Source Serif 4', Georgia, serif";

const INK = '#241c15';
const MUTED = '#665848';
const PURPLE = '#5e2650';
const GOLD = '#a8873f';
const GOLD_LIGHT = '#e2c27c';
const CREAM = '#f7e9c6';
const SKY = '#efe9df';
const PANEL = '#fbf8f3';
const RULE = 'rgba(122, 92, 40, 0.35)';
const UNDER = '#3b6a22';
const OVER = '#a02c1b';

/** Same colours as the scorecard in the app (light theme). */
const CELL_COLORS: Record<string, { bg: string; fg: string }> = {
  'score-eagle': { bg: '#f1dd9c', fg: '#5e4300' },
  'score-birdie': { bg: '#d9e7c6', fg: '#2f5419' },
  'score-par': { bg: '#ebe4d9', fg: INK },
  'score-bogey': { bg: '#f3dccb', fg: '#86411f' },
  'score-double': { bg: '#ecc0b6', fg: '#7d1b10' },
};

type Ctx = CanvasRenderingContext2D;

const HEADER_HEIGHT = 236;
const BAND_HEIGHT = 22;
const FOOTER_HEIGHT = 84;

export interface ScorecardImageInput {
  leagueName: string;
  /** Rounds from one card, with hole scores. */
  rounds: Round[];
}

/** Holes per row: one row up to `max` holes, otherwise rows as even as possible (18 → 9 + 9). */
export function holeRows(count: number, max = 9): number[] {
  const rows = Math.ceil(count / max);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

/** "Tjedan IV", or "Tjedni IV i V" when someone on the card played next week's round in advance. */
export function weeksLabel(weeks: number[]): string {
  const list = [...new Set(weeks)].sort((a, b) => a - b).map(roman);
  if (list.length === 1) return `Tjedan ${list[0]}`;
  return `Tjedni ${list.slice(0, -1).join(', ')} i ${list.at(-1)}`;
}

export async function scorecardImage(input: ScorecardImageInput): Promise<Blob> {
  await loadFonts();

  // Best score first, like a leaderboard.
  const rounds = [...input.rounds].sort(
    (a, b) => a.toPar - b.toPar || a.playerName.localeCompare(b.playerName),
  );
  const heights = rounds.map(blockHeight);
  const blocks = heights.reduce((sum, h) => sum + h, 0) + 20 * (rounds.length - 1);
  const height = HEADER_HEIGHT + BAND_HEIGHT + 32 + blocks + FOOTER_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Slika se ne može nacrtati na ovom uređaju.');

  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, WIDTH, height);
  drawHeader(ctx, input.leagueName, rounds);
  drawMeander(ctx, HEADER_HEIGHT);

  let y = HEADER_HEIGHT + BAND_HEIGHT + 32;
  rounds.forEach((round, i) => {
    drawPlayer(ctx, round, y, heights[i]);
    y += heights[i] + 20;
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = `600 26px ${DISPLAY}`;
  ctx.fillText('Jupiter shades', WIDTH / 2, height - 34);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Slika nije spremljena.'))),
      'image/png',
    ),
  );
}

async function loadFonts(): Promise<void> {
  // The fonts are already on the page; this only waits in case they are still downloading.
  // Offline without them the image falls back to the system serif.
  try {
    const fonts = [`600 54px ${DISPLAY}`, `700 40px ${TEXT}`, `400 26px ${TEXT}`];
    await Promise.all(fonts.map((font) => document.fonts.load(font)));
  } catch {
    // Fallback fonts are fine.
  }
}

function blockHeight(round: Round): number {
  const rows = holeRows(round.holes.length).length;
  const grid = rows ? rows * CELL_HEIGHT + (rows - 1) * CELL_GAP + 20 : 0;
  return BLOCK_PAD + 52 + 38 + grid + BLOCK_PAD;
}

function drawHeader(ctx: Ctx, leagueName: string, rounds: Round[]): void {
  ctx.fillStyle = PURPLE;
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, HEADER_HEIGHT - 4, WIDTH, 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD_LIGHT;
  fitFont(ctx, leagueName, 600, 54, DISPLAY, WIDTH - 2 * PAD);
  ctx.fillText(leagueName, WIDTH / 2, 96);

  ctx.fillStyle = CREAM;
  ctx.font = `700 36px ${DISPLAY}`;
  ctx.fillText(weeksLabel(rounds.map((r) => r.week)), WIDTH / 2, 154);

  const playedAt = Math.max(...rounds.map((r) => r.playedAt));
  ctx.font = `400 28px ${TEXT}`;
  ctx.globalAlpha = 0.85;
  const date = new Intl.DateTimeFormat('hr', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillText(date.format(playedAt), WIDTH / 2, 200);
  ctx.globalAlpha = 1;
}

/** One unit of the Greek key, on a 16 × 14 grid (the same path as --meander in styles.scss). */
const MEANDER = [
  [2, 13], [2, 1], [14, 1], [14, 9], [10, 9], [10, 5], [6, 5], [6, 13], [16, 13],
] as const;

/** The Greek key that runs under the app's header. */
function drawMeander(ctx: Ctx, top: number): void {
  const scale = BAND_HEIGHT / 14;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < WIDTH; x += 16 * scale) {
    const at = (dx: number, dy: number) => [x + dx * scale, top + 4 + dy * scale * 0.85] as const;
    ctx.moveTo(...at(0, 13));
    for (const [dx, dy] of MEANDER) ctx.lineTo(...at(dx, dy));
  }
  ctx.stroke();
}

function drawPlayer(ctx: Ctx, round: Round, top: number, height: number): void {
  const left = PAD;
  const width = WIDTH - 2 * PAD;
  roundedRect(ctx, left, top, width, height, 10);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.stroke();

  const inner = left + BLOCK_PAD;
  const right = left + width - BLOCK_PAD;
  const nameLine = top + BLOCK_PAD + 40;
  const metaLine = nameLine + 42;

  // Score on the right: relative to par, and the number of throws under it.
  ctx.textAlign = 'right';
  ctx.fillStyle = round.toPar < 0 ? UNDER : round.toPar > 0 ? OVER : INK;
  ctx.font = `700 60px ${TEXT}`;
  ctx.fillText(formatToPar(round.toPar), right, nameLine + 8);
  const scoreWidth = ctx.measureText(formatToPar(round.toPar)).width;
  ctx.fillStyle = MUTED;
  ctx.font = `400 26px ${TEXT}`;
  const throws = plural(round.strokes, 'bacanje', 'bacanja', 'bacanja');
  ctx.fillText(`${round.strokes} ${throws}`, right, metaLine);

  // Name and round on the left.
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  fitFont(ctx, round.playerName, 700, 40, TEXT, right - inner - Math.max(scoreWidth, 170) - 24);
  ctx.fillText(round.playerName, inner, nameLine);
  ctx.fillStyle = MUTED;
  ctx.font = `400 26px ${TEXT}`;
  ctx.fillText(roundTypeLabel(round.type), inner, metaLine);

  drawHoles(ctx, round, inner, metaLine + 28, right - inner);
}

function drawHoles(ctx: Ctx, round: Round, left: number, top: number, width: number): void {
  const rows = holeRows(round.holes.length);
  if (!rows.length) return;
  const columns = rows[0];
  const cellWidth = (width - (columns - 1) * CELL_GAP) / columns;
  let index = 0;
  rows.forEach((count, row) => {
    for (let col = 0; col < count; col++) {
      const hole = round.holes[index++];
      const x = left + col * (cellWidth + CELL_GAP);
      const y = top + row * (CELL_HEIGHT + CELL_GAP);
      const colors = CELL_COLORS[scoreClass(hole.strokes - hole.par)] ?? CELL_COLORS['score-par'];
      roundedRect(ctx, x, y, cellWidth, CELL_HEIGHT, 6);
      ctx.fillStyle = colors.bg;
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = colors.fg;
      ctx.globalAlpha = 0.7;
      ctx.font = `600 20px ${TEXT}`;
      ctx.fillText(String(hole.number), x + cellWidth / 2, y + 26);
      ctx.globalAlpha = 1;
      ctx.font = `700 36px ${TEXT}`;
      ctx.fillText(String(hole.strokes), x + cellWidth / 2, y + 68);
    }
  });
}

/** Sets the font, shrinking it until the text fits in `maxWidth`. */
function fitFont(ctx: Ctx, text: string, weight: number, size: number, family: string, maxWidth: number) {
  do {
    ctx.font = `${weight} ${size}px ${family}`;
  } while (ctx.measureText(text).width > maxWidth && --size > 18);
}

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
