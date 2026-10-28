import type { Routes } from '@angular/router';

/**
 * Nocturne feature routes, mounted by the app under `/smt3/*`. Every destination
 * lazy-loads, keeping the game out of the initial bundle. Everything nests under
 * {@link Smt3Layout}, which triggers the one-time data load, hosts the global
 * search and carries the shared page styles. Its path is empty, so URLs stay
 * `/smt3/<feature>`.
 */
const sectionLayout = () =>
  import('../../shared/section-layout/section-layout').then((m) => m.SectionLayout);

const featureRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'demons' },

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
      { path: 'calculator', loadComponent: () => import('./pages/fusion/smt3-fusion-calculator').then((m) => m.Smt3FusionCalculator) },
      { path: 'route', loadComponent: () => import('./pages/fusion/smt3-route-finder').then((m) => m.Smt3RouteFinder) },
      { path: 'chart', loadComponent: () => import('./pages/fusion/smt3-fusion-chart').then((m) => m.Smt3FusionChart) },
      { path: 'specials', loadComponent: () => import('./pages/fusion/smt3-specials').then((m) => m.Smt3Specials) },
    ],
  },

  { path: 'compendium', loadComponent: () => import('./pages/compendium/smt3-compendium-page').then((m) => m.Smt3CompendiumPage) },

  {
    path: 'demons',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/demons/demon-list').then((m) => m.DemonList) },
      { path: ':id', loadComponent: () => import('./pages/demons/demon-detail').then((m) => m.DemonDetail) },
    ],
  },

  {
    path: 'magatama',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/magatama/magatama-list').then((m) => m.MagatamaList) },
      { path: ':id', loadComponent: () => import('./pages/magatama/magatama-detail').then((m) => m.MagatamaDetail) },
    ],
  },

  {
    path: 'skills',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/skills/smt3-skill-list').then((m) => m.Smt3SkillList) },
      { path: ':id', loadComponent: () => import('./pages/skills/smt3-skill-detail').then((m) => m.Smt3SkillDetail) },
    ],
  },

  { path: 'settings', loadComponent: () => import('./pages/settings/smt3-settings-page').then((m) => m.Smt3SettingsPage) },
  { path: 'about', loadComponent: () => import('./pages/about/smt3-about-page').then((m) => m.Smt3AboutPage) },

  { path: '**', redirectTo: 'demons' },
];

export const SMT3_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./smt3-layout').then((m) => m.Smt3Layout),
    children: featureRoutes,
  },
];
