import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  PreloadAllModules,
  provideRouter,
  withInMemoryScrolling,
  withPreloading,
} from '@angular/router';
import { providePrimeNG } from 'primeng/config';

import { PRIMEUI_LICENSE_KEY } from '../environments/license';
import { routes } from './app.routes';
import { AppPreset, bootTheme, THEME_OPTIONS } from './theme/app-preset';
import { ensureSkinStylesheet } from './theme/skin-stylesheet';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hold the first render until the booting game's skin sheet is in, so the
    // shell never paints unskinned. The loader times out rather than block.
    provideAppInitializer(() => ensureSkinStylesheet(bootTheme().skin)),
    // Datasets are fetched as static assets at runtime (§8.5), so the app needs
    // an HttpClient. `withFetch` uses the Fetch API backend.
    provideHttpClient(withFetch()),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      // Preload every lazy route once the shell is up, so the first click on a
      // feature (notably Settings, which pulls in PrimeNG) is instant instead of
      // stalling on an on-demand chunk fetch. The preloader covers `loadComponent`
      // routes too, not just `loadChildren`.
      withPreloading(PreloadAllModules),
    ),
    providePrimeNG({
      license: PRIMEUI_LICENSE_KEY,
      theme: {
        preset: AppPreset,
        // Dark tokens apply under `.app-dark`, which index.html ships permanently on
        // <html> — the app is dark-only. Shared with the runtime game-theme switch
        // so the selector stays consistent.
        options: THEME_OPTIONS,
      },
    }),
  ],
};
