import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';

import { PRIMEUI_LICENSE_KEY } from '../environments/license';

/** Must match `darkModeSelector` in app.config.ts. */
const DARK_CLASS = 'app-dark';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    ButtonModule,
    CardModule,
    DividerModule,
    InputTextModule,
    MessageModule,
    TagModule,
    ToolbarModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('Megaten Companion');

  /** Starts dark: index.html already carries the class, so there is no flash. */
  protected readonly dark = signal(true);

  /** Drives the setup hint in the template; disappears once a key is filled in. */
  protected readonly licenseMissing = PRIMEUI_LICENSE_KEY.trim().length === 0;

  protected toggleDark(): void {
    this.dark.update((isDark) => !isDark);
    document.documentElement.classList.toggle(DARK_CLASS, this.dark());
  }
}
