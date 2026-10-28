import { TestBed } from '@angular/core/testing';

import { BackupService } from '../../../../core/backup/backup.service';
import type { StorageBackend } from '../../../../core/storage/storage-envelope';
import { STORAGE_BACKEND } from '../../../../core/storage/storage.service';
import { SettingsStore } from '../../settings/settings.store';
import { SettingsPage } from './settings-page';

class FakeBackend implements StorageBackend {
  private readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

describe('SettingsPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  function mount() {
    TestBed.configureTestingModule({
      providers: [{ provide: STORAGE_BACKEND, useValue: new FakeBackend() }],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    return fixture;
  }

  it('renders every settings section (§4.8)', () => {
    const text = (mount().nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Protagonist level');
    expect(text).toContain('Fusion Alarm');
    expect(text).toContain('Unlock groups');
    expect(text).toContain('Downloadable Content');
    // Dark-only app: no theme row.
    expect(text).not.toContain('Theme');
    expect(text).toContain('Reset all local data');
  });

  it('offers a whole-app backup and restore', () => {
    const text = (mount().nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Back up everything');
    expect(text).toContain('Restore from backup');
  });

  it('shows a rejected backup’s reason and applies nothing', async () => {
    const fixture = mount();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#restore-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['{"oops"'], 'b.json')] });
    await fixture.componentInstance['pickBackup']({ target: input } as unknown as Event);
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('isn’t valid JSON');
    expect(fixture.componentInstance['restoring']()).toBeNull();
  });

  it('summarises a valid backup before restoring it', async () => {
    const fixture = mount();
    TestBed.inject(SettingsStore).setProtagonistLevel(30);
    const backup = TestBed.inject(BackupService).build();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#restore-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([backup], 'b.json')] });
    await fixture.componentInstance['pickBackup']({ target: input } as unknown as Event);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('P5R compendium — empty');
    expect(text).toContain('P5R settings');
    expect(text).toContain('Nocturne compendium — empty');
    expect(text).toContain('Restore and reload');
  });

  it('reset restores defaults through the store', () => {
    const fixture = mount();
    const store = TestBed.inject(SettingsStore);
    store.setUnlockGroup('dlc', true);
    expect(store.unlockGroups().dlc).toBe(true);

    fixture.componentInstance['reset']();
    expect(store.unlockGroups().dlc).toBe(false);
  });
});
