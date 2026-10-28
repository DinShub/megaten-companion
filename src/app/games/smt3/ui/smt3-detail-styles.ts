import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Renders nothing; exists only to carry the detail-page half of the shared
 * Nocturne styles (encapsulation off, scoped under ). Mounted once by
 * Smt3Layout, so the rules load with the game's lazy chunk. A second host is
 * needed only because one stylesheet would exceed the per-component budget.
 */
@Component({
  selector: 'app-smt3-detail-styles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: '',
  styleUrl: './smt3-detail-styles.scss',
})
export class Smt3DetailStyles {}
