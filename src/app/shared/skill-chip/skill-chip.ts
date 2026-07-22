import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { SKILL_ELEMENT_CLS, SKILL_ELEMENT_LABEL } from '../element-visuals';

/**
 * Compact skill chip (§10): an element-coloured dot, the name, and a marker for
 * skills that can never be inherited (`unique`). Takes plain fields rather than
 * the model type, so it stays game-agnostic in `shared/`.
 */
@Component({
  selector: 'app-skill-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="chip" [title]="title()">
      <span class="chip__dot" [class]="dotCls()" aria-hidden="true"></span>
      <span class="chip__name">{{ name() }}</span>
      @if (unique()) {
        <i class="pi pi-lock chip__unique" aria-hidden="true" title="Unique — not inheritable"></i>
      }
    </span>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: var(--p-surface-700, rgba(127, 127, 127, 0.16));
      font-size: 0.8rem;
      max-width: 100%;
    }
    .chip__dot {
      width: 0.6rem;
      height: 0.6rem;
      border-radius: 50%;
      flex: 0 0 auto;
      background: var(--p-text-muted-color);
    }
    .chip__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chip__unique {
      font-size: 0.7rem;
      color: var(--p-text-muted-color);
    }
    .el-phys { background: #f87171; }
    .el-gun { background: #fbbf24; }
    .el-fire { background: #fb7185; }
    .el-ice { background: #38bdf8; }
    .el-elec { background: #facc15; }
    .el-wind { background: #34d399; }
    .el-psy { background: #f0abfc; }
    .el-nuke { background: #a3e635; }
    .el-bless { background: #fde68a; }
    .el-curse { background: #c084fc; }
    .el-almighty { background: #e2e8f0; }
    .el-ailment { background: #a78bfa; }
    .el-support { background: #60a5fa; }
    .el-healing { background: #4ade80; }
    .el-passive { background: #94a3b8; }
  `,
})
export class SkillChip {
  readonly name = input.required<string>();
  /** Skill classification (`fire`, `almighty`, `passive`, …). */
  readonly element = input<string>('passive');
  readonly unique = input<boolean>(false);

  protected readonly dotCls = computed(() => SKILL_ELEMENT_CLS[this.element()] ?? 'el-passive');
  protected readonly title = computed(() => {
    const label = SKILL_ELEMENT_LABEL[this.element()] ?? this.element();
    return this.unique() ? `${this.name()} — ${label}, unique` : `${this.name()} — ${label}`;
  });
}
