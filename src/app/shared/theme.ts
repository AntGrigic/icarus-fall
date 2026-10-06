import { computed, DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';

/** 'auto' follows the phone's own light/dark setting. */
export type ThemeMode = 'auto' | 'light' | 'dark';

/** Read before the first paint by the inline script in index.html; keep the two in sync. */
const THEME_KEY = 'icarus-fall.theme';

/** Browser bar colours: the page background (--sky in styles.scss). */
const BAR_COLORS = { light: '#efe9df', dark: '#161214' };

/**
 * Light or dark look, picked in the header and remembered on this device.
 * All colours are light-dark() pairs, so switching is just the root element's color-scheme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly systemDark = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemIsDark = signal(this.systemDark?.matches ?? false);

  readonly mode = signal<ThemeMode>(readMode());

  /** The scheme actually on screen. */
  readonly scheme = computed(() => {
    const mode = this.mode();
    return mode === 'auto' ? (this.systemIsDark() ? 'dark' : 'light') : mode;
  });

  constructor() {
    this.systemDark?.addEventListener('change', (e) => this.systemIsDark.set(e.matches));
    effect(() => this.apply(this.mode()));
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    try {
      if (mode === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Not remembered; fine.
    }
  }

  private apply(mode: ThemeMode): void {
    const root = this.document.documentElement;
    // Swap without transitions: Chrome can leave a transitioning element on the old scheme's colour.
    root.classList.add('theme-switching');
    root.style.colorScheme = mode === 'auto' ? '' : mode;
    for (const meta of this.document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      const metaScheme = meta.media.includes('dark') ? 'dark' : 'light';
      meta.content = BAR_COLORS[mode === 'auto' ? metaScheme : mode];
    }
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  }
}

function readMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}
