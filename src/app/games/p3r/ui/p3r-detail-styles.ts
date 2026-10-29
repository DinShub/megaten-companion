import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Renders nothing; exists only to carry the detail-page half of the shared
 * P3R styles (encapsulation off, scoped under ). Mounted once by
 * P3rLayout, so the rules load with the game's lazy chunk. A second host is
 * needed only because one stylesheet would exceed the per-component budget.
 */
@Component({
  selector: 'app-p3r-detail-styles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: '',
  styleUrl: './p3r-detail-styles.scss',
})
export class P3rDetailStyles {}
