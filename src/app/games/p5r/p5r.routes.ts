import type { Routes } from '@angular/router';

/**
 * P5R feature routes, mounted by the app under `/p5r/*` (task 14/15). Every
 * destination lazy-loads, keeping it out of the initial bundle. Feature pages
 * are placeholders until Phases 3–6 land; Settings is real (task 17).
 */
const placeholder = () => import('./pages/placeholder-page').then((m) => m.PlaceholderPage);

// Multi-page features render their sub-pages as an on-page tab strip (§10),
// not a top-nav dropdown: the parent route mounts the shared SectionLayout and
// declares its tabs in `data.sections`; the children render into its outlet.
const sectionLayout = () =>
  import('../../shared/section-layout/section-layout').then((m) => m.SectionLayout);

export const P5R_ROUTES: Routes = [
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
    loadComponent: placeholder,
    data: { title: 'Personas', blurb: '242 personas — stats, affinities, learn-sets and itemization.', phase: 'Phase 3' },
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
      {
        path: '',
        pathMatch: 'full',
        loadComponent: placeholder,
        data: { title: 'Shadows', blurb: 'Enemy-side data: stats, affinities, ailment resistances, drops.', phase: 'Phase 3' },
      },
      {
        path: 'subbosses',
        loadComponent: placeholder,
        data: { title: 'Sub-bosses', blurb: 'The 28 Mementos sub-bosses and the requests that spawn them.', phase: 'Phase 3' },
      },
      {
        path: 'drops',
        loadComponent: placeholder,
        data: { title: 'Drops', blurb: 'Inverted material → shadows index, searchable.', phase: 'Phase 3' },
      },
    ],
  },

  {
    path: 'skills',
    loadComponent: placeholder,
    data: { title: 'Skills', blurb: 'Every skill — cost, effect, who learns it, and its card sources.', phase: 'Phase 3' },
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
