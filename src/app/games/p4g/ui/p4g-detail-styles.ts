import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Renders nothing; exists only to carry the detail-page half of the shared
 * P4G styles (encapsulation off, scoped under ). Mounted once by
 * P4gLayout, so the rules load with the game's lazy chunk. A second host is
 * needed only because one stylesheet would exceed the per-component budget.
 */
@Component({
  selector: 'app-p4g-detail-styles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: '',
  styleUrl: './p4g-detail-styles.scss',
})
export class P4gDetailStyles {}
