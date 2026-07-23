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
];

const TRAITS: Trait[] = [{ id: 'cold-blooded', name: 'Cold Blooded', description: '', rank: 0 }];

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
});
