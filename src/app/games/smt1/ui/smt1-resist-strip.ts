import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { Affinity, ElementId } from '../model';
import { ELEMENT_ORDER } from '../model/ids';
import { affinityCell, ELEMENT_LABEL } from './smt1-format';

/**
 * The fourteen resistances as one ruled strip. Weak prints solid black; null,
 * repel and drain print in the spot colour; resist prints the share of damage
 * taken. Every cell also carries a spoken label, so colour is never the only
 * signal. Styled by the Guidebook skin (`.g1-aff`).
 */
@Component({
  selector: 'app-smt1-resist-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g1-aff" [class.g1-aff--row]="!withHead()" role="list" [attr.aria-label]="label()">
      @for (c of cells(); track c.id) {
        <span role="listitem" [attr.aria-label]="c.name + ': ' + c.cell.say">
          @if (withHead()) { <span class="h" aria-hidden="true">{{ c.abbrev }}</span> }
          <span [class]="'v ' + c.cell.kind" aria-hidden="true" [attr.title]="c.name + ': ' + c.cell.say">{{ c.cell.text }}</span>
        </span>
      }
    </div>
  `,
})
export class Smt1ResistStrip {
  readonly affinities = input.required<Readonly<Record<ElementId, Affinity>>>();
  readonly withHead = input(true);
  readonly label = input('Resistances');

  protected readonly cells = computed(() =>
    ELEMENT_ORDER.map((id) => ({ id, ...ELEMENT_LABEL[id], cell: affinityCell(this.affinities()[id]) })),
  );
}

/** The strip's column heads alone, for a table header. */
@Component({
  selector: 'app-smt1-resist-head',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g1-aff g1-aff--row g1-aff--head" aria-hidden="true">
      @for (id of order; track id) { <span><span class="h" [attr.title]="label[id].name">{{ label[id].abbrev }}</span></span> }
    </div>
  `,
})
export class Smt1ResistHead {
  protected readonly order = ELEMENT_ORDER;
  protected readonly label = ELEMENT_LABEL;
}
