import { TestBed } from '@angular/core/testing';

import type { CompendiumEntry, InheritMatrix, LearnedSkill, Persona, Skill, Trait } from '../../model';
import { EntryEditor } from './entry-editor';

const LEARN: LearnedSkill[] = [
  { skillId: 'bufu', kind: 'innate', order: 1 },
  { skillId: 'mabufu', kind: 'level', level: 14 },
  { skillId: 'bufula', kind: 'level', level: 18 },
];

function makePersona(): Persona {
  return {
    id: 'jack-frost', name: 'Jack Frost', arcana: 'magician', level: 12, inheritType: 'ice',
    traitId: 'cold-blooded', stats: { strength: 1, magic: 1, endurance: 1, agility: 1, luck: 1 },
    growth: null, maxStats: null,
    affinities: { phys: 'neutral', gun: 'neutral', fire: 'weak', ice: 'drain', elec: 'neutral', wind: 'neutral', psy: 'neutral', nuke: 'neutral', bless: 'neutral', curse: 'neutral' },
    learnedSkills: LEARN, learnedTraits: [], kind: 'normal', unlock: null, prereq: null,
    itemization: { normal: null, alarm: null, normalItem: null, alarmItem: null },
  };
}

const SKILLS: Skill[] = [
  { id: 'bufu', name: 'Bufu', element: 'ice', inheritElement: 'ice', cost: null, target: '1 foe', description: '', rank: 1, unique: false, cardLocations: [], cardSources: [] },
  { id: 'mabufu', name: 'Mabufu', element: 'ice', inheritElement: 'ice', cost: null, target: 'All foes', description: '', rank: 5, unique: false, cardLocations: [], cardSources: [] },
  { id: 'bufula', name: 'Bufula', element: 'ice', inheritElement: 'ice', cost: null, target: '1 foe', description: '', rank: 10, unique: false, cardLocations: [], cardSources: [] },
  // A null-element support skill (buff/debuff/heal/passive family): never element-gated, only `unique` blocks it.
  { id: 'rakunda', name: 'Rakunda', element: 'support', inheritElement: null, cost: null, target: '1 foe', description: '', rank: 1, unique: false, cardLocations: [], cardSources: [] },
  // A fire skill: element-gated and blocked for an `ice` inherit type by the matrix below.
  { id: 'agi', name: 'Agi', element: 'fire', inheritElement: 'fire', cost: null, target: '1 foe', description: '', rank: 1, unique: false, cardLocations: [], cardSources: [] },
  // A unique passive: never inheritable, whatever the type.
  { id: 'ali-dance', name: 'Ali Dance', element: 'passive', inheritElement: null, cost: null, target: 'Self', description: '', rank: 90, unique: true, cardLocations: [], cardSources: [] },
];

const TRAITS: Trait[] = [
  { id: 'cold-blooded', name: 'Cold Blooded', description: '', rank: 0 },
  // A trait the persona neither has innately nor learns — only reachable by fusion inheritance.
  { id: 'frigid-bloodline', name: 'Frigid Bloodline', description: '', rank: 0 },
];

const MATRIX = { ice: { ice: true } } as unknown as InheritMatrix;

function mount(entry: CompendiumEntry) {
  const fixture = TestBed.createComponent(EntryEditor);
  fixture.componentRef.setInput('persona', makePersona());
  fixture.componentRef.setInput('entry', entry);
  fixture.componentRef.setInput('skills', SKILLS);
  fixture.componentRef.setInput('traits', TRAITS);
  fixture.componentRef.setInput('inheritMatrix', MATRIX);
  fixture.detectChanges();
  return fixture;
}

describe('EntryEditor', () => {
  it('a level change never silently mutates the skill list (task 27)', () => {
    const entry: CompendiumEntry = { personaId: 'jack-frost', level: 12, skillIds: ['bufu'], traitId: 'cold-blooded' };
    const fixture = mount(entry);
    const editor = fixture.componentInstance as unknown as {
      setLevel(v: string): void;
      emitSave(): void;
    };

    let saved: CompendiumEntry | undefined;
    fixture.componentInstance.save.subscribe((e) => (saved = e));

    editor.setLevel('50'); // crosses both Mabufu (14) and Bufula (18)
    editor.emitSave();

    expect(saved?.level).toBe(50);
    expect(saved?.skillIds).toEqual(['bufu']); // untouched by the level change
  });

  it('surfaces reached native skills as suggestions but does not add them', () => {
    const entry: CompendiumEntry = { personaId: 'jack-frost', level: 20, skillIds: ['bufu'], traitId: null };
    const fixture = mount(entry);
    const editor = fixture.componentInstance as unknown as { suggestions(): { skillId: string }[] };
    expect(editor.suggestions().map((s) => s.skillId)).toEqual(['mabufu', 'bufula']);
  });

  it('emits the edited entry with an explicitly added skill', () => {
    const entry: CompendiumEntry = { personaId: 'jack-frost', level: 20, skillIds: ['bufu'], traitId: null };
    const fixture = mount(entry);
    const editor = fixture.componentInstance as unknown as {
      addSkill(id: string): void;
      emitSave(): void;
    };
    let saved: CompendiumEntry | undefined;
    fixture.componentInstance.save.subscribe((e) => (saved = e));

    editor.addSkill('mabufu');
    editor.emitSave();
    expect(saved?.skillIds).toEqual(['bufu', 'mabufu']);
  });

  it('offers null-element skills (buffs/debuffs/heals) — they are never element-gated', () => {
    // Regression: an inherited support skill like Rakunda has inheritElement: null.
    // The add-picker used to drop every null-element skill, so fused-in support
    // skills could not be recorded. They are inheritable by any type (only `unique` blocks).
    const entry: CompendiumEntry = { personaId: 'jack-frost', level: 20, skillIds: ['bufu'], traitId: null };
    const fixture = mount(entry);
    const editor = fixture.componentInstance as unknown as {
      addQuery: { set(v: string): void };
      addMatches(): { id: string }[];
    };
    editor.addQuery.set('rak');
    fixture.detectChanges();
    expect(editor.addMatches().map((o) => o.id)).toContain('rakunda');
  });

  it('still blocks element-gated skills the type cannot inherit, and unique skills', () => {
    const entry: CompendiumEntry = { personaId: 'jack-frost', level: 20, skillIds: [], traitId: null };
    const fixture = mount(entry);
    const editor = fixture.componentInstance as unknown as {
      addQuery: { set(v: string): void };
      addMatches(): { id: string }[];
    };
    editor.addQuery.set('a'); // matches Agi (fire, blocked) and Ali Dance (unique)
    fixture.detectChanges();
    const ids = editor.addMatches().map((o) => o.id);
    expect(ids).not.toContain('agi'); // fire element blocked for an ice inherit type
    expect(ids).not.toContain('ali-dance'); // unique is never inheritable
  });

  it('offers every trait for selection — a fused persona can inherit any (task: Frigid Bloodline)', () => {
    // Regression: the trait picker used to list only the persona's native traits,
    // so an inherited trait could never be set. Any trait is fusion-inheritable.
    const entry: CompendiumEntry = { personaId: 'jack-frost', level: 12, skillIds: [], traitId: null };
    const fixture = mount(entry);
    const editor = fixture.componentInstance as unknown as {
      traitGroups(): { label: string; options: { id: string }[] }[];
    };
    const ids = editor.traitGroups().flatMap((g) => g.options.map((o) => o.id));
    expect(ids).toContain('cold-blooded'); // the persona's own trait
    expect(ids).toContain('frigid-bloodline'); // inheritable though not native
  });
});
