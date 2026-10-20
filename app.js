/* Punter25 — personal Punters Challenge selection tool.
   All data is stored on this device (localStorage). No bets are placed. */
(function () {
  'use strict';

  // ---------- Region profiles ----------
  const REGIONS = {
    SA: {
      name: 'South Africa', pdf: true,
      going: ['Good', 'Good to Soft', 'Soft', 'Heavy', 'Firm', 'Polytrack', 'Sand'],
      factors: [
        ['form', 'Form', 0.18], ['class', 'Class', 0.13], ['dist', 'Distance', 0.11],
        ['going', 'Going', 0.08], ['draw', 'Draw', 0.12], ['jt', 'Jockey/Trainer', 0.12],
        ['l600', 'Last 600m', 0.14], ['claim', 'Weight/Claim', 0.06], ['bias', 'Track bias', 0.06]
      ]
    },
    HK: {
      name: 'Hong Kong', pdf: false,
      going: ['Good to Firm', 'Good', 'Good to Yielding', 'Yielding', 'Soft', 'Wet Fast', 'Wet Slow', 'AWT'],
      factors: [
        ['form', 'Form', 0.18], ['class', 'Class move', 0.14], ['dist', 'Distance', 0.10],
        ['draw', 'Draw', 0.16], ['pace', 'Early pace', 0.14], ['jt', 'Jockey/Trainer', 0.16],
        ['course', 'ST/HV fit', 0.12]
      ]
    },
    UK: {
      name: 'United Kingdom', pdf: true,
      going: ['Firm', 'Good to Firm', 'Good', 'Good to Soft', 'Soft', 'Heavy', 'Standard', 'Standard to Slow'],
      factors: [
        ['form', 'Form', 0.20], ['class', 'Class', 0.14], ['dist', 'Distance', 0.12],
        ['going', 'Going', 0.16], ['cd', 'Course form', 0.10], ['draw', 'Draw', 0.08],
        ['jt', 'Jockey/Trainer', 0.12], ['surf', 'Turf/AW', 0.08]
      ]
    }
  };

  // ---------- Storage ----------
  const KEY = 'punter25.v1';
  const uid = () => Math.random().toString(36).slice(2, 10);
  const today = () => new Date().toISOString().slice(0, 10);
  let mem = null;
  function load() {
    try { const raw = window.localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* storage unavailable */ }
    return mem;
  }
  function save() {
    mem = S;
    try { window.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* in-memory only */ }
  }
  const defaults = () => ({
    region: 'SA', tab: 'card', trust: 0.6, meetings: [], active: { SA: null, HK: null, UK: null },
    weights: Object.fromEntries(Object.entries(REGIONS).map(([k, r]) => [k, Object.fromEntries(r.factors.map(f => [f[0], f[2]]))]))
  });
  let S = Object.assign(defaults(), load() || {});
  for (const k of Object.keys(REGIONS)) {
    S.weights[k] = Object.assign(Object.fromEntries(REGIONS[k].factors.map(f => [f[0], f[2]])), S.weights[k] || {});
  }
  const ui = { open: {}, edit: null, pdfText: '', pdfRaces: [], pdfPick: null, preview: null };

  // ---------- Helpers ----------
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 1) => (n == null || isNaN(n)) ? '–' : Number(n).toFixed(d);
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200); }

  // Odds: "5/2", "5-2", "EVS", "11/10", or decimal "3.5" → decimal odds (stake included)
  function dec(odds) {
    if (odds == null) return null;
    const s = String(odds).trim().toUpperCase();
    if (!s) return null;
    if (s === 'EVS' || s === 'EVENS' || s === 'EV') return 2;
    const m = s.match(/^(\d+(?:\.\d+)?)\s*[\/\-]\s*(\d+(?:\.\d+)?)$/);
    if (m) { const b = +m[2]; return b ? 1 + (+m[1]) / b : null; }
    const d = parseFloat(s);
    return isFinite(d) && d > 1 ? d : null;
  }

  const meeting = () => S.meetings.find(m => m.id === S.active[S.region]) || null;
  const regionMeetings = () => S.meetings.filter(m => m.region === S.region).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const field = race => race.runners.filter(r => !r.scr);

  // ---------- Model ----------
  // Rating 0–100 from weighted 1–10 factor scores. Win probability = blend of rating softmax and market.
  function analyse(race, region) {
    const R = REGIONS[region], W = S.weights[region];
    const tot = R.factors.reduce((a, f) => a + (+W[f[0]] || 0), 0) || 1;
    const live = field(race);
    const out = new Map();
    if (!live.length) return out;
    const ratings = live.map(r => R.factors.reduce((a, f) => a + ((+W[f[0]] || 0) / tot) * (+(r.f || {})[f[0]] || 5) * 10, 0));
    const T = 7;
    const ex = ratings.map(x => Math.exp(x / T)); const exS = ex.reduce((a, b) => a + b, 0);
    const pm = ex.map(x => x / exS);
    const imp = live.map(r => { const d = dec(r.odds); return d ? 1 / d : null; });
    const haveMkt = imp.filter(x => x != null).length >= Math.max(2, Math.ceil(live.length / 2));
    let pk = null;
    if (haveMkt) {
      const fill = Math.min(...imp.filter(x => x != null)) * 0.5;
      const raw = imp.map(x => x == null ? fill : x); const s = raw.reduce((a, b) => a + b, 0);
      pk = raw.map(x => x / s);
    }
    const spread = Math.max(...ratings) - Math.min(...ratings);
    const a = haveMkt ? (spread < 0.01 ? 0 : S.trust) : 1; // unrated card → follow the market
    const p = pm.map((x, i) => a * x + (1 - a) * (pk ? pk[i] : 0));
    const N = live.length;
    // Harville place probabilities
    const p2 = p.map((pi, i) => p.reduce((acc, pj, j) => j === i || pj >= 1 ? acc : acc + pj * pi / (1 - pj), 0));
    const p3 = p.map((pi, i) => {
      let acc = 0;
      for (let j = 0; j < N; j++) { if (j === i) continue;
        for (let k = 0; k < N; k++) { if (k === i || k === j) continue;
          const d1 = 1 - p[j], d2 = 1 - p[j] - p[k];
          if (d1 > 0 && d2 > 0) acc += p[j] * (p[k] / d1) * (pi / d2);
        } }
      return acc;
    });
    live.forEach((r, i) => {
      const d = dec(r.odds) || 0;
      const rest = Math.max(0, 1 - p[i] - p2[i] - p3[i]);
      const ep = p[i] * (N + d) + p2[i] * (N - 1) + p3[i] * (N - 2) + rest * Math.max(0, (N - 2) / 2);
      out.set(r.id, { rating: ratings[i], pwin: p[i], ptop3: p[i] + p2[i] + p3[i], ep, d });
    });
    // flags
    let best = null, bank = null, val = null;
    for (const r of live) { const x = out.get(r.id);
      if (!best || x.ep > out.get(best).ep) best = r.id;
      if (!bank || x.ptop3 > out.get(bank).ptop3) bank = r.id;
      if (x.d >= 6 && (!val || x.ep > out.get(val).ep)) val = r.id; }
    out.best = best; out.bank = bank; out.val = val === best ? null : val;
    return out;
  }

  function scoreRace(race) {
    const res = race.result; if (!res || !res.pos) return null;
    if (res.override !== '' && res.override != null && !isNaN(+res.override)) return +res.override;
    const N = +race.fieldSize || field(race).length;
    const pos = +res.pos;
    let pts = Math.max(0, N - pos + 1);
    if (pos === 1) { const selR = race.runners.find(x => x.id === race.selId); const sp = (res.sp != null && res.sp !== '') ? res.sp : (selR && selR.odds); pts += dec(sp) || 0; }
    return pts;
  }

  // ---------- Rendering ----------
  function render() {
    document.querySelectorAll('.regions button').forEach(b => b.setAttribute('aria-selected', b.dataset.region === S.region));
    document.querySelectorAll('.tabs button').forEach(b => { if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const ms = regionMeetings();
    const sel = $('#meetingSelect');
    sel.innerHTML = ms.length ? ms.map(m => `<option value="${m.id}" ${m.id === S.active[S.region] ? 'selected' : ''}>${esc(m.date)} · ${esc(m.track || 'Untitled')}${m.card ? ' — ' + esc(m.card) : ''}</option>`).join('') : '<option value="">No meetings yet</option>';
    sel.disabled = !ms.length;
    if (!meeting() && ms.length) S.active[S.region] = ms[0].id;
    const v = $('#view');
    v.innerHTML = ({ card: viewCard, import: viewImport, slip: viewSlip, stats: viewStats })[S.tab]();
  }

  function noMeeting(extra) {
    return `<div class="panel empty"><b>No ${esc(REGIONS[S.region].name)} meeting yet</b>Create a meeting to start building today's card.${extra || ''}<div style="margin-top:14px"><button class="btn" data-action="new-meeting">+ New meeting</button></div></div>`;
  }

  function viewCard() {
    const m = meeting(); if (!m) return noMeeting();
    const R = REGIONS[S.region];
    let h = `<div class="panel"><h2>Meeting</h2><div class="grid">
      <div><label>Date</label><input type="date" data-m="date" value="${esc(m.date)}"></div>
      <div><label>Track</label><input data-m="track" value="${esc(m.track)}" placeholder="${S.region === 'HK' ? 'Sha Tin' : S.region === 'UK' ? 'Ascot' : 'Durbanville'}"></div>
      <div><label>Card name</label><input data-m="card" value="${esc(m.card)}" placeholder="Punters Challenge"></div>
      <div><label>Going / surface</label><select data-m="going">${R.going.map(g => `<option ${g === m.going ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
    </div><div class="row" style="margin-top:12px">
      <button class="btn" data-action="add-race">+ Add race</button>
      <button class="btn quiet" data-action="auto-all">Auto-select all races</button>
      <button class="btn danger sm" data-action="del-meeting" style="margin-left:auto">Delete meeting</button>
    </div></div>`;
    if (!m.races.length) {
      h += `<div class="panel empty"><b>No races on this card</b>${R.pdf ? 'Add races manually, or use the Import tab to load your Computaform PDF.' : 'Add each race, then enter runners manually or with Quick add.'}</div>`;
    }
    m.races.slice().sort((a, b) => a.no - b.no).forEach(r => { h += raceBlock(m, r); });
    return h;
  }

  function raceBlock(m, race) {
    const R = REGIONS[m.region];
    const A = analyse(race, m.region);
    const sel = race.runners.find(x => x.id === race.selId);
    const open = ui.open[race.id];
    const pts = scoreRace(race);
    let h = `<article class="race ${open ? '' : 'closed'}" data-race="${race.id}">
      <div class="race-head" data-action="toggle-race">
        <div class="race-no">R${esc(race.no)}</div>
        <div class="race-meta"><div class="t">${esc(race.time || '--:--')} · ${esc(race.distance || '?')}${race.distance && /^\d+$/.test(race.distance) ? 'm' : ''}</div>
          <div class="s">${esc(race.cls || 'Class n/a')} · ${field(race).length} runners${pts != null ? ` · <span style="color:var(--green)">${fmt(pts)} pts</span>` : ''}</div></div>
        <div class="pick">${sel ? `Selection<b>#${esc(sel.no)} ${esc(sel.name)}</b>` : '<span style="color:var(--faint)">No selection</span>'}</div>
      </div>`;
    if (!open) return h + '</article>';
    h += `<div class="race-body"><div class="grid">
        <div><label>Race no.</label><input type="number" min="1" data-r="no" value="${esc(race.no)}"></div>
        <div><label>Time</label><input type="time" data-r="time" value="${esc(race.time)}"></div>
        <div><label>Distance (m)</label><input data-r="distance" value="${esc(race.distance)}" inputmode="numeric"></div>
        <div><label>Class</label><input data-r="cls" value="${esc(race.cls)}"></div>
      </div>`;
    if (race.runners.length) {
      h += `<div class="scroll" style="margin-top:12px"><table class="tbl"><thead><tr><th></th><th>No</th><th>Horse</th><th class="n hide-sm">Dr</th><th class="n hide-sm">Wt</th><th class="n">Odds</th><th class="n">Rtg</th><th class="n">Win%</th><th class="n">xPts</th></tr></thead><tbody>`;
      race.runners.slice().sort((a, b) => (+a.no || 99) - (+b.no || 99)).forEach(r => {
        const x = A.get(r.id);
        const tags = x ? (r.id === A.best ? '<span class="tag ai">TOP</span>' : '') + (r.id === A.bank ? '<span class="tag bank">BANKER</span>' : '') + (r.id === A.val ? '<span class="tag val">VALUE</span>' : '') : '';
        h += `<tr class="${r.id === race.selId ? 'sel' : ''} ${r.scr ? 'scr' : ''}">
          <td><input class="radio" type="radio" name="sel-${race.id}" data-action="select" data-id="${r.id}" ${r.id === race.selId ? 'checked' : ''} ${r.scr ? 'disabled' : ''} aria-label="Select ${esc(r.name)}"></td>
          <td class="n">${esc(r.no)}</td>
          <td><button class="name" style="all:unset;cursor:pointer;font-weight:600" data-action="edit-runner" data-id="${r.id}">${esc(r.name || 'Unnamed')}</button>${tags}<span class="sub">${esc([r.jockey, r.trainer].filter(Boolean).join(' / ') || 'Tap name to rate')}</span></td>
          <td class="n hide-sm">${esc(r.draw)}</td><td class="n hide-sm">${esc(r.weight)}</td>
          <td class="n">${esc(r.odds || '–')}</td>
          <td class="n">${x ? fmt(x.rating, 0) : '–'}</td>
          <td class="n">${x ? fmt(x.pwin * 100, 0) : '–'}</td>
          <td class="n"><b>${x ? fmt(x.ep) : '–'}</b></td></tr>`;
        if (ui.edit === r.id) h += `<tr><td colspan="9" style="padding:0">${runnerEditor(r, R)}</td></tr>`;
      });
      h += `</tbody></table></div>`;
    } else {
      h += `<p class="hint" style="margin-top:12px">No runners yet. Add them one by one, or use Quick add (one per line: <code>No, Horse, Draw, Weight, Odds</code>).</p>`;
    }
    h += `<div class="row" style="margin-top:12px">
        <button class="btn sm" data-action="add-runner">+ Runner</button>
        <button class="btn quiet sm" data-action="quick-add">Quick add</button>
        <button class="btn quiet sm" data-action="auto">Auto-select best</button>
        <button class="btn danger sm" data-action="del-race" style="margin-left:auto">Delete race</button>
      </div>`;
    if (ui.quick === race.id) {
      h += `<div class="editor"><label>Quick add — one runner per line: No, Horse, Draw, Weight, Odds</label>
        <textarea data-quick style="min-height:120px" placeholder="1, Golden Arrow, 4, 60, 5/2&#10;2, Silver Bullet, 7, 58.5, 8/1"></textarea>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-action="quick-save">Add runners</button><button class="btn quiet sm" data-action="quick-cancel">Cancel</button></div></div>`;
    }
    const res = race.result || {};
    h += `<div class="result">
        <div><label>Your horse finished</label><input type="number" min="1" data-res="pos" value="${esc(res.pos)}" placeholder="Position"></div>
        <div><label>SP (if it won)</label><input data-res="sp" value="${esc(res.sp != null ? res.sp : (sel ? sel.odds : ''))}" placeholder="e.g. 12/1"></div>
        <div><label>Points override</label><input data-res="override" value="${esc(res.override)}" placeholder="Dead-heat etc."></div>
        <div class="points" aria-label="Points">${pts != null ? fmt(pts) + ' pts' : ''}</div>
      </div>
      <p class="hint" style="margin:8px 0 0">Points = field size − position + 1. A winner also earns its SP as decimal odds (e.g. 12/1 → +13). Disqualified = last. Field size: <input style="width:70px;min-height:32px;padding:4px 6px;display:inline-block" type="number" data-r="fieldSize" value="${esc(race.fieldSize || '')}" placeholder="${field(race).length}"></p>
    </div></article>`;
    return h;
  }

  function runnerEditor(r, R) {
    return `<div class="editor" data-runner="${r.id}"><div class="grid">
      <div><label>No</label><input type="number" data-x="no" value="${esc(r.no)}"></div>
      <div style="grid-column:span 2"><label>Horse</label><input data-x="name" value="${esc(r.name)}"></div>
      <div><label>Jockey</label><input data-x="jockey" value="${esc(r.jockey)}"></div>
      <div><label>Trainer</label><input data-x="trainer" value="${esc(r.trainer)}"></div>
      <div><label>Draw</label><input data-x="draw" value="${esc(r.draw)}" inputmode="numeric"></div>
      <div><label>Weight</label><input data-x="weight" value="${esc(r.weight)}"></div>
      <div><label>Odds</label><input data-x="odds" value="${esc(r.odds)}" placeholder="5/1"></div>
      <div style="grid-column:span 2"><label>Form / notes</label><input data-x="form" value="${esc(r.form)}" placeholder="e.g. 1-3-2, 2nd last 600m"></div>
    </div>
    <h3 style="margin-top:12px">Ratings 1–10</h3>
    <div class="factors">${R.factors.map(f => `<div><label>${f[1]}</label><input type="number" min="1" max="10" step="1" inputmode="numeric" data-f="${f[0]}" value="${esc((r.f || {})[f[0]] ?? 5)}"></div>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn sm" data-action="close-edit">Done</button>
      <button class="btn quiet sm" data-action="scratch" data-id="${r.id}">${r.scr ? 'Reinstate' : 'Scratched'}</button>
      <button class="btn danger sm" data-action="del-runner" data-id="${r.id}" style="margin-left:auto">Remove</button></div></div>`;
  }

  function viewImport() {
    const R = REGIONS[S.region];
    if (!R.pdf) return `<div class="panel"><h2>Hong Kong — manual entry</h2><p class="hint">Computaform isn't available for Hong Kong, so the PDF import is switched off here. On the Card tab, add each race and enter runners with <b>+ Runner</b> or <b>Quick add</b> (paste lines like <code>1, Horse, Draw, Weight, Odds</code> from the HKJC race card).</p><button class="btn" data-tab-go="card">Go to Card</button></div>`;
    const m = meeting();
    if (!m) return noMeeting('<br>The import adds races to the selected meeting.');
    let h = `<div class="panel"><h2>Computaform PDF</h2>
      <p class="hint">Upload your ${R.name} Computaform PDF. The text is read on your device — nothing is uploaded anywhere.</p>
      <div class="row"><input type="file" id="pdfFile" accept="application/pdf,.pdf" style="flex:1;min-width:200px"><button class="btn" data-action="pdf-extract">Extract text</button></div>
      <p class="hint" style="margin:10px 0 0">Scanned (image) PDFs can't be read — copy the text from your PDF reader and paste it below instead.</p></div>
      <div class="panel"><h2>Race-card text</h2>
      <textarea id="pdfText" placeholder="Extracted or pasted Computaform text appears here. You can edit it before importing.">${esc(ui.pdfText)}</textarea>
      <div class="row" style="margin-top:10px"><button class="btn quiet" data-action="pdf-split">Find races</button></div>`;
    if (ui.pdfRaces.length) {
      h += `<h3 style="margin-top:14px">Races found</h3><div class="chips">${ui.pdfRaces.map((r, i) => `<button class="chip" data-action="pdf-pick" data-i="${i}" aria-pressed="${ui.pdfPick === i}">Race ${r.no} · ${r.runners.length} runners</button>`).join('')}</div>
        <div class="row"><button class="btn" data-action="pdf-import-all">Import all ${ui.pdfRaces.length} races</button></div>`;
    }
    if (ui.pdfPick != null && ui.pdfRaces[ui.pdfPick]) {
      const pr = ui.pdfRaces[ui.pdfPick];
      h += `<h3 style="margin-top:16px">Race ${pr.no} preview</h3><p class="hint">${esc(pr.head || '')}</p>
        <div class="scroll"><table class="tbl"><thead><tr><th>No</th><th>Horse</th><th class="n">Dr</th><th class="n">Wt</th><th class="n">Odds</th></tr></thead><tbody>
        ${pr.runners.map(r => `<tr><td>${esc(r.no)}</td><td class="name">${esc(r.name)}<span class="sub">${esc(r.jockey || '')}</span></td><td class="n">${esc(r.draw)}</td><td class="n">${esc(r.weight)}</td><td class="n">${esc(r.odds)}</td></tr>`).join('') || '<tr><td colspan="5">No runner lines detected in this race.</td></tr>'}
        </tbody></table></div>
        <div class="row" style="margin-top:10px"><button class="btn" data-action="pdf-import-one">Import race ${pr.no}</button></div>`;
    }
    h += `<p class="hint" style="margin-top:14px">Always check names, draws, weights and odds after importing — Computaform layouts vary, so the import is a starting point.</p></div>`;
    return h;
  }

  function slipText(m) {
    const lines = [`PUNTER25 — ${m.track || 'Meeting'} ${m.date} (${m.region})`, m.card ? m.card : '', ''];
    m.races.slice().sort((a, b) => a.no - b.no).forEach(r => {
      const A = analyse(r, m.region); const s = r.runners.find(x => x.id === r.selId);
      const flag = s ? (s.id === A.bank ? ' BANKER' : s.id === A.val ? ' VALUE' : '') : '';
      lines.push(`R${r.no}${r.time ? ' ' + r.time : ''}  ` + (s ? `#${s.no} ${s.name}${s.odds ? ' (' + s.odds + ')' : ''}${flag}` : '— no selection —'));
    });
    return lines.filter((l, i) => l !== '' || i === 2).join('\n');
  }

  function viewSlip() {
    const m = meeting(); if (!m) return noMeeting();
    const missing = m.races.filter(r => !r.selId).length;
    let xp = 0; m.races.forEach(r => { const A = analyse(r, m.region); const x = r.selId && A.get(r.selId); if (x) xp += x.ep; });
    return `<div class="panel"><h2>Selection slip</h2>
      ${missing ? `<p class="hint" style="color:var(--red)">${missing} race${missing > 1 ? 's have' : ' has'} no selection — a missed race scores zero.</p>` : '<p class="hint">Every race has a selection. Submit at least 5 minutes before the first race.</p>'}
      <div class="slip" id="slipText">${esc(slipText(m))}</div>
      <p class="hint" style="margin-top:10px">Projected total: <b style="color:var(--gold)">${fmt(xp)} pts</b></p>
      <div class="row noprint"><button class="btn" data-action="copy-slip">Copy</button><button class="btn quiet" data-action="share-slip">Share</button><button class="btn quiet" data-action="print">Print</button></div></div>`;
  }

  function viewStats() {
    const rows = []; const by = {};
    for (const m of S.meetings) {
      let mp = 0, ms = 0;
      for (const r of m.races) { const p = scoreRace(r); if (p == null) continue;
        const pos = +r.result.pos; rows.push({ region: m.region, p, pos }); mp += p; ms++; }
      m._pts = mp; m._scored = ms;
    }
    const agg = list => ({ n: list.length, pts: list.reduce((a, b) => a + b.p, 0), w: list.filter(x => x.pos === 1).length, t3: list.filter(x => x.pos <= 3).length });
    const all = agg(rows);
    for (const k of Object.keys(REGIONS)) by[k] = agg(rows.filter(r => r.region === k));
    const R = REGIONS[S.region], W = S.weights[S.region];
    const hist = S.meetings.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return `<div class="stats">
      <div class="stat"><span>Races scored</span><b>${all.n}</b></div>
      <div class="stat"><span>Total points</span><b>${fmt(all.pts)}</b></div>
      <div class="stat"><span>Avg / race</span><b>${all.n ? fmt(all.pts / all.n) : '–'}</b></div>
      <div class="stat"><span>Winners</span><b>${all.w}</b></div>
      <div class="stat"><span>Top-3 rate</span><b>${all.n ? fmt(all.t3 / all.n * 100, 0) + '%' : '–'}</b></div>
    </div>
    <div class="panel"><h2>By region</h2><div class="scroll"><table class="tbl"><thead><tr><th>Region</th><th class="n">Races</th><th class="n">Points</th><th class="n">Avg</th><th class="n">Wins</th><th class="n">Top 3</th></tr></thead><tbody>
      ${Object.keys(REGIONS).map(k => `<tr><td>${REGIONS[k].name}</td><td class="n">${by[k].n}</td><td class="n">${fmt(by[k].pts)}</td><td class="n">${by[k].n ? fmt(by[k].pts / by[k].n) : '–'}</td><td class="n">${by[k].w}</td><td class="n">${by[k].n ? fmt(by[k].t3 / by[k].n * 100, 0) + '%' : '–'}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="panel"><h2>Meeting history</h2>${hist.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th>Meeting</th><th class="n">Scored</th><th class="n">Points</th></tr></thead><tbody>${hist.map(m => `<tr><td>${esc(m.date)}</td><td>${esc(m.track || 'Untitled')} <span class="tag ai">${m.region}</span></td><td class="n">${m._scored}/${m.races.length}</td><td class="n">${fmt(m._pts)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">No meetings yet.</p>'}</div>
    <div class="panel"><h2>Model — ${R.name}</h2>
      <p class="hint">Factor weights for ${R.name} (relative; they're normalised automatically).</p>
      <div class="factors">${R.factors.map(f => `<div><label>${f[1]}</label><input type="number" step="0.01" min="0" data-w="${f[0]}" value="${W[f[0]]}"></div>`).join('')}</div>
      <div style="margin-top:14px"><label for="trust">Trust in your ratings vs the market: <b id="trustVal">${Math.round(S.trust * 100)}%</b></label>
      <input id="trust" type="range" min="0" max="1" step="0.05" value="${S.trust}" style="padding:0;min-height:30px;accent-color:var(--gold)"></div>
      <div class="row" style="margin-top:10px"><button class="btn quiet sm" data-action="reset-weights">Reset weights</button></div></div>
    <div class="panel"><h2>Backup</h2><p class="hint">Your data lives in this browser only. Export a backup regularly, and import it on another device.</p>
      <div class="row"><button class="btn" data-action="export">Export backup</button>
      <label class="btn quiet" style="margin:0;color:var(--text);font-size:var(--text-sm)">Import backup<input type="file" id="importFile" accept=".json,application/json" style="display:none"></label>
      <button class="btn danger" data-action="reset-all" style="margin-left:auto">Erase all data</button></div></div>`;
  }

  // ---------- Computaform parsing ----------
  function linesFromItems(items) {
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]), x = it.transform[4];
      let row = rows.find(r => Math.abs(r.y - y) <= 2);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, s: it.str, w: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map(r => { r.parts.sort((a, b) => a.x - b.x);
      let out = '', end = null;
      for (const p of r.parts) { if (end != null) out += (p.x - end > 12 ? '   ' : (p.x - end > 1.5 ? ' ' : '')); out += p.s; end = p.x + p.w; }
      return out.replace(/\s+$/, ''); });
  }

  async function extractPdf(file) {
    if (!window.pdfjsLib) throw new Error('PDF reader did not load — check your internet connection.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i); const tc = await pg.getTextContent();
      pages.push(linesFromItems(tc.items).join('\n'));
    }
    return pages.join('\n\n');
  }

  const STOP = /^(RACE|PRIZE|STAKES?|HANDICAP|MAIDEN|MERIT|RATED|POOL|TOTE|JACKPOT|PICK|PLACE|TRIFECTA|QUARTET|EXACTA|SWINGER|BETTING|TIPS?|SELECTIONS?|DISTANCE|WEIGHT|DRAW|JOCKEY|TRAINER|PAGE|COMPUTAFORM|FORM|GOING|CLASS|OWNER|BREEDER|AGE|SEX|COLOURS?)$/;
  function parseRunnerLine(line, region) {
    let s = line.replace(/\t/g, ' ').trim();
    if (!s) return null;
    if (s.includes(',')) { // CSV quick format
      const c = s.split(',').map(x => x.trim());
      if (/^\d{1,2}$/.test(c[0]) && c[1] && /[A-Za-z]/.test(c[1])) return { no: +c[0], name: c[1], draw: c[2] || '', weight: c[3] || '', odds: c[4] || '', jockey: c[5] || '', trainer: c[6] || '' };
    }
    const m = s.match(/^(\d{1,2})[.)]?\s+(.*)$/);
    if (!m) return null;
    const no = +m[1]; if (no < 1 || no > 24) return null;
    const rest = m[2];
    const toks = rest.split(/\s+/);
    const nameT = [];
    for (const t of toks) {
      const clean = t.replace(/[(),]/g, '');
      if (/^[A-Z][A-Z'’\-.]*$/.test(clean) && clean.length >= 1) { nameT.push(clean); if (nameT.length >= 5) break; continue; }
      break;
    }
    let name = nameT.join(' ');
    if (name.length < 3 || nameT.some(w => STOP.test(w)) && nameT.length <= 2) {
      // fallback: Title Case names
      const t = rest.match(/^([A-Z][a-z'’]+(?:\s+(?:[A-Z][a-z'’]+|Of|The|And|De|Du|La|Le)){0,4})/);
      if (!t) return null; name = t[1];
    }
    if (/^\d/.test(name) || STOP.test(name)) return null;
    const after = rest.slice(rest.indexOf(nameT.length ? nameT[nameT.length - 1] : name) + (nameT.length ? nameT[nameT.length - 1].length : name.length));
    let draw = (after.match(/\((\d{1,2})\)/) || after.match(/\b(?:Dr|Draw|D)[:.]?\s*(\d{1,2})\b/i) || [])[1] || '';
    let weight = '';
    if (region === 'UK') weight = (after.match(/\b((?:[7-9]|1[0-2])-(?:[0-9]|1[0-3]))\b/) || [])[1] || '';
    if (!weight) weight = (after.match(/\b((?:4[5-9]|5\d|6[0-6])(?:[.,][05])?)\s*(?:kg)?\b/i) || [])[1] || '';
    const odds = (after.match(/\b(\d{1,3}\/\d{1,3}|EVS|EVENS)\b/i) || [])[1] || '';
    const jk = (after.match(/\b(?:J|Jockey)[:.]\s*([A-Z][A-Za-z'’.\- ]{2,24}?)(?=\s{2,}|\s+T[:.]|\s+\d|\s+EVS|\s+EVENS|$)/) || [])[1] || '';
    const tr = (after.match(/\b(?:T|Trainer)[:.]\s*([A-Z][A-Za-z'’.\- ]{2,24}?)(?=\s{2,}|\s+\d|\s+EVS|\s+EVENS|$)/) || [])[1] || '';
    return { no, name: name.replace(/\s+/g, ' ').trim(), draw, weight, odds: odds.toUpperCase() === 'EVENS' ? 'EVS' : odds, jockey: jk.trim(), trainer: tr.trim() };
  }

  function splitRaces(text, region) {
    const lines = text.split(/\r?\n/);
    const races = []; let cur = null;
    const head = /\bRACE\s*(?:NO\.?\s*)?(\d{1,2})\b/i;
    for (const ln of lines) {
      const h = ln.match(head);
      if (h && (ln.trim().length < 140) && (!cur || +h[1] !== cur.no)) {
        const no = +h[1];
        const existing = races.find(r => r.no === no);
        if (existing) { cur = existing; continue; }
        cur = { no, head: ln.trim().slice(0, 120), lines: [] }; races.push(cur); continue;
      }
      if (cur) cur.lines.push(ln);
    }
    if (!races.length && text.trim()) races.push({ no: 1, head: 'Pasted text (no race headings found)', lines });
    for (const r of races) {
      const seen = new Map();
      for (const ln of r.lines) { const p = parseRunnerLine(ln, region); if (p && !seen.has(p.no)) seen.set(p.no, p); }
      r.runners = [...seen.values()].sort((a, b) => a.no - b.no);
      const dm = r.head.match(/(\d{3,4})\s?m\b/i); r.distance = dm ? dm[1] : '';
      const tm = r.head.match(/\b(\d{1,2}[:h.]\d{2})\b/); r.time = tm ? tm[1].replace(/[h.]/, ':').padStart(5, '0') : '';
    }
    return races.filter(r => r.runners.length || races.length === 1);
  }

  function importParsed(pr) {
    const m = meeting(); if (!m) return;
    let race = m.races.find(r => +r.no === +pr.no);
    if (!race) { race = newRace(m, pr.no); }
    if (pr.distance && !race.distance) race.distance = pr.distance;
    if (pr.time && !race.time) race.time = pr.time;
    for (const p of pr.runners) {
      const ex = race.runners.find(r => +r.no === +p.no);
      if (ex) Object.assign(ex, Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '')));
      else race.runners.push(newRunner(p));
    }
    return race;
  }

  // ---------- Mutations ----------
  function newMeeting() {
    const m = { id: uid(), region: S.region, date: today(), track: '', card: 'Punters Challenge', going: REGIONS[S.region].going[0], races: [] };
    S.meetings.push(m); S.active[S.region] = m.id; save(); return m;
  }
  function newRace(m, no) {
    const r = { id: uid(), no: no || (m.races.reduce((a, x) => Math.max(a, +x.no || 0), 0) + 1), time: '', distance: '', cls: '', runners: [], selId: null, result: {} };
    m.races.push(r); return r;
  }
  function newRunner(p) {
    const f = {}; REGIONS[S.region].factors.forEach(x => f[x[0]] = 5);
    return Object.assign({ id: uid(), no: '', name: '', jockey: '', trainer: '', draw: '', weight: '', odds: '', form: '', f, scr: false }, p || {});
  }
  const findRace = el => { const m = meeting(); const id = el.closest('[data-race]')?.dataset.race; return m && m.races.find(r => r.id === id); };
  function autoPick(race) { const A = analyse(race, meeting().region); if (A.best) race.selId = A.best; return !!A.best; }

  // ---------- Events ----------
  document.addEventListener('click', async e => {
    const rb = e.target.closest('.regions button'); if (rb) { S.region = rb.dataset.region; ui.edit = null; ui.pdfRaces = []; ui.pdfPick = null; save(); return render(); }
    const tb = e.target.closest('.tabs button, [data-tab-go]'); if (tb) { S.tab = tb.dataset.tab || tb.dataset.tabGo; save(); render(); return window.scrollTo(0, 0); }
    const chip = e.target.closest('[data-action]'); if (!chip) return;
    const a = chip.dataset.action; const m = meeting();
    switch (a) {
      case 'new-meeting': newMeeting(); S.tab = 'card'; toast('New meeting created'); break;
      case 'del-meeting': if (!confirm('Delete this meeting and all its races?')) return; S.meetings = S.meetings.filter(x => x !== m); S.active[S.region] = null; break;
      case 'add-race': { const r = newRace(m); ui.open[r.id] = true; break; }
      case 'auto-all': { let n = 0; m.races.forEach(r => { if (autoPick(r)) n++; }); toast(n ? `Selections made for ${n} race${n > 1 ? 's' : ''}` : 'Add runners first'); break; }
      case 'toggle-race': { const r = findRace(chip); ui.open[r.id] = !ui.open[r.id]; ui.edit = null; break; }
      case 'del-race': { const r = findRace(chip); if (!confirm(`Delete race ${r.no}?`)) return; m.races = m.races.filter(x => x !== r); break; }
      case 'add-runner': { const r = findRace(chip); const nx = newRunner({ no: r.runners.reduce((a2, x) => Math.max(a2, +x.no || 0), 0) + 1 }); r.runners.push(nx); ui.edit = nx.id; break; }
      case 'quick-add': ui.quick = findRace(chip).id; break;
      case 'quick-cancel': ui.quick = null; break;
      case 'quick-save': { const r = findRace(chip); const txt = chip.closest('.editor').querySelector('[data-quick]').value; let n = 0;
        txt.split(/\r?\n/).forEach(l => { const p = parseRunnerLine(l, S.region); if (p) { const ex = r.runners.find(x => +x.no === p.no); if (ex) Object.assign(ex, p); else r.runners.push(newRunner(p)); n++; } });
        ui.quick = null; toast(n ? `${n} runner${n > 1 ? 's' : ''} added` : 'No runner lines recognised'); break; }
      case 'select': { const r = findRace(chip); r.selId = chip.dataset.id; break; }
      case 'auto': { const r = findRace(chip); toast(autoPick(r) ? 'Best expected-points runner selected' : 'Add runners first'); break; }
      case 'edit-runner': ui.edit = ui.edit === chip.dataset.id ? null : chip.dataset.id; break;
      case 'close-edit': ui.edit = null; break;
      case 'scratch': { const r = findRace(chip); const x = r.runners.find(y => y.id === chip.dataset.id); x.scr = !x.scr; if (x.scr && r.selId === x.id) r.selId = null; break; }
      case 'del-runner': { const r = findRace(chip); r.runners = r.runners.filter(y => y.id !== chip.dataset.id); if (r.selId === chip.dataset.id) r.selId = null; ui.edit = null; break; }
      case 'pdf-extract': {
        const f = $('#pdfFile').files[0]; if (!f) return toast('Choose a PDF first');
        chip.disabled = true; chip.textContent = 'Reading…';
        try { ui.pdfText = await extractPdf(f); ui.pdfRaces = splitRaces(ui.pdfText, S.region); ui.pdfPick = ui.pdfRaces.length ? 0 : null;
          toast(ui.pdfText.trim() ? `Text extracted — ${ui.pdfRaces.length} race${ui.pdfRaces.length === 1 ? '' : 's'} found` : 'No text found — this PDF may be scanned');
        } catch (err) { toast('Could not read PDF: ' + err.message); }
        break; }
      case 'pdf-split': ui.pdfText = $('#pdfText').value; ui.pdfRaces = splitRaces(ui.pdfText, S.region); ui.pdfPick = ui.pdfRaces.length ? 0 : null; toast(`${ui.pdfRaces.length} race${ui.pdfRaces.length === 1 ? '' : 's'} found`); break;
      case 'pdf-pick': ui.pdfPick = +chip.dataset.i; break;
      case 'pdf-import-one': { const r = importParsed(ui.pdfRaces[ui.pdfPick]); ui.open[r.id] = true; toast(`Race ${r.no} imported — check it on the Card tab`); break; }
      case 'pdf-import-all': { ui.pdfRaces.forEach(importParsed); toast(`${ui.pdfRaces.length} races imported`); S.tab = 'card'; break; }
      case 'copy-slip': { const t = slipText(m); try { await navigator.clipboard.writeText(t); toast('Slip copied'); } catch (err) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Slip copied'); } return; }
      case 'share-slip': { const t = slipText(m); if (navigator.share) { try { await navigator.share({ title: 'Punter25 selections', text: t }); } catch (err) { /* cancelled */ } } else { toast('Sharing not supported here — use Copy'); } return; }
      case 'print': window.print(); return;
      case 'reset-weights': S.weights[S.region] = Object.fromEntries(REGIONS[S.region].factors.map(f => [f[0], f[2]])); toast('Weights reset'); break;
      case 'export': { const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = `punter25-backup-${today()}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); return; }
      case 'reset-all': if (!confirm('Erase ALL meetings, selections and results on this device?')) return; S = defaults(); toast('All data erased'); break;
      default: return;
    }
    save(); render();
  });

  document.addEventListener('change', e => {
    const t = e.target; const m = meeting();
    if (t.id === 'meetingSelect') { S.active[S.region] = t.value; ui.edit = null; save(); return render(); }
    if (t.id === 'pdfText') { ui.pdfText = t.value; return; }
    if (t.id === 'trust') { S.trust = +t.value; save(); return render(); }
    if (t.id === 'importFile') { const f = t.files[0]; if (!f) return; f.text().then(txt => { try { const d = JSON.parse(txt); if (!Array.isArray(d.meetings)) throw 0; S = Object.assign(defaults(), d); save(); render(); toast('Backup imported'); } catch (err) { toast('That file is not a Punter25 backup'); } }); return; }
    if (t.dataset.w) { S.weights[S.region][t.dataset.w] = Math.max(0, +t.value || 0); save(); return; }
    if (!m) return;
    if (t.dataset.m) { m[t.dataset.m] = t.value; save(); return render(); }
    const race = t.closest('[data-race]') && findRace(t); if (!race) return;
    if (t.dataset.r) { race[t.dataset.r] = t.dataset.r === 'no' ? +t.value : t.value; save(); return render(); }
    if (t.dataset.res) { race.result = race.result || {}; race.result[t.dataset.res] = t.value; save(); return render(); }
    const ed = t.closest('[data-runner]');
    if (ed) { const r = race.runners.find(x => x.id === ed.dataset.runner); if (!r) return;
      if (t.dataset.x) r[t.dataset.x] = t.value;
      if (t.dataset.f) { r.f = r.f || {}; r.f[t.dataset.f] = Math.min(10, Math.max(1, Math.round(+t.value || 5))); }
      save(); render();
      const again = document.querySelector(`[data-runner="${r.id}"] [data-${t.dataset.x ? 'x' : 'f'}="${t.dataset.x || t.dataset.f}"]`);
      if (again) { const all = [...document.querySelectorAll(`[data-runner="${r.id}"] input`)]; const i = all.indexOf(again); (all[i + 1] || again).focus(); }
    }
  });
  document.addEventListener('input', e => { if (e.target.id === 'trust') { const v = $('#trustVal'); if (v) v.textContent = Math.round(e.target.value * 100) + '%'; } });

  window.Punter25 = { dec, parseRunnerLine, splitRaces, analyse, scoreRace }; // for testing
  render();
})();
