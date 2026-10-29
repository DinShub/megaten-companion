/* Shared, real P3R content for all four prototypes.
   Source: aqiu384/megaten-fusion-tool @ f7d41c3, src/app/p3r/data/demon-data.json + fusion-chart.json.
   Recipe worked out by hand from the upstream chart (Fool × Magician = Hierophant) and the normal
   level rule floor((1 + 8) / 2) + 1 = 5 → the first Hierophant from Lv 5 is Omoikane (Lv 7).
   Not computed by the app's engine. Fusion-spell rows (upstream level 5217) are left out. */
(function () {
  const ELEMENTS = [
    ['Slash', 'Sl'], ['Strike', 'St'], ['Pierce', 'Pi'], ['Fire', 'Fi'], ['Ice', 'Ic'],
    ['Elec', 'El'], ['Wind', 'Wi'], ['Light', 'Li'], ['Dark', 'Da'],
  ];
  const CODE = { w: 'Wk', s: 'Rs', n: 'Nu', r: 'Rp', d: 'Dr' };
  const WORD = { Wk: 'weak', Rs: 'resists', Nu: 'nulls', Rp: 'repels', Dr: 'drains' };

  // `resists` is upstream's string, one character per element in ELEMENTS order (almighty dropped: all neutral).
  const raw = [
    { lv: 1, name: 'Orpheus', arcana: 'Fool', resists: '---s-w--w' },
    { lv: 2, name: 'Pixie', arcana: 'Lovers', resists: '----ws---' },
    { lv: 2, name: 'Apsaras', arcana: 'Priestess', resists: '---ws----' },
    { lv: 3, name: 'Nekomata', arcana: 'Magician', resists: '-----ws--' },
    { lv: 4, name: 'Angel', arcana: 'Justice', resists: '-----s-sw' },
    { lv: 7, name: 'Omoikane', arcana: 'Hierophant', resists: '-----s--w', tag: 'Result' },
    { lv: 7, name: 'Forneus', arcana: 'Emperor', resists: '----sw---' },
    { lv: 8, name: 'Jack Frost', arcana: 'Magician', resists: '---wn----', tag: 'Parent' },
  ];
  const affOf = (s) => Object.fromEntries(ELEMENTS.map(([e], i) => [e, CODE[s[i]] || null]).filter(([, v]) => v));
  const PERSONAS = raw.map((p) => ({ ...p, aff: affOf(p.resists), tag: p.tag || (p.name === 'Orpheus' ? 'Parent' : undefined) }));
  const by = (n) => PERSONAS.find((p) => p.name === n);

  const PARENTS = [
    { ...by('Orpheus'), numeral: '0', inherits: 'wind',
      skills: [['Agi', 0], ['Dia', 3], ['Bash', 4], ['Tarunda', 5]],
      stats: [['St', 2], ['Ma', 2], ['En', 2], ['Ag', 3], ['Lu', 2]] },
    { ...by('Jack Frost'), numeral: 'I', inherits: 'ice',
      skills: [['Bufu', 0], ['Pulinpa', 0], ['Mabufu', 10], ['Sonic Punch', 11], ['Freeze Boost', 12], ['Ice Boost', 13]],
      stats: [['St', 5], ['Ma', 9], ['En', 8], ['Ag', 6], ['Lu', 4]] },
  ];
  const RESULT = { ...by('Omoikane'), numeral: 'V', inherits: 'elec',
    skills: [['Zio', 0], ['Dia', 0], ['Rebellion', 8], ['Resist Shock', 10], ['Auto Rakukaja', 12]],
    stats: [['St', 4], ['Ma', 8], ['En', 6], ['Ag', 4], ['Lu', 6]] };
  const RULE = { arcana: ['Fool', 'Magician'], makes: 'Hierophant', from: 5 };
  const TOTAL = 194; // personas in upstream demon-data.json

  /* ---- shared rendering helpers (markup only; each prototype styles the classes) ---- */
  const cell = (v) => v
    ? `<span class="v ${v.toLowerCase()}" title="${WORD[v]}">${v}</span>`
    : '<span class="v n" aria-label="neutral">–</span>';
  const head = ([e, ab]) => `<span class="h" title="${e}">${ab}</span>`;
  const strip = (aff, withHead) => ELEMENTS.map((el) => `<span>${withHead ? head(el) : ''}${cell(aff[el[0]])}</span>`).join('');
  const stripHead = () => ELEMENTS.map((el) => `<span>${head(el)}</span>`).join('');
  const skillList = (skills) => skills.map(([n, lv]) =>
    `<li><span class="${lv ? '' : 'innate'}">${n}</span><span class="lv">${lv ? `Lv ${lv}` : 'innate'}</span></li>`).join('');
  const sayAff = (aff) => Object.entries(aff).map(([e, v]) => `${WORD[v]} ${e.toLowerCase()}`).join(', ');

  /* Live search over the persona rows; rows must be in PERSONAS order. */
  function wireSearch(input, tbody) {
    input.addEventListener('input', () => {
      const t = input.value.trim().toLowerCase();
      [...tbody.rows].forEach((tr, i) => {
        tr.hidden = !!t && !`${PERSONAS[i].name} ${PERSONAS[i].arcana}`.toLowerCase().includes(t);
      });
    });
  }
  /* aria-pressed toggle group. */
  function wireToggles(root) {
    const btns = [...root.querySelectorAll('button')];
    btns.forEach((b) => b.addEventListener('click', () => btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)))));
  }
  /* One skippable signature moment: run(at) schedules steps; finish() jumps to the end state. */
  function moment(run, finish) {
    let timers = [];
    let playing = false;
    const end = () => { timers.forEach(clearTimeout); timers = []; playing = false; finish(); };
    const play = () => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return end();
      playing = true;
      run((ms, fn) => timers.push(setTimeout(fn, ms)), end);
    };
    const skip = () => playing && end();
    document.addEventListener('pointerdown', skip);
    document.addEventListener('keydown', skip);
    return { play, end };
  }

  if (location.hash === '#preview') document.documentElement.classList.add('is-preview');

  window.P3R = { ELEMENTS, WORD, PERSONAS, PARENTS, RESULT, RULE, TOTAL, cell, head, strip, stripHead, skillList, sayAff, wireSearch, wireToggles, moment };
})();
