import type { Routes } from '@angular/router';

/**
 * P4G feature routes, mounted by the app under `/p4g/*`. Every destination
 * lazy-loads, keeping the game out of the initial bundle. Everything nests under
 * {@link P4gLayout}, which triggers the one-time data load, hosts the global
 * search and carries the shared page styles. Its path is empty, so URLs stay
 * `/p4g/<feature>`.
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
      { path: 'calculator', loadComponent: () => import('./pages/fusion/p4g-fusion-calculator').then((m) => m.P4gFusionCalculator) },
      { path: 'route', loadComponent: () => import('./pages/fusion/p4g-route-finder').then((m) => m.P4gRouteFinder) },
      { path: 'chart', loadComponent: () => import('./pages/fusion/p4g-fusion-chart').then((m) => m.P4gFusionChart) },
      { path: 'specials', loadComponent: () => import('./pages/fusion/p4g-specials').then((m) => m.P4gSpecials) },
    ],
  },

  { path: 'compendium', loadComponent: () => import('./pages/compendium/p4g-compendium-page').then((m) => m.P4gCompendiumPage) },

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
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/skills/p4g-skill-list').then((m) => m.P4gSkillList) },
      { path: ':id', loadComponent: () => import('./pages/skills/p4g-skill-detail').then((m) => m.P4gSkillDetail) },
    ],
  },

  { path: 'settings', loadComponent: () => import('./pages/settings/p4g-settings-page').then((m) => m.P4gSettingsPage) },
  { path: 'about', loadComponent: () => import('./pages/about/p4g-about-page').then((m) => m.P4gAboutPage) },

  { path: '**', redirectTo: 'personas' },
];

export const P4G_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./p4g-layout').then((m) => m.P4gLayout),
    children: featureRoutes,
  },
];
