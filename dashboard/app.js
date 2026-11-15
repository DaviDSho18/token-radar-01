/* Offline by design: the board, its evidence and its exact farm plans share one dataset. */
(function () {
  'use strict';
  var D = window.RADAR;
  var root = document.getElementById('board');
  if (!D || !D.rows.length) { root.textContent = 'Board data is missing. Run main.ts to generate data.js.'; return; }
  var state = { q: '', category: 'all', scope: 'all', tab: 'pre', sort: 'value', dir: -1, page: 0 };
  var size = 30;
  var params = new URLSearchParams(location.hash.slice(1));
  ['q', 'category', 'scope', 'tab'].forEach(function (key) { if (params.has(key)) state[key] = params.get(key); });
  if (['all', 'watch', 'early'].indexOf(state.scope) < 0) state.scope = 'all';
  if (state.tab !== 'live') state.tab = 'pre';
  var selected = params.get('p');
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function usd(n) {
    if (n == null || !isFinite(n)) return 'Not reported';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return money.format(n);
  }
  function pct(n) { return n == null ? 'Not reported' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function age(n) { return n == null ? 'Unknown' : n >= 365 ? (n / 365).toFixed(1) + 'y' : n + 'd'; }
  function node(tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') e.textContent = attrs[key];
      else if (key === 'class') e.className = attrs[key];
      else if (key.slice(0, 2) === 'on') e.addEventListener(key.slice(2), attrs[key]);
      else if (attrs[key] != null) e.setAttribute(key, attrs[key]);
    });
    Array.prototype.slice.call(arguments, 2).flat().forEach(function (child) {
      if (child != null) e.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return e;
  }
  function button(text, fn, cls) { return node('button', { type: 'button', text: text, onclick: fn, class: cls || '' }); }
  function syncHash() {
    var p = new URLSearchParams();
    ['q', 'category', 'scope', 'tab'].forEach(function (key) {
      if (state[key] !== ({ q: '', category: 'all', scope: 'all', tab: 'pre' })[key]) p.set(key, state[key]);
    });
    if (selected) p.set('p', selected);
    history.replaceState(null, '', location.pathname + location.search + (p.size ? '#' + p.toString() : ''));
  }
  function parts(r) {
    var m = D.model;
    var g = Math.min(m.growth_cap, Math.max(m.growth_floor, r.change_7d == null ? 0 : r.change_7d));
    var growth = 1 + m.growth_weight * (g < 0 ? 2 * g / 100 : g / (100 + g));
    var days = r.age_days == null ? m.unknown_age_days : r.age_days;
    var maturity = m.maturity_floor + Math.sqrt(Math.min(Math.max(days, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    return { growth: growth, maturity: maturity, value: Math.max(1, Math.round(r.tvl_usd * m.base_multiple * growth * maturity)) };
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return (state.tab === 'live' ? D.live : D.rows).filter(function (r) {
      return (state.category === 'all' || (r.category || 'Other') === state.category)
        && (state.tab === 'live' || state.scope === 'all' || (state.scope === 'watch' ? r.watchlisted : !r.watchlisted))
        && (!q || [r.name, r.slug, r.category, r.chains.join(' ')].join(' ').toLowerCase().indexOf(q) >= 0);
    });
  }
  function sorted(list) {
    function value(r) {
      if (state.sort === 'name') return r.name.toLowerCase();
      if (state.sort === 'growth') return r.change_7d;
      if (state.sort === 'age') return r.age_days;
      if (state.sort === 'tvl') return r.tvl_usd;
      return state.tab === 'live' ? r.mcap_usd : r.implied_value_usd;
    }
    return list.slice().sort(function (a, b) {
      var av = value(a), bv = value(b);
      if (av == null && bv != null) return 1;
      if (bv == null && av != null) return -1;
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function change() { state.page = 0; syncHash(); update(); }
  var theme = button('Dark mode', function () {
    var dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    theme.textContent = dark ? 'Light mode' : 'Dark mode';
    theme.setAttribute('aria-pressed', String(dark));
  }, 'quiet');
  theme.setAttribute('aria-pressed', 'false');
  var top = D.rows[0];
  root.appendChild(node('div', { class: 'shell' },
    node('header', { class: 'masthead' },
      node('div', { class: 'brand' }, node('span', { class: 'radar-mark', 'aria-hidden': 'true' }), 'TOKEN / RADAR'),
      node('div', { class: 'stamp' }, node('span', { text: 'SEALED SNAPSHOT · ' + D.as_of }), theme)),
    node('section', { class: 'intro', 'aria-labelledby': 'title' },
      node('div', null, node('p', { class: 'eyebrow', text: 'RESEARCH DESK / ' + D.model_version }),
        node('h1', { id: 'title', text: 'Before the token.\nBeyond the hype.' }),
        node('p', { class: 'dek', text: 'A snapshot-led ranking of protocols with no token recorded. Compare hypothetical token values, inspect the assumptions, and plan a small, reversible test—not a promised airdrop.' })),
      node('aside', { class: 'leader' }, node('p', { class: 'eyebrow', text: '01 / HIGHEST IMPLIED VALUE' }),
        node('strong', { class: 'hero', text: usd(top.implied_value_usd) }),
        button(top.name + ' ↗', function () { openDetail(top.slug); }, 'leader-link'),
        node('p', { class: 'small', text: 'Hypothetical market-cap proxy · not FDV or a farmer payout' }))),
    node('section', { class: 'metrics', 'aria-label': 'Full snapshot coverage, independent of filters' },
      metric(D.watchlist_size + '/' + D.watchlist_size, 'Watchlist covered'),
      metric(D.board_size, 'Protocols ranked'), metric(D.early_size, 'Below-floor candidates'), metric(D.live_size, 'Token-recorded comparators')),
    node('section', { class: 'workspace', 'aria-label': 'Protocol explorer' })
  ));
  function metric(value, label) { return node('div', { class: 'metric' }, node('strong', { text: String(value) }), node('span', { text: label })); }
  var space = root.querySelector('.workspace');
  var pre = button('No token recorded', function () { state.tab = 'pre'; change(); }, 'tab');
  var live = button('Token recorded · ' + D.live_size, function () { state.tab = 'live'; change(); }, 'tab');
  var search = node('input', { id: 'search', type: 'search', placeholder: 'Name, category, or chain', value: state.q, oninput: function () { state.q = search.value; change(); } });
  function select(id, values, current, onChange) {
    var e = node('select', { id: id, onchange: function () { onChange(e.value); change(); } });
    values.forEach(function (v) { e.appendChild(node('option', { value: v[0], text: v[1] })); });
    e.value = current;
    if (!e.value) e.value = 'all';
    return e;
  }
  var categories = Array.from(new Set(D.rows.concat(D.live).map(function (r) { return r.category || 'Other'; }))).sort();
  var category = select('category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; });
  state.category = category.value;
  var scope = select('scope', [['all', 'All candidates'], ['watch', 'Watchlist only'], ['early', 'Early · below floor']], state.scope, function (v) { state.scope = v; });
  function field(label, id, control) { return node('div', { class: 'field' }, node('label', { for: id, text: label }), control); }
  space.appendChild(node('div', { class: 'toolbar' }, node('div', { class: 'tabs', 'aria-label': 'Token record' }, pre, live), node('span', { class: 'small', text: 'DefiLlama index · offline / no live prices' })));
  space.appendChild(node('div', { class: 'filters' }, field('Search protocols', 'search', search), field('Category', 'category', category), field('Universe', 'scope', scope),
    button('Reset', function () { state.q = ''; state.category = state.scope = 'all'; search.value = ''; category.value = scope.value = 'all'; change(); }, 'quiet')));
  var count = node('p', { class: 'results', role: 'status', 'aria-live': 'polite' });
  var content = node('div', { class: 'table-panel' });
  var pager = node('nav', { class: 'pager', 'aria-label': 'Board pages' });
  space.append(count, content, pager);
  root.querySelector('.shell').appendChild(node('section', { class: 'method' },
    node('div', null, node('p', { class: 'eyebrow', text: 'THE MODEL / NO NAME-BASED OVERRIDES' }), node('h2', { text: 'A value anchor, not a price target.' })),
    node('div', null,
      node('p', { class: 'formula', text: 'TVL × ' + D.model.base_multiple + ' × bounded momentum × listing maturity' }),
      node('p', { text: 'Positive growth saturates; outflows carry twice the momentum weight. Maturity rises with the square root of listing age and stops at ' + D.model.maturity_days + ' days. Missing growth is neutral; unknown age uses ' + D.model.unknown_age_days + ' days. Inspect any row to reproduce the arithmetic.' }),
      node('p', { class: 'small', text: 'Assumptions, not fitted parameters. TVL is not revenue and can be double-counted. Listing age is not operating age or proof of time without a token. There are no supply, unlock, fee, allocation or campaign data. A large implied value does not imply a large reward.' }),
      node('p', { class: 'small', text: 'Universe: every supplied watchlist slug plus up to 160 below-floor candidates by TVL, excluding obvious token wrappers, bridges, exchange products and versioned pools. No token recorded is not proof of no token; comparators have token identifiers and may have no reported market cap.' })))
  );
  function heading(key, text) {
    var active = state.sort === key;
    var th = node('th', { scope: 'col', 'aria-sort': active ? (state.dir < 0 ? 'descending' : 'ascending') : 'none' });
    th.appendChild(button(text + (active ? (state.dir < 0 ? ' ↓' : ' ↑') : ''), function () {
      if (active) state.dir *= -1; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      update();
      var target = content.querySelector('[data-sort="' + key + '"] button');
      if (target) target.focus();
    }));
    th.dataset.sort = key;
    return th;
  }
  function update() {
    var isLive = state.tab === 'live';
    pre.setAttribute('aria-pressed', String(!isLive)); live.setAttribute('aria-pressed', String(isLive));
    scope.disabled = isLive;
    var list = sorted(filtered());
    state.page = Math.min(state.page, Math.max(0, Math.ceil(list.length / size) - 1));
    var start = state.page * size;
    count.textContent = list.length + ' matching ' + (isLive ? 'comparators' : 'candidates') + ' · ' + (list.length ? (start + 1) + '–' + Math.min(start + size, list.length) : '0') + ' shown · global ranks stay fixed';
    content.replaceChildren();
    if (!list.length) {
      content.appendChild(node('div', { class: 'empty' }, node('h2', { text: 'No matches in this universe' }), node('p', { text: 'Try another category, token record, or reset the filters.' })));
    } else {
      var body = node('tbody');
      list.slice(start, start + size).forEach(function (r) {
        var detail = isLive ? node('strong', { text: r.name }) : button(r.name + ' ↗', function () { openDetail(r.slug); }, 'protocol-link');
        body.appendChild(node('tr', null,
          node('td', { class: 'number rank', text: isLive ? '—' : String(r.rank).padStart(2, '0') }),
          node('td', null, node('div', { class: 'protocol' }, detail, node('span', { class: 'small', text: (r.category || 'Other') + ' · ' + (r.chains.slice(0, 2).join(', ') || 'Chain not reported') }))),
          node('td', { class: 'number', text: usd(r.tvl_usd), title: money.format(r.tvl_usd) }),
          node('td', { class: 'number', text: pct(r.change_7d) }),
          node('td', { class: 'number', text: isLive ? '—' : age(r.age_days) }),
          node('td', { class: 'number value', text: usd(isLive ? r.mcap_usd : r.implied_value_usd), title: (isLive && r.mcap_usd == null) ? 'Market cap not reported' : money.format(isLive ? r.mcap_usd : r.implied_value_usd) }),
          node('td', null, node('span', { class: 'badge', text: isLive ? 'Token recorded' : r.watchlisted ? 'Watchlist' : 'Early' }))));
      });
      content.appendChild(node('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Scrollable protocol table' },
        node('table', null, node('caption', { class: 'sr-only', text: isLive ? 'Token-recorded comparators; market caps are reported, not estimated.' : 'Hypothetical token market-cap proxies in USD. Select a protocol for evidence and its farm plan.' }),
          node('thead', null, node('tr', null, node('th', { scope: 'col', text: '#' }), heading('name', 'Protocol'), heading('tvl', 'TVL'), heading('growth', '7d TVL'), heading('age', 'Listed age'), heading('value', isLive ? 'Market cap' : 'Implied value'), node('th', { scope: 'col', text: 'Universe' }))), body)));
    }
    pager.replaceChildren();
    var prev = button('← Previous', function () { state.page--; update(); pager.querySelector('button').focus(); }, 'quiet');
    var next = button('Next →', function () { state.page++; update(); pager.querySelector('button:last-child').focus(); }, 'quiet');
    prev.disabled = state.page === 0; next.disabled = start + size >= list.length;
    pager.append(prev, node('span', { class: 'small', text: 'Page ' + (state.page + 1) + ' of ' + Math.max(1, Math.ceil(list.length / size)) }), next);
  }
  var dialog = node('dialog', { class: 'detail', 'aria-labelledby': 'detail-title' });
  var trigger = null;
  root.appendChild(dialog);
  dialog.addEventListener('close', function () { selected = null; syncHash(); if (trigger && trigger.isConnected) trigger.focus(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) { var b = dialog.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) dialog.close(); } });
  function datum(label, value) { return node('div', { class: 'datum' }, node('dt', { text: label }), node('dd', { text: value })); }
  function openDetail(slug) {
    var r = D.rows.find(function (row) { return row.slug === slug; });
    if (!r) return;
    trigger = document.activeElement;
    selected = slug; syncHash();
    var p = parts(r);
    dialog.replaceChildren(node('header', { class: 'detail-head' },
      node('div', null, node('p', { class: 'eyebrow', text: 'RESEARCH NOTE / RANK ' + r.rank + ' OF ' + D.board_size }), node('h2', { id: 'detail-title', text: r.name }), node('p', { class: 'small', text: (r.category || 'Other') + ' · ' + (r.chains.join(', ') || 'Chain not reported') })),
      button('Close ×', function () { dialog.close(); }, 'quiet')));
    dialog.appendChild(node('div', { class: 'detail-grid' },
      node('section', { class: 'evidence' }, node('p', { class: 'eyebrow', text: 'HYPOTHETICAL TOKEN VALUE' }), node('strong', { class: 'detail-value', text: usd(r.implied_value_usd) }),
        node('p', { class: 'small', text: 'Market-cap proxy, not FDV. No launch date or allocation is implied.' }),
        node('dl', null, datum('Snapshot TVL', usd(r.tvl_usd)), datum('Base TVL multiple', D.model.base_multiple + '×'), datum('7d TVL change', pct(r.change_7d)), datum('Bounded momentum', p.growth.toFixed(4) + '×'), datum('Listed age', age(r.age_days)), datum('Listing maturity', p.maturity.toFixed(4) + '×')),
        node('p', { class: 'audit', text: (p.value === r.implied_value_usd ? '✓ Arithmetic verified: ' : '⚠ Data mismatch: ') + money.format(p.value) }),
        node('h3', { text: 'Read the uncertainty' }),
        node('p', { class: 'small', text: 'TVL × ' + D.model.base_multiple + ' × momentum × maturity, rounded to $1. Momentum = 1 + ' + D.model.growth_weight + ' × (2g/100 for outflows; g/(100+g) for inflows), with g clamped to [' + D.model.growth_floor + ', ' + D.model.growth_cap + ']%. Maturity = ' + D.model.maturity_floor + ' + ' + D.model.maturity_range + ' × √(min(age, ' + D.model.maturity_days + ')/' + D.model.maturity_days + ').' }),
        node('p', { class: 'small', text: (r.change_7d == null ? 'Growth is missing: neutral momentum used. ' : '') + (r.age_days == null ? 'Age is missing: ' + D.model.unknown_age_days + '-day prior used. ' : 'Age starts at index listing, not launch. ') + 'No token recorded does not prove a token does not exist. This model is an assumption, not a calibrated forecast.' })),
      node('section', { class: 'plan' }, node('p', { class: 'eyebrow', text: 'OPTIONAL FARM WORKFLOW / CAPITAL AT RISK' }), node('h3', { text: 'Verify → test → review → exit' }),
        node('p', { class: 'small', text: 'These are research checkpoints, not confirmed campaign rules. Budgets and gas ranges are illustrative. Skip any unsupported or unsuitable action; rewards may be zero.' }),
        node('ol', { class: 'steps' }, (r.farm_steps || ['No verified workflow available. Do not deposit until the app and its eligibility rules are checked.']).map(function (step) {
          var at = step.indexOf(' Cost: ');
          return node('li', null, node('p', { text: at < 0 ? step : step.slice(0, at) }), at < 0 ? null : node('p', { class: 'small cost', text: step.slice(at + 1) }));
        })))
    ));
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  update();
  root.setAttribute('aria-busy', 'false');
  if (selected) openDetail(selected);
})();
