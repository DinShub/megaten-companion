import { TestBed } from '@angular/core/testing';

import { SkillChip } from './skill-chip';

describe('SkillChip', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the skill name and colours the dot by element', () => {
    const fixture = TestBed.createComponent(SkillChip);
    fixture.componentRef.setInput('name', 'Mabufudyne');
    fixture.componentRef.setInput('element', 'ice');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Mabufudyne');
    expect(el.querySelector('.chip__dot')?.classList.contains('el-ice')).toBe(true);
  });

  it('marks a unique skill', () => {
    const fixture = TestBed.createComponent(SkillChip);
    fixture.componentRef.setInput('name', 'Ali Dance');
    fixture.componentRef.setInput('unique', true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.chip__unique')).toBeTruthy();
  });
});
