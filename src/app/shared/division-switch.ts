import { Component, computed, input, model } from '@angular/core';

import { Division, DIVISIONS } from '../core/models';

/** Muškarci / Žene switch: a pill track with a highlight that slides to the selected division. */
@Component({
  selector: 'app-division-switch',
  host: {
    role: 'radiogroup',
    'aria-label': 'Kategorija',
    '[style.--count]': 'divisions.length',
    '[style.--active]': 'activeIndex()',
  },
  template: `
    @for (d of divisions; track d.id) {
      <button
        type="button"
        role="radio"
        class="option"
        [class.active]="d.id === value()"
        [attr.aria-checked]="d.id === value()"
        (click)="value.set(d.id)"
      >
        {{ d.label }}
        @if (counts(); as c) {
          <span class="count">{{ c[d.id] }}</span>
        }
      </button>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      width: 100%;
      max-width: 360px;
      box-sizing: border-box;
      padding: 4px;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-high);
      border: 1px solid var(--mat-sys-outline-variant);
    }

    :host::before {
      content: '';
      position: absolute;
      top: 4px;
      bottom: 4px;
      left: 4px;
      width: calc((100% - 8px) / var(--count));
      border-radius: 999px;
      background: var(--mat-sys-primary);
      box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
      transform: translateX(calc(var(--active) * 100%));
      transition: transform 280ms cubic-bezier(0.2, 0, 0, 1);
    }

    .option {
      position: relative; /* above the highlight */
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 40px;
      padding: 0 16px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-large);
      cursor: pointer;
      transition: color 200ms;
    }

    .option:hover:not(.active) {
      color: var(--mat-sys-on-surface);
    }

    .option.active {
      color: var(--mat-sys-on-primary);
    }

    .option:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }

    .count {
      min-width: 22px;
      box-sizing: border-box;
      padding: 1px 7px;
      border-radius: 999px;
      font: var(--mat-sys-label-small);
      font-variant-numeric: tabular-nums;
      background: color-mix(in srgb, currentColor 16%, transparent);
    }

    @media (prefers-reduced-motion: reduce) {
      :host::before,
      .option {
        transition: none;
      }
    }
  `,
})
export class DivisionSwitch {
  readonly value = model<Division>('M');
  /** Optional number next to each division, e.g. how many players are in the standings. */
  readonly counts = input<Record<Division, number> | null>(null);

  protected readonly divisions = DIVISIONS;
  protected readonly activeIndex = computed(() => DIVISIONS.findIndex((d) => d.id === this.value()));
}
