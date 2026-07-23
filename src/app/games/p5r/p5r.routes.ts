import type { Routes } from '@angular/router';

/**
 * P5R feature routes, mounted by the app under `/p5r/*` (task 14/15). Every
 * destination lazy-loads, keeping it out of the initial bundle.
 *
 * Everything nests under {@link P5rLayout}, which triggers the one-time data load
 * and hosts the global search (§10, task 24). The layout's own path is empty, so
 * URLs stay `/p5r/<feature>` and the section tabs' link depth is unchanged.
 */
const placeholder = () => import('./pages/placeholder-page').then((m) => m.PlaceholderPage);

// Multi-page features render their sub-pages as an on-page tab strip (§10),
// not a top-nav dropdown: the parent route mounts the shared SectionLayout and
// declares its tabs in `data.sections`; the children render into its outlet.
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
        { label: 'Itemization', path: 'itemization' },
      ],
    },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'calculator' },
      {
        path: 'calculator',
        loadComponent: placeholder,
        data: { title: 'Fusion Calculator', blurb: 'Pick parents, see the result and its inheritable skills.', phase: 'Phase 6' },
      },
      {
        path: 'route',
        loadComponent: placeholder,
        data: { title: 'Route Finder', blurb: 'Target plus desired skills → ranked fusion chains from your compendium.', phase: 'Phase 7' },
      },
      {
        path: 'itemization',
        loadComponent: placeholder,
        data: { title: 'Itemization', blurb: 'Turn a persona into a skill card — normal and Fusion Alarm variants.', phase: 'Phase 6' },
      },
    ],
  },

  {
    path: 'compendium',
    loadComponent: placeholder,
    data: { title: 'Compendium', blurb: 'Your hand-maintained mirror of the personas you have registered.', phase: 'Phase 4' },
  },

  {
    path: 'personas',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/personas/persona-list').then((m) => m.PersonaList) },
      { path: ':id', loadComponent: () => import('./pages/personas/persona-detail').then((m) => m.PersonaDetail) },
    ],
  },

  {
    path: 'shadows',
    loadComponent: sectionLayout,
    data: {
      sections: [
        { label: 'Shadows', path: '' },
        { label: 'Sub-bosses', path: 'subbosses' },
        { label: 'Drops', path: 'drops' },
      ],
    },
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/shadows/shadow-list').then((m) => m.ShadowList) },
      { path: 'subbosses', loadComponent: () => import('./pages/shadows/subboss-list').then((m) => m.SubbossList) },
      { path: 'drops', loadComponent: () => import('./pages/shadows/drops-page').then((m) => m.DropsPage) },
    ],
  },
  // Shadow detail sits outside the tabbed section so it renders without the tab
  // strip; reachable from both the shadow and sub-boss lists.
  { path: 'shadow/:id', loadComponent: () => import('./pages/shadows/shadow-detail').then((m) => m.ShadowDetail) },

  {
    path: 'skills',
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/skills/skill-list').then((m) => m.SkillList) },
      { path: ':id', loadComponent: () => import('./pages/skills/skill-detail').then((m) => m.SkillDetail) },
    ],
  },

  {
    path: 'classroom',
    loadComponent: placeholder,
    data: { title: 'Classroom Answers', blurb: 'Search a question, get the answer.', phase: 'Phase 10' },
  },

  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings-page').then((m) => m.SettingsPage),
  },

  { path: '**', redirectTo: 'personas' },
];

export const P5R_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./p5r-layout').then((m) => m.P5rLayout),
    children: featureRoutes,
  },
];
