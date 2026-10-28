import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { SkillChip } from '../../../../shared/skill-chip/skill-chip';
import { MAX_SKILLS, Smt3CompendiumStore } from '../../compendium/smt3-compendium.store';
import { Smt3DataService } from '../../data/smt3-data.service';
import { nativeSkills } from '../../fusion';
import type { DemonId, Skill } from '../../model';
import { INHERIT_LABEL } from '../../ui/smt3-format';
import { Smt3FusionStore } from '../fusion/smt3-fusion.store';

/**
 * Edit one registered demon: its current level and the (up to eight) skills it
 * actually carries — what the fusion calculator and route finder read for
 * inheritance. Any skill can be added; the engine's own inheritance check flags
 * the ones this demon couldn't have picked up by fusion (its own learn-set is
 * always allowed), so a typo is visible but a real in-game set is never refused.
 */
@Component({
  selector: 'app-smt3-entry-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SkillChip],
  template: `
    @if (entry(); as e) {
      <div class="ed">
        <div class="ed__row">
          <label class="s3-muted" for="ed-level">Level</label>
          <input id="ed-level" class="s3-input" type="number" min="1" max="99" [value]="e.level" (change)="store.setLevel(e.demonId, +$any($event.target).value)" />
          <button type="button" class="s3-btn" (click)="resetSkills()">Reset to learned skills</button>
          <button type="button" class="s3-btn" (click)="done.emit()">Done</button>
        </div>
        <div class="s3-pills">
          @for (s of current(); track s.id) {
            <button type="button" class="ed__chip" (click)="removeSkill(s.id)" [attr.aria-label]="'Remove ' + s.name">
              <app-skill-chip [name]="s.name" [element]="s.element" [unique]="s.unique" /> <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          }
          <span class="s3-muted">{{ e.skillIds.length }}/{{ maxSkills }}</span>
        </div>
        @if (e.skillIds.length < maxSkills) {
          <span class="s3-search">
            <i class="pi pi-plus" aria-hidden="true"></i>
            <input type="text" placeholder="Add a skill…" aria-label="Add a skill" [value]="query()" (input)="query.set($any($event.target).value)" />
          </span>
          @if (matches().length) {
            <ul class="s3-list">
              @for (m of matches(); track m.skill.id) {
                <li>
                  <button type="button" class="ed__chip" (click)="addSkill(m.skill.id)"><app-skill-chip [name]="m.skill.name" [element]="m.skill.element" [unique]="m.skill.unique" /></button>
                  <span class="s3-side">{{ m.note }}</span>
                </li>
              }
            </ul>
          }
        }
      </div>
    }
  `,
  styles: `
    .ed { display: flex; flex-direction: column; gap: 0.6rem; padding-top: 0.6rem; }
    .ed__row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .ed__chip { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0; border: 0; background: transparent; color: var(--p-text-muted-color); font: inherit; cursor: pointer; }
  `,
})
export class Smt3EntryEditor {
  protected readonly store = inject(Smt3CompendiumStore);
  private readonly data = inject(Smt3DataService);
  private readonly fusion = inject(Smt3FusionStore);

  readonly demonId = input.required<DemonId>();
  readonly done = output<void>();

  protected readonly maxSkills = MAX_SKILLS;
  protected readonly query = signal('');

  protected readonly entry = computed(() => this.store.entryMap().get(this.demonId()));

  protected readonly current = computed<Skill[]>(() =>
    (this.entry()?.skillIds ?? []).map((id) => this.data.skillsById().get(id)).filter((s): s is Skill => s != null),
  );

  private readonly learnable = computed(() => {
    const d = this.data.demonsById().get(this.demonId());
    return new Set(d ? d.learnedSkills.map((s) => s.skillId) : []);
  });

  protected readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (q.length < 2) return [];
    const have = new Set(this.entry()?.skillIds ?? []);
    const engine = this.fusion.engine();
    return (this.data.data()?.skills ?? [])
      .filter((s) => !have.has(s.id) && s.name.toLowerCase().includes(q))
      .slice(0, 12)
      .map((skill) => ({ skill, note: this.noteFor(skill, engine?.canInherit(this.demonId(), skill.id) ?? true) }));
  });

  protected addSkill(id: string): void {
    const e = this.entry();
    if (!e) return;
    this.store.upsert({ ...e, skillIds: [...e.skillIds, id] });
    this.query.set('');
  }

  protected removeSkill(id: string): void {
    const e = this.entry();
    if (e) this.store.upsert({ ...e, skillIds: e.skillIds.filter((s) => s !== id) });
  }

  protected resetSkills(): void {
    const e = this.entry();
    const d = this.data.demonsById().get(this.demonId());
    if (e && d) this.store.upsert({ ...e, skillIds: nativeSkills(d, e.level) });
  }

  private noteFor(skill: Skill, inheritable: boolean): string {
    if (this.learnable().has(skill.id)) return 'Learns it';
    if (inheritable) return 'Inheritable';
    if (skill.unique) return 'Unique — not from fusion';
    return skill.inheritCategory ? `Needs ${INHERIT_LABEL[skill.inheritCategory]}` : 'Not inheritable';
  }
}
