/* Shared, real SMT1 content for all four prototypes.
   Source: aqiu384/megaten-fusion-tool @ f7d41c3, src/app/smt1/data/ (demon-data, skill-data,
   special-recipes, jap-demons). Upstream labels this module SNES; whether every number matches the
   PS1 release is not checked here. The recipe is upstream's special recipe (Shiva = Barong + Rangda),
   not computed by any engine. `resists` drops upstream's 8th character, as upstream's own
   compendium module does, leaving its 14 resist elements. */
(function () {
  const ELEMENTS = [
    ['Sword', 'Sw'], ['Gun', 'Gn'], ['Fire', 'Fi'], ['Ice', 'Ic'], ['Elec', 'El'], ['Force', 'Fo'], ['Nerve', 'Nv'],
    ['Expel', 'Ex'], ['Death', 'Dt'], ['Curse', 'Cu'], ['Bind', 'Bd'], ['Rush', 'Ru'], ['Punch', 'Pu'], ['Flying', 'Fl'],
  ];
  // Upstream resist codes: 1–7 and s take that many eighths of the damage; w is weak.
  const PCT = { 1: 12, 2: 25, 3: 37, s: 50, 5: 62, 6: 75, 7: 87 };
  const code = (ch) => {
    if (ch === '-') return null;
    if (PCT[ch]) return { k: 'rs', t: String(PCT[ch]), say: `takes ${PCT[ch]}%` };
    return { w: { k: 'wk', t: 'Wk', say: 'weak' }, n: { k: 'nu', t: 'Nu', say: 'nulls' },
      r: { k: 'rp', t: 'Rp', say: 'repels' }, d: { k: 'dr', t: 'Dr', say: 'drains' } }[ch];
  };
  const LIGHT = { l: 'Light', n: 'Neutral', d: 'Dark' };
  const LAW = { l: 'Law', n: 'Neutral', c: 'Chaos' };
  const alignOf = (a) => ({ light: LIGHT[a[0]], law: LAW[a[1]], key: a, say: `${LIGHT[a[0]]}, ${LAW[a[1]]}` });

  const raw = [
    { lv: 47, name: 'Agni', jp: 'アグニ', race: 'Tenma', align: 'lc', resists: '-sd96-s36-2s-6' },
    { lv: 53, name: 'Ravana', jp: 'ラーヴァナ', race: 'Tenma', align: 'lc', resists: '-s-s6-2nn626-2' },
    { lv: 54, name: 'Rangda', jp: 'ランダ', race: 'Femme', align: 'nc', resists: 'r6-66--36--366', tag: 'Parent' },
    { lv: 60, name: 'Yama', jp: 'ヤマ', race: 'Tenma', align: 'lc', resists: '-s-s6-2nn626-2' },
    { lv: 62, name: 'Barong', jp: 'バロン', race: 'Avatar', align: 'ln', resists: '-ww7w--n-7-6-s', tag: 'Parent' },
    { lv: 67, name: 'Indrajit', jp: 'インドラジット', race: 'Tenma', align: 'lc', resists: '-s66s722n226-s' },
    { lv: 73, name: 'Seiten Taisei', jp: 'セイテンタイセイ', race: 'Tenma', align: 'lc', resists: '-s66s722n226-s' },
    { lv: 80, name: 'Mahakala', jp: 'マハカーラ', race: 'Tenma', align: 'lc', resists: '-s66s722n226-s' },
    { lv: 88, name: 'Shiva', jp: 'シヴァ', race: 'Tenma', align: 'lc', resists: '-s-s6-2nn626-2', tag: 'Result' },
  ];
  const DEMONS = raw.map((d) => ({ ...d, res: [...d.resists].map(code), al: alignOf(d.align) }));
  const by = (n) => DEMONS.find((d) => d.name === n);

  const STAT_NAMES = ['HP', 'MP', 'St', 'In', 'Ma', 'Vi', 'Ag', 'Lu'];
  const stats = (v) => STAT_NAMES.map((k, i) => [k, v[i]]);
  // [name, MP cost or 0, element, target, effect]
  const SKILLS = {
    Penpatra: ['Penpatra', 4, 'Recovery', 'All allies', 'Cures 8 ailments'],
    'Fire Breath': ['Fire Breath', 0, 'Fire', 'Random foes', '5–8 hits'],
    'Bind Voice': ['Bind Voice', 0, 'Bind', '1 row of foes', 'Bind'],
    Shibaboo: ['Shibaboo', 3, 'Bind', 'Random foes', '1–3 hits, Bind'],
    'Marin Karin': ['Marin Karin', 6, 'Curse', '1 foe', 'Charm'],
    'Happy Step': ['Happy Step', 0, 'Curse', '1 row of foes', 'Happy'],
    Mazionga: ['Mazionga', 12, 'Elec', 'Random foes', '3–6 hits, Shock'],
    Zionga: ['Zionga', 9, 'Elec', '1 foe', 'Shock'],
    'Death Road': ['Death Road', 0, 'Death', '1 foe', 'Instant death'],
  };
  const PARENTS = [
    { ...by('Barong'), skills: ['Penpatra', 'Fire Breath', 'Bind Voice'].map((s) => SKILLS[s]), stats: stats([700, 100, 31, 13, 16, 17, 20, 12]) },
    { ...by('Rangda'), skills: ['Shibaboo', 'Marin Karin', 'Happy Step'].map((s) => SKILLS[s]), stats: stats([568, 142, 28, 10, 14, 15, 21, 8]), drop: 'Bead' },
  ];
  const RESULT = { ...by('Shiva'), skills: ['Mazionga', 'Zionga', 'Death Road'].map((s) => SKILLS[s]), stats: stats([960, 310, 37, 16, 19, 21, 26, 17]) };
  const RULE = { pair: ['Barong', 'Rangda'], makes: 'Shiva' };
  const TOTAL = 252; // demons in upstream demon-data.json
  // Demons per alignment over all 252 (upstream `align`: light/neutral/dark × law/neutral/chaos).
  const ALIGN_COUNTS = { ll: 31, ln: 12, lc: 25, nl: 30, nn: 35, nc: 50, dl: 23, dn: 13, dc: 33 };

  /* ---- shared rendering helpers (markup only; each prototype styles the classes) ---- */
  const cell = (c) => c
    ? `<span class="v ${c.k}" title="${c.say}">${c.t}</span>`
    : '<span class="v n" aria-label="neutral">–</span>';
  const head = ([e, ab]) => `<span class="h" title="${e}">${ab}</span>`;
  const strip = (res, withHead) => ELEMENTS.map((el, i) => `<span>${withHead ? head(el) : ''}${cell(res[i])}</span>`).join('');
  const stripHead = () => ELEMENTS.map((el) => `<span>${head(el)}</span>`).join('');
  const skillList = (skills) => skills.map(([n, mp, el, target, fx]) =>
    `<li><span class="sk">${n}</span><span class="mp">${mp ? `${mp} MP` : 'no MP'}</span><span class="fx">${el}, ${target}. ${fx}</span></li>`).join('');
  const sayRes = (res) => res.map((c, i) => c && `${ELEMENTS[i][0].toLowerCase()} ${c.say}`).filter(Boolean).join(', ');

  /* Live search over the demon rows; rows must be in DEMONS order. */
  function wireSearch(input, tbody) {
    input.addEventListener('input', () => {
      const t = input.value.trim().toLowerCase();
      [...tbody.rows].forEach((tr, i) => {
        const d = DEMONS[i];
        tr.hidden = !!t && !`${d.name} ${d.race} ${d.jp} ${d.al.say}`.toLowerCase().includes(t);
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

  window.SMT1 = { ELEMENTS, DEMONS, PARENTS, RESULT, RULE, TOTAL, ALIGN_COUNTS, LIGHT, LAW, cell, head, strip, stripHead, skillList, sayRes, wireSearch, wireToggles, moment };
})();
