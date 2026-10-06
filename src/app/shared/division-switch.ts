import { Component, computed, input, model } from '@angular/core';

import { Division, DIVISIONS } from '../core/models';

/** Muškarci / Žene switch: a framed track with a plaque that slides to the selected division. */
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
      border-radius: var(--radius-sm);
      background: var(--panel);
      border: 1px solid var(--rule-strong);
    }

    /* The inlaid plaque that slides to the chosen division. */
    :host::before {
      content: '';
      position: absolute;
      top: 4px;
      bottom: 4px;
      left: 4px;
      width: calc((100% - 8px) / var(--count));
      border-radius: 3px;
      background: var(--brand);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gold) 65%, transparent);
      transform: translateX(calc(var(--active) * 100%));
      transition: transform 350ms var(--ease-out);
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
      border-radius: 3px;
      background: transparent;
      color: var(--mat-sys-on-surface-variant);
      font: 600 16px / 1 var(--font-text);
      cursor: pointer;
      transition: color 200ms;
    }

    .option:hover:not(.active) {
      color: var(--mat-sys-on-surface);
    }

    .option.active {
      color: var(--on-brand);
    }

    .option:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }

    .count {
      min-width: 22px;
      box-sizing: border-box;
      padding: 2px 6px;
      border-radius: 3px;
      font: var(--mat-sys-label-small);
      font-weight: 600;
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
