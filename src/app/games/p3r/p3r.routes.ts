import type { Routes } from '@angular/router';

/**
 * P3R feature routes, mounted by the app under `/p3r/*`. Every destination
 * lazy-loads, keeping the game out of the initial bundle. Everything nests under
 * {@link P3rLayout}, which triggers the one-time data load, hosts the global
 * search and carries the shared page styles. Its path is empty, so URLs stay
 * `/p3r/<feature>`.
 */
const sectionLayout = () =>
  import('../../shared/section-layout/section-layout').then((m) => m.SectionLayout);

const featureRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'personas' },

  {
    path: 'fusion',
    loadComponent: sectionLayout,
    data: {
      sections: [
        { label: 'Calculator', path: 'calculator' },
        { label: 'Route finder', path: 'route' },
        { label: 'Fusion chart', path: 'chart' },
        { label: 'Special fusions', path: 'specials' },
      ],
    },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'calculator' },
      { path: 'calculator', loadComponent: () => import('./pages/fusion/p3r-fusion-calculator').then((m) => m.P3rFusionCalculator) },
      { path: 'route', loadComponent: () => import('./pages/fusion/p3r-route-finder').then((m) => m.P3rRouteFinder) },
      { path: 'chart', loadComponent: () => import('./pages/fusion/p3r-fusion-chart').then((m) => m.P3rFusionChart) },
      { path: 'specials', loadComponent: () => import('./pages/fusion/p3r-specials').then((m) => m.P3rSpecials) },
    ],
  },

  { path: 'compendium', loadComponent: () => import('./pages/compendium/p3r-compendium-page').then((m) => m.P3rCompendiumPage) },

  {
    path: 'personas',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/personas/persona-list').then((m) => m.PersonaList) },
      { path: ':id', loadComponent: () => import('./pages/personas/persona-detail').then((m) => m.PersonaDetail) },
    ],
  },

  {
    path: 'shadows',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/shadows/shadow-list').then((m) => m.ShadowList) },
      { path: ':id', loadComponent: () => import('./pages/shadows/shadow-detail').then((m) => m.ShadowDetail) },
    ],
  },

  {
    path: 'skills',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/skills/p3r-skill-list').then((m) => m.P3rSkillList) },
      { path: ':id', loadComponent: () => import('./pages/skills/p3r-skill-detail').then((m) => m.P3rSkillDetail) },
    ],
  },

  { path: 'settings', loadComponent: () => import('./pages/settings/p3r-settings-page').then((m) => m.P3rSettingsPage) },
  { path: 'about', loadComponent: () => import('./pages/about/p3r-about-page').then((m) => m.P3rAboutPage) },

  { path: '**', redirectTo: 'personas' },
];

export const P3R_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./p3r-layout').then((m) => m.P3rLayout),
    children: featureRoutes,
  },
];
