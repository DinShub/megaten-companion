import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import {
  AutoCompleteModule,
  type AutoCompleteCompleteEvent,
  type AutoCompleteSelectEvent,
} from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';

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
 * Fuzzy type-ahead persona picker (§4.6, §10). Matches name and arcana, and
 * defaults to the compendium subset with a toggle to the full roster. Emits the
 * chosen option; callers map their model to {@link PickerOption}.
 */
@Component({
  selector: 'app-persona-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AutoCompleteModule, ButtonModule, OwnershipBadge],
  template: `
    <div class="picker">
      <p-autocomplete
        styleClass="picker__field"
        [suggestions]="suggestions()"
        (completeMethod)="search($event)"
        (onSelect)="choose($event)"
        optionLabel="name"
        [dropdown]="true"
        [forceSelection]="true"
        [placeholder]="placeholder()"
        [attr.aria-label]="placeholder()"
      >
        <ng-template let-option #item>
          <div class="opt">
            <span class="opt__name">{{ option.name }}</span>
            <span class="opt__arcana">{{ option.arcana }}</span>
            @if (option.owned) {
              <app-ownership-badge [registered]="true" [level]="option.level ?? null" />
            }
          </div>
        </ng-template>
      </p-autocomplete>

      @if (hasOwned()) {
        <p-button
          size="small"
          severity="secondary"
          [text]="true"
          [icon]="compendiumOnly() ? 'pi pi-book' : 'pi pi-globe'"
          [label]="compendiumOnly() ? 'Compendium' : 'All'"
          (onClick)="compendiumOnly.set(!compendiumOnly())"
        />
      }
    </div>
  `,
  styles: `
    .picker {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .picker__field {
      flex: 1 1 auto;
    }
    .opt {
      display: flex;
      align-items: center;
      gap: 0.5rem;
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

  protected readonly suggestions = signal<PickerOption[]>([]);

  protected readonly hasOwned = computed(() => this.options().some((o) => o.owned));

  /** Base list before the query: compendium subset when asked and non-empty. */
  private readonly base = computed<readonly PickerOption[]>(() => {
    const all = this.options();
    if (!this.compendiumOnly()) return all;
    const owned = all.filter((o) => o.owned);
    return owned.length > 0 ? owned : all;
  });

  /** Public for tests: fuzzy-filter the base list by name and arcana. */
  filter(query: string): PickerOption[] {
    return this.base()
      .filter((o) => fuzzy(query, o.name) || fuzzy(query, o.arcana))
      .slice(0, 50);
  }

  protected search(event: AutoCompleteCompleteEvent): void {
    this.suggestions.set(this.filter(event.query));
  }

  protected choose(event: AutoCompleteSelectEvent): void {
    this.picked.emit(event.value as PickerOption);
  }
}
