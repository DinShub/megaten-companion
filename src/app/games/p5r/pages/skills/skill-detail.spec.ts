import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { GameDataService } from '../../data/game-data.service';
import { SkillDetail } from './skill-detail';

/**
 * Integration smoke for §4.3 / task 23's headline: "a carded skill shows all
 * three source kinds distinctly." Mounts the real component against a stub data
 * service holding one skill carded from all three origins.
 */
function stubData() {
  const bloodbath = {
    id: 'bloodbath',
    name: 'Bloodbath',
    element: 'phys',
    inheritElement: 'phys',
    cost: { type: 'hp-percent', value: 22 },
    target: 'All foes',
    description: '√120 pwr, 80% acc, 25% Fear',
    rank: 5,
    unique: false,
    cardLocations: [],
    cardSources: [
      { kind: 'itemization', from: 'macabre' },
      { kind: 'itemization-alarm', from: 'kumbhanda' },
      { kind: 'negotiation', from: 'the-black-avenger' },
    ],
  };
  const personas = [
    { id: 'macabre', name: 'Macabre' },
    { id: 'kumbhanda', name: 'Kumbhanda' },
  ];
  const shadows = [{ id: 'the-black-avenger', name: 'The Black Avenger' }];
  const inheritMatrix = { phys: { phys: true, gun: true, ailment: true, healing: true } };

  return { skills: [bloodbath], personas, shadows, inheritMatrix, traits: [], accessories: [] };
}

function stubService() {
  return {
    ready: signal(true),
    loading: signal(false),
    error: signal<string | null>(null),
    data: signal(stubData()),
    skillLearnedBy: signal(new Map()),
    retry: () => {},
  } as unknown as GameDataService;
}

describe('SkillDetail (integration)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the three card-source kinds, each with its linked source', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: GameDataService, useValue: stubService() },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: 'bloodbath' })),
            snapshot: { paramMap: convertToParamMap({ id: 'bloodbath' }) },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(SkillDetail);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    // The three distinct labelled origins…
    expect(text).toContain('Itemization');
    expect(text).toContain('Fusion Alarm');
    expect(text).toContain('Negotiation');
    // …each resolving its source name.
    expect(text).toContain('Macabre');
    expect(text).toContain('Kumbhanda');
    expect(text).toContain('The Black Avenger');
  });

  it('shows the effect and inheritance eligibility for a non-unique skill', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: GameDataService, useValue: stubService() },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: 'bloodbath' })),
            snapshot: { paramMap: convertToParamMap({ id: 'bloodbath' }) },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(SkillDetail);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('√120 pwr, 80% acc, 25% Fear');
    // phys is one of the inherit types that can receive a phys skill.
    const on = [...el.querySelectorAll('.type.is-on')].map((n) => n.textContent?.trim());
    expect(on).toContain('Phys');
  });
});
