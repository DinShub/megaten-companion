import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';

import { PRIMEUI_LICENSE_KEY } from '../environments/license';
import { routes } from './app.routes';
import { LaraPurple } from './theme/lara-purple';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    providePrimeNG({
      license: PRIMEUI_LICENSE_KEY,
      theme: {
        preset: LaraPurple,
        options: {
          // Dark tokens apply under this class. index.html ships it on <html>
          // so the first paint is already dark; App#toggleDark flips it.
          darkModeSelector: '.app-dark',
        },
      },
    }),
  ],
};
