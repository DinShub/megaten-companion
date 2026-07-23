import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';

import { OwnershipBadge } from '../ownership-badge/ownership-badge';

/** A pickable persona, in the picker's own view-model (no game model import). */
export interface PickerOption {
  readonly id: string;
  readonly name: string;
  readonly arcana: string;
  /** Whether it's in the user's compendium; drives the badge and the default filter. */
  readonly owned?: boolean;
  /** Optional registered level for the badge. */
  readonly level?: number | null;
}

/** Case-insensitive subsequence ("fuzzy") match — chars of `query` in order. */
function fuzzy(query: string, text: string): boolean {
  const q = query.toLowerCase();
  if (!q) return true;
  const t = text.toLowerCase();
  let i = 0;
  for (let c = 0; c < t.length && i < q.length; c++) {
    if (t[c] === q[i]) i++;
  }
  return i === q.length;
}

/**
 * Fuzzy type-ahead persona picker (§4.6, §10, task 18). Matches name and arcana,
 * defaults to the compendium subset with a toggle to the full roster, and emits
 * the chosen option; callers map their model to {@link PickerOption}.
 *
 * Hand-rolled (native input + a listbox), deliberately PrimeNG-free: it is used
 * on lazy feature pages, and pulling PrimeNG's AutoComplete/overlay base in here
 * inlines ~9 kB of shared theme runtime into the eager `main` chunk (it shares a
 * base with the app's eager `providePrimeNG`), breaking the 500 kB budget (§9.3).
 * Every downstream picker (compendium, calculator) reuses this at no bundle cost.
 */
@Component({
  selector: 'app-persona-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OwnershipBadge],
  template: `
    <div class="picker" (focusout)="onFocusOut($event)">
      <div class="picker__field">
        <i class="pi pi-search" aria-hidden="true"></i>
        <input
          class="picker__input"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="persona-picker-list"
          [attr.aria-expanded]="isOpen()"
          [placeholder]="placeholder()"
          [attr.aria-label]="placeholder()"
          [value]="query()"
          (focus)="open.set(true)"
          (input)="onInput($any($event.target).value)"
          (keydown.arrowdown)="move(1, $event)"
          (keydown.arrowup)="move(-1, $event)"
          (keydown.enter)="pickActive($event)"
          (keydown.escape)="close()"
        />
        @if (hasOwned()) {
          <button
            type="button"
            class="picker__toggle"
            [attr.aria-pressed]="compendiumOnly()"
            (click)="compendiumOnly.set(!compendiumOnly())"
          >
            <i class="pi" [class.pi-book]="compendiumOnly()" [class.pi-globe]="!compendiumOnly()" aria-hidden="true"></i>
            {{ compendiumOnly() ? 'Compendium' : 'All' }}
          </button>
        }
      </div>

      @if (isOpen() && suggestions().length) {
        <ul class="picker__list" id="persona-picker-list" role="listbox">
          @for (option of suggestions(); track option.id; let i = $index) {
            <li role="option" [attr.aria-selected]="i === active()">
              <button
                type="button"
                class="picker__opt"
                [class.is-active]="i === active()"
                (mousedown)="$event.preventDefault()"
                (click)="choose(option)"
              >
                <span class="opt__name">{{ option.name }}</span>
                <span class="opt__arcana">{{ option.arcana }}</span>
                @if (option.owned) {
                  <app-ownership-badge [registered]="true" [level]="option.level ?? null" />
                }
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .picker {
      position: relative;
    }
    .picker__field {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.7rem;
      border: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.3));
      border-radius: var(--p-border-radius, 6px);
      background: var(--p-content-background);

      .pi-search {
        color: var(--p-text-muted-color);
      }
    }
    .picker__input {
      flex: 1 1 auto;
      min-width: 0;
      border: 0;
      background: transparent;
      color: var(--p-text-color);
      font: inherit;
      outline: none;
    }
    .picker__toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.2rem 0.55rem;
      border: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.3));
      border-radius: 999px;
      background: transparent;
      color: var(--p-text-muted-color);
      font: inherit;
      font-size: 0.78rem;
      white-space: nowrap;
      cursor: pointer;

      &:hover {
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
      }
    }
    .picker__list {
      position: absolute;
      z-index: 20;
      left: 0;
      right: 0;
      margin: 0.3rem 0 0;
      padding: 0.25rem;
      list-style: none;
      max-height: 16rem;
      overflow-y: auto;
      background: var(--p-content-background);
      border: 1px solid var(--p-content-border-color, rgba(127, 127, 127, 0.3));
      border-radius: var(--p-border-radius, 6px);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    }
    .picker__opt {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.4rem 0.55rem;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: var(--p-text-color);
      font: inherit;
      text-align: left;
      cursor: pointer;

      &:hover,
      &.is-active {
        background: var(--p-highlight-background, rgba(127, 127, 127, 0.14));
      }
    }
    .opt__name {
      font-weight: 600;
    }
    .opt__arcana {
      color: var(--p-text-muted-color);
      font-size: 0.8rem;
      text-transform: capitalize;
    }
  `,
})
export class PersonaPicker {
  readonly options = input.required<readonly PickerOption[]>();
  readonly placeholder = input('Search personas…');
  /** Two-way: start on the compendium subset, toggle to the full roster (§4.6). */
  readonly compendiumOnly = model(true);
  readonly picked = output<PickerOption>();

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(0);

  protected readonly hasOwned = computed(() => this.options().some((o) => o.owned));

  /** Base list before the query: compendium subset when asked and non-empty. */
  private readonly base = computed<readonly PickerOption[]>(() => {
    const all = this.options();
    if (!this.compendiumOnly()) return all;
    const owned = all.filter((o) => o.owned);
    return owned.length > 0 ? owned : all;
  });

  protected readonly suggestions = computed<PickerOption[]>(() => this.filter(this.query()));

  /** Open only when there is something to show. */
  protected readonly isOpen = computed(() => this.open() && this.suggestions().length > 0);

  /** Public for tests: fuzzy-filter the base list by name and arcana. */
  filter(query: string): PickerOption[] {
    return this.base()
      .filter((o) => fuzzy(query, o.name) || fuzzy(query, o.arcana))
      .slice(0, 50);
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.open.set(true);
    this.active.set(0);
  }

  protected move(direction: 1 | -1, event: Event): void {
    const count = this.suggestions().length;
    if (count === 0) return;
    event.preventDefault();
    this.open.set(true);
    this.active.set((this.active() + direction + count) % count);
  }

  protected pickActive(event: Event): void {
    const list = this.suggestions();
    const option = list[this.active()];
    if (option) {
      event.preventDefault();
      this.choose(option);
    }
  }

  /** Emit the chosen option; reflect it in the field and close the list. */
  choose(option: PickerOption): void {
    this.picked.emit(option);
    this.query.set(option.name);
    this.open.set(false);
  }

  protected close(): void {
    this.open.set(false);
  }

  /** Close when focus leaves the whole control (blur to an outside element). */
  protected onFocusOut(event: FocusEvent): void {
    const host = event.currentTarget as HTMLElement;
    if (!host.contains(event.relatedTarget as Node | null)) this.open.set(false);
  }
}
