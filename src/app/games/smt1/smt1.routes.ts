import type { Routes } from '@angular/router';

/**
 * SMT1 feature routes, mounted by the app under `/smt1/*`. Every destination
 * lazy-loads, keeping the game out of the initial bundle. Everything nests
 * under {@link Smt1Layout}, which triggers the one-time data load and hosts the
 * global search. Its path is empty, so URLs stay `/smt1/<feature>`.
 */
const sectionLayout = () =>
  import('../../shared/section-layout/section-layout').then((m) => m.SectionLayout);

const featureRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'fusion' },

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
      { path: 'calculator', loadComponent: () => import('./pages/fusion/smt1-fusion-calculator').then((m) => m.Smt1FusionCalculator) },
      { path: 'route', loadComponent: () => import('./pages/fusion/smt1-route-finder').then((m) => m.Smt1RouteFinder) },
      { path: 'chart', loadComponent: () => import('./pages/fusion/smt1-fusion-chart').then((m) => m.Smt1FusionChart) },
      { path: 'specials', loadComponent: () => import('./pages/fusion/smt1-specials').then((m) => m.Smt1Specials) },
    ],
  },

  { path: 'compendium', loadComponent: () => import('./pages/compendium/smt1-compendium-page').then((m) => m.Smt1CompendiumPage) },

  {
    path: 'demons',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/demons/smt1-demon-list').then((m) => m.Smt1DemonList) },
      { path: ':id', loadComponent: () => import('./pages/demons/smt1-demon-detail').then((m) => m.Smt1DemonDetail) },
    ],
  },

  {
    path: 'skills',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/skills/smt1-skill-list').then((m) => m.Smt1SkillList) },
      { path: ':id', loadComponent: () => import('./pages/skills/smt1-skill-detail').then((m) => m.Smt1SkillDetail) },
    ],
  },

  { path: 'settings', loadComponent: () => import('./pages/settings/smt1-settings-page').then((m) => m.Smt1SettingsPage) },
  { path: 'about', loadComponent: () => import('./pages/about/smt1-about-page').then((m) => m.Smt1AboutPage) },

  { path: '**', redirectTo: 'fusion' },
];

export const SMT1_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./smt1-layout').then((m) => m.Smt1Layout),
    children: featureRoutes,
  },
];
