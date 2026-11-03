/* Guidebook prototype shell: the desk bar, the thumb index, the data model built from
   smt1-data.js, markup helpers, and the press run. Each page sets <body data-section="…">
   and calls GB.boot() at the end of <body>. */
(function () {
  const RAW = window.SMT1_RAW;

  /* ---------------------------------------------------------------- data */
  const ELEMENTS = [
    ['sword', 'Sword', 'Sw'], ['gun', 'Gun', 'Gn'], ['fire', 'Fire', 'Fi'], ['ice', 'Ice', 'Ic'], ['elec', 'Elec', 'El'],
    ['force', 'Force', 'Fo'], ['nerve', 'Nerve', 'Nv'], ['expel', 'Expel', 'Ex'], ['death', 'Death', 'Dt'], ['curse', 'Curse', 'Cu'],
    ['bind', 'Bind', 'Bd'], ['rush', 'Rush', 'Ru'], ['punch', 'Punch', 'Pu'], ['flying', 'Flying', 'Fl'],
  ];
  const SKILL_ELEMS = [...ELEMENTS.map(([k, n]) => [k, n]), ['almighty', 'Almighty'], ['energy', 'Energy'], ['recovery', 'Recovery'], ['support', 'Support'], ['special', 'Special']];
  const ELEM_NAME = Object.fromEntries(SKILL_ELEMS);
  // Upstream resist codes: 1–7 and s take that many eighths of the damage; w is weak.
  const PCT = { 1: 12, 2: 25, 3: 37, s: 50, 5: 62, 6: 75, 7: 87 };
  const code = (ch) => {
    if (ch === '-') return null;
    if (PCT[ch]) return { k: 'rs', t: String(PCT[ch]), say: `takes ${PCT[ch]}%` };
    const W = { w: 150, 8: 200, 9: 250, 0: 300 };
    if (W[ch]) return { k: 'wk', t: 'Wk', say: `weak, takes ${W[ch]}%` };
    return { n: { k: 'nu', t: 'Nu', say: 'nulls' }, r: { k: 'rp', t: 'Rp', say: 'repels' }, d: { k: 'dr', t: 'Dr', say: 'drains' }, D: { k: 'dr', t: 'Dr', say: 'drains' } }[ch] || null;
  };
  const LIGHT = { l: 'Light', n: 'Neutral', d: 'Dark' };
  const LAW = { l: 'Law', n: 'Neutral', c: 'Chaos' };
  const STAT_NAMES = ['HP', 'MP', 'St', 'In', 'Ma', 'Vi', 'Ag', 'Lu'];
  const ATK_NAMES = ['CP', 'NoA', 'P.Atk', 'P.Hit', 'Def', 'Eva', 'M.Atk', 'M.Hit'];
  const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const SPECIES_OF = {};
  RAW.SPECIES.forEach(([sp, races]) => races.forEach((r) => { SPECIES_OF[r] = sp; }));
  const SPECIAL_OF = Object.fromEntries(RAW.SPECIAL.map(([n, parts, prereq]) => [n, { parts, prereq }]));

  const DEMONS = RAW.D.map(([name, jp, race, lv, align, resists, skills, stats, atks, drop]) => ({
    // Upstream breaks level ties with decimals (64.1); the guide prints the level.
    name, jp, race, lv: Math.floor(lv), align, resists, skills, drop, id: slug(name),
    species: SPECIES_OF[race],
    res: [...resists].map(code),
    al: { light: LIGHT[align[0]], law: LAW[align[1]], say: `${LIGHT[align[0]]}, ${LAW[align[1]]}` },
    stats: STAT_NAMES.map((k, i) => [k, stats[i]]),
    atks: ATK_NAMES.map((k, i) => [k, atks[i]]),
    special: SPECIAL_OF[name] || null,
  }));
  const byName = Object.fromEntries(DEMONS.map((d) => [d.name, d]));
  const byId = Object.fromEntries(DEMONS.map((d) => [d.id, d]));

  const SKILLS = Object.entries(RAW.S).map(([name, [jp, el, mp, power, target, effect]]) => ({
    name, jp, el, mp, power, target, effect, id: slug(name),
    users: DEMONS.filter((d) => d.skills.includes(name)).map((d) => d.name),
  }));
  const skillByName = Object.fromEntries(SKILLS.map((s) => [s.name, s]));

  /* ---------------------------------------------------------------- markup */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cell = (c) => c ? `<span class="v ${c.k}" title="${c.say}">${c.t}</span>` : '<span class="v n" aria-label="neutral">–</span>';
  const head = ([, n, ab]) => `<span class="h" title="${n}">${ab}</span>`;
  const strip = (res, withHead) => ELEMENTS.map((el, i) => `<span>${withHead ? head(el) : ''}${cell(res[i])}</span>`).join('');
  const stripHead = () => ELEMENTS.map((el) => `<span>${head(el)}</span>`).join('');
  const demonLink = (d, label = d.name) => `<a href="demon.html#${d.id}">${esc(label)}</a>`;
  const ruby = (d, cls = '') => `<ruby class="${cls}">${esc(d.name)}<rt lang="ja">${d.jp}</rt></ruby>`;
  const skillLine = (s) => {
    const what = [ELEM_NAME[s.el], s.target, s.power ? `power ${s.power}` : '', s.effect].filter(Boolean).join(', ');
    return `<li><span class="sk"><a href="skills.html#${s.id}">${esc(s.name)}</a></span><span class="mp">${s.mp ? `${s.mp} MP` : 'no MP'}</span><span class="fx">${esc(what)}</span></li>`;
  };
  const skillList = (names) => names.map((n) => skillLine(skillByName[n])).join('');
  const statsTable = (d) => `<table class="stats"><thead><tr>${d.stats.map(([k]) => `<th scope="col">${k}</th>`).join('')}</tr></thead>
    <tbody><tr>${d.stats.map(([, v]) => `<td>${v}</td>`).join('')}</tr></tbody></table>`;

  /* ---------------------------------------------------------------- shell */
  const SECTIONS = [
    ['fusion', 'fusion.html', '合体', 'Fusion'],
    ['compendium', 'compendium.html', '全書', 'Compendium'],
    ['demons', 'demons.html', '悪魔', 'Demons'],
    ['skills', 'skills.html', 'スキル', 'Skills'],
    ['settings', 'settings.html', '設定', 'Settings'],
  ];
  function shell() {
    const here = document.body.dataset.section;
    const desk = document.querySelector('[data-desk]');
    if (desk) {
      desk.innerHTML = `
        <a class="desk__brand" href="fusion.html">SMT Companion</a>
        <label class="vh" for="game">Game</label>
        <select class="desk__game" id="game">
          <option>Persona 5 Royal</option><option>Persona 4 Golden</option><option>Persona 3 Reload</option>
          <option>SMT III: Nocturne</option><option selected>Shin Megami Tensei (PS1)</option>
        </select>
        <form class="desk__search" role="search" data-search>
          <label class="vh" for="gsearch">Find a demon</label>
          <input id="gsearch" list="gsearch-list" placeholder="Find a demon, then Enter" autocomplete="off" />
          <datalist id="gsearch-list">${DEMONS.map((d) => `<option value="${esc(d.name)}"></option>`).join('')}</datalist>
        </form>
        <span class="desk__count"><b>${DEMONS.length}</b> demons</span>`;
      desk.querySelector('[data-search]').addEventListener('submit', (e) => {
        e.preventDefault();
        const q = desk.querySelector('#gsearch').value.trim().toLowerCase();
        const hit = DEMONS.find((d) => d.name.toLowerCase() === q) || DEMONS.find((d) => d.name.toLowerCase().startsWith(q));
        if (hit) location.href = `demon.html#${hit.id}`;
      });
    }
    const thumbs = document.querySelector('[data-thumbs]');
    if (thumbs) {
      thumbs.setAttribute('aria-label', 'Sections');
      thumbs.innerHTML = SECTIONS.map(([id, href, jp, en]) =>
        `<li><a href="${href}"${id === here ? ' aria-current="page"' : ''}><span class="jp" lang="ja" aria-hidden="true">${jp}</span><span class="en">${en}</span></a></li>`).join('');
    }
    document.querySelectorAll('[data-seg]').forEach(wireToggles);
  }

  /* aria-pressed toggle group. */
  function wireToggles(root) {
    const btns = [...root.querySelectorAll('button')];
    btns.forEach((b) => b.addEventListener('click', () => btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)))));
  }

  /* ---------------------------------------------------------------- the press run
     The page's one orchestrated moment, played on the first page of a visit (and in
     every gallery preview): the sheet is set down on the desk, the blue plate prints
     out of register and is pulled into line in two jolts, then the halftone inks in.
     Moving between sections afterwards is a page turn instead (guidebook.css). Any
     click or key skips straight to the end state; reduced motion shows only that. */
  const pressed = [];
  function press() {
    const root = document.documentElement;
    const sheet = document.querySelector('.sheet');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let first = true;
    try { first = !sessionStorage.getItem('gb-pressed'); sessionStorage.setItem('gb-pressed', '1'); } catch { /* storage blocked: play it */ }
    if (root.classList.contains('is-preview')) first = true;
    const set = (x, y, r, ink) => {
      root.style.setProperty('--mx', `${x}px`);
      root.style.setProperty('--my', `${y}px`);
      root.style.setProperty('--mr', `${r}deg`);
      if (ink != null) root.style.setProperty('--ink-in', ink);
    };
    let timers = [];
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      set(0, 0, 0, 1);
      sheet?.classList.remove('is-lifted');
      setTimeout(() => { root.classList.remove('press-jolt', 'press-ink'); sheet?.classList.remove('is-landing'); }, 450);
      pressed.forEach((fn) => fn());
    };
    if (still || !first || !sheet) return end();
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    set(8, -5, 0.25, 0);
    sheet.classList.add('is-lifted');
    requestAnimationFrame(() => requestAnimationFrame(() => { sheet.classList.add('is-landing'); sheet.classList.remove('is-lifted'); }));
    at(380, () => { root.classList.add('press-jolt'); set(3, -2, 0.08); });
    at(640, () => set(0, 0, 0));
    at(820, () => { root.classList.add('press-ink'); root.style.setProperty('--ink-in', 1); });
    at(1300, end);
    document.addEventListener('pointerdown', end, { once: true });
    document.addEventListener('keydown', end, { once: true });
  }

  function boot() {
    shell();
    press();
  }

  if (location.hash === '#preview') document.documentElement.classList.add('is-preview');

  window.GB = {
    ELEMENTS, SKILL_ELEMS, ELEM_NAME, DEMONS, SKILLS, byName, byId, skillByName, RACES: RAW.RACES, SPECIES: RAW.SPECIES,
    SPECIAL: RAW.SPECIAL, CHART: RAW.CHART, ELEM: RAW.ELEM, LIGHT, LAW,
    esc, slug, cell, strip, stripHead, demonLink, ruby, skillLine, skillList, statsTable, wireToggles,
    boot, onPressed: (fn) => pressed.push(fn),
  };
})();
