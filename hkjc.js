/* Punter25 — HKJC race card paste reader.
   Accepts text copied from racing.hkjc.com (Race Card) or bet.hkjc.com race pages:
   - tab-separated table copy (desktop / most phones) → columns mapped by header names
   - one cell per line, or one runner per line with spaces → anchored on Brand No. (e.g. J463)
   Race headings ("Race 1 - SHEK MUN HANDICAP", date/venue/time, track/course/distance/going, class) are read too. */
(function (root) {
  'use strict';

  const COLS = {
    'horse no.': 'no', 'no.': 'no', 'horse no': 'no', 'no': 'no',
    'last 6 runs': 'last6', 'horse': 'name', 'horse name': 'name', 'name': 'name',
    'brand no.': 'brand', 'wt.': 'weight', 'handicap weight': 'weight', 'jockey': 'jockey', 'over wt.': 'overwt', 'probable overweight': 'overwt',
    'draw': 'draw', 'trainer': 'trainer', "int'l rtg.": 'intl', 'rtg.': 'rtg', 'rating': 'rtg', 'rtg.+/-': 'rtgChg', 'rating+/-': 'rtgChg',
    'horse wt. (declaration)': 'hwt', 'body wt.': 'hwt', 'wt.+/- (vs declaration)': 'hwtChg', 'best time': 'best', 'age': 'age',
    'sex': 'sex', 'season stakes': 'stakes', 'priority': 'priority', 'days since last run': 'days', 'gear': 'gear',
    'win': 'win', 'win odds': 'win', 'place': 'place'
  };
  const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const isBrand = t => /^[A-Z]\d{3}$/.test(t);
  const isNum = t => /^[+-]?\d+$/.test(t);
  const isGear = t => /^(?:[A-Z]{1,2}[-12]?)(?:\/[A-Z]{1,2}[-12]?)*$/.test(t) && !/^(ISG|PPG|PP|SG|VIS|HKJC)$/.test(t);
  const isLast6 = t => /^(?:\d{1,2}|-|[A-Z]{1,2})(?:\/(?:\d{1,2}|-|[A-Z]{1,2}))+$/.test(t);

  function parseHeader(block) {
    const h = {};
    const rm = block.match(/Race\s+(\d{1,2})\s*[-–]\s*([^\n\r]+)/i); if (rm) { h.no = +rm[1]; h.title = rm[2].trim(); }
    const dm = block.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),\s+(Sha Tin|Happy Valley|Conghua)[^,\n]*,\s+(\d{1,2}:\d{2})/i);
    if (dm) { const mo = MONTHS[dm[1].toLowerCase()]; if (mo) h.date = `${dm[3]}-${String(mo).padStart(2, '0')}-${dm[2].padStart(2, '0')}`; h.venue = dm[4].replace(/\b\w/g, c => c.toUpperCase()); h.time = dm[5].padStart(5, '0'); }
    const tm = block.match(/(Turf|All Weather Track|AWT)\s*,\s*(?:"([^"]+)"\s*Course\s*,\s*)?(\d{3,4})\s*M\s*(?:,\s*([A-Za-z ]+?))?\s*(?:\n|$)/i);
    if (tm) { h.surface = /turf/i.test(tm[1]) ? 'TURF' : 'AWT'; h.course = tm[2] || ''; h.distance = tm[3]; h.going = (tm[4] || '').trim(); }
    const cm = block.match(/Class\s+(\d)|(Group\s+(?:One|Two|Three|\d)|Griffin|Restricted)/i); if (cm) h.cls = cm[1] ? 'Class ' + cm[1] : cm[2];
    const rb = block.match(/Rating:\s*([\d]+-[\d]+)/i); if (rb) h.band = rb[1];
    return h;
  }

  function cleanJockey(j) {
    const m = String(j || '').trim().match(/^(.*?)\s*\((-\d+)\)\s*$/);
    return m ? { jockey: m[1].trim(), claim: m[2] } : { jockey: String(j || '').trim(), claim: '' };
  }

  // Tab-separated table with header row
  function parseTSV(lines) {
    const hi = lines.findIndex(l => l.includes('\t') && /(^|\t)\s*(Horse No\.?|No\.)\s*(\t|$)/i.test(l) && /\t\s*(Horse|Horse Name)\s*(\t|$)/i.test(l));
    if (hi < 0) return null;
    const head = lines[hi].split('\t').map(s => s.trim().toLowerCase());
    const map = head.map(h => COLS[h] || null);
    if (!map.includes('name')) return null;
    const out = [];
    for (let i = hi + 1; i < lines.length; i++) {
      const l = lines[i]; if (!l.includes('\t')) { if (out.length && /\S/.test(l)) break; else continue; }
      const c = l.split('\t').map(s => s.trim());
      const r = {}; map.forEach((k, j) => { if (k && c[j] != null && c[j] !== '') r[k] = c[j]; });
      if (!/^\d{1,2}$/.test(r.no || '') || !r.name) continue;
      out.push(r);
    }
    return out;
  }

  // Runner per line with spaces (no tabs)
  const ROW = /^(\d{1,2})\s+(?:((?:\d{1,2}|-|[A-Z]{1,2})(?:\/(?:\d{1,2}|-|[A-Z]{1,2}))+)\s+)?(.+?)\s+([A-Z]\d{3})\s+(\d{3})\s+(.+?)\s+(?:(\d{1,2})\s+)?(\d{1,2})\s+([A-Z][A-Za-z'.\- ]+?)\s+(-|\d{2,3})\s+(\d{1,3})\s+([+-]?\d{1,2})(?:\s+(.*))?$/;
  function tail(rest, r) {
    const t = (rest || '').split(/\s+/).filter(Boolean);
    const hw = t.find(x => /^\d{3,4}$/.test(x) && +x > 700); if (hw) r.hwt = hw;
    const bt = t.find(x => /^\d\.\d{2}\.\d{2}$/.test(x)); if (bt) r.best = bt;
    const gi = t.findIndex(isGear); if (gi >= 0) { r.gear = t[gi]; if (gi > 0 && /^\d{1,3}$/.test(t[gi - 1])) r.days = t[gi - 1]; }
  }
  function parseRows(lines) {
    const out = [];
    for (const l of lines) {
      const m = l.trim().match(ROW); if (!m) continue;
      const r = { no: m[1], last6: m[2] || '', name: m[3], brand: m[4], weight: m[5], jockey: m[6], overwt: m[7] || '', draw: m[8], trainer: m[9], intl: m[10], rtg: m[11], rtgChg: m[12] };
      tail(m[13], r); out.push(r);
    }
    return out.length ? out : null;
  }

  // One cell per line — anchor on Brand No.
  function parseCells(lines) {
    const t = lines.map(s => s.trim()).filter(Boolean);
    const out = [];
    for (let i = 0; i < t.length; i++) {
      if (!isBrand(t[i]) || !/^\d{3}$/.test(t[i + 1] || '')) continue;
      const r = { brand: t[i], name: t[i - 1], weight: t[i + 1], jockey: t[i + 2] };
      let k = i - 2;
      if (isLast6(t[k] || '')) { r.last6 = t[k]; k--; }
      if (!/^\d{1,2}$/.test(t[k] || '')) continue;
      r.no = t[k];
      let j = i + 3;
      if (/^\d{1,2}$/.test(t[j] || '') && /^\d{1,2}$/.test(t[j + 1] || '')) { r.overwt = t[j]; j++; }
      r.draw = t[j]; r.trainer = t[j + 1]; j += 2;
      if ((t[j] === '-' || /^\d{2,3}$/.test(t[j] || '')) && /^\d{1,3}$/.test(t[j + 1] || '') && isNum(t[j + 2] || '')) { r.intl = t[j]; r.rtg = t[j + 1]; r.rtgChg = t[j + 2]; j += 3; }
      else if (/^\d{1,3}$/.test(t[j] || '') && isNum(t[j + 1] || '')) { r.rtg = t[j]; r.rtgChg = t[j + 1]; j += 2; }
      let end = t.findIndex((x, n) => n > j && isBrand(x)); if (end < 0) end = t.length; else end = Math.max(j, end - 4);
      tail(t.slice(j, Math.min(end, j + 14)).join(' '), r);
      out.push(r);
    }
    return out.length ? out : null;
  }

  function finalise(raw, hdr) {
    const N = raw.length;
    return raw.map(r => {
      const j = cleanJockey(r.jockey);
      const runs = (r.last6 || '').split('/').map(x => +x).filter(x => x > 0); // most recent first
      const x = {
        no: +r.no, name: String(r.name || '').replace(/\s+/g, ' ').trim(), draw: r.draw || '', weight: r.weight || '',
        jockey: j.jockey, claim: j.claim, trainer: (r.trainer || '').trim(), last6: r.last6 || '', rtg: r.rtg ? +r.rtg : null,
        rtgChg: r.rtgChg != null && r.rtgChg !== '' ? +String(r.rtgChg).replace('+', '') : null, gear: r.gear || '', days: r.days || '',
        hwt: r.hwt || '', best: r.best || '', overwt: r.overwt || '', odds: r.win && +r.win > 1 ? String(+r.win) : ''
      };
      // seed ratings: Form (recent runs weighted), Class move (rating change), Draw (lower is better)
      const seed = {};
      if (runs.length) {
        const w = [6, 5, 4, 3, 2, 1]; let s = 0, ws = 0;
        runs.slice(0, 6).forEach((p, i) => { s += p * w[i]; ws += w[i]; });
        const av = s / ws; seed.form = av <= 2 ? 9 : av <= 3 ? 8 : av <= 4 ? 7 : av <= 5.5 ? 6 : av <= 7 ? 5 : av <= 9 ? 4 : 3;
      }
      if (x.rtgChg != null && !isNaN(x.rtgChg)) seed.class = Math.max(3, Math.min(8, Math.round(5 - x.rtgChg / 3)));
      const d = +x.draw; if (d && N > 1) seed.draw = Math.round(9 - 6 * (d - 1) / Math.max(1, Math.max(N, d) - 1));
      x.seed = seed;
      x.formFig = runs.length ? r.last6 : '';
      return x;
    }).sort((a, b) => a.no - b.no);
  }

  function parseHKJC(text) {
    const src = String(text || '').replace(/\r/g, '').replace(/\u00A0/g, ' ');
    const starts = []; const re = /^\s*Race\s+\d{1,2}\s*[-–]/gim; let m;
    while ((m = re.exec(src))) starts.push(m.index);
    const blocks = starts.length ? starts.map((s, i) => src.slice(s, starts[i + 1] || src.length)) : [src];
    if (starts.length && starts[0] > 0 && /\t|[A-Z]\d{3}/.test(src.slice(0, starts[0]))) blocks.unshift(src.slice(0, starts[0]));
    const races = []; const meeting = {};
    for (const b of blocks) {
      const lines = b.split('\n');
      const hdr = parseHeader(b);
      const raw = parseTSV(lines) || parseRows(lines) || parseCells(lines);
      if (!raw || !raw.length) continue;
      if (hdr.venue && !meeting.track) { meeting.track = hdr.venue; meeting.date = hdr.date; meeting.going = hdr.going; }
      const race = { no: hdr.no || null, time: hdr.time || '', distance: hdr.distance || '', surface: hdr.surface || '', cls: [hdr.cls, hdr.course ? `"${hdr.course}"` : '', hdr.band ? 'Rtg ' + hdr.band : ''].filter(Boolean).join(' · '),
        head: [hdr.title, hdr.going].filter(Boolean).join(' · '), going: hdr.going || '', runners: finalise(raw, hdr) };
      const ex = race.no && races.find(r => r.no === race.no);
      if (ex) { race.runners.forEach(rr => { const o = ex.runners.find(z => z.no === rr.no); if (o) { if (rr.odds) o.odds = rr.odds; } else ex.runners.push(rr); }); }
      else races.push(race);
    }
    const n = races.reduce((a, r) => a + r.runners.length, 0);
    return { layout: 'HK', meeting, races, runners: n, jockeys: races.reduce((a, r) => a + r.runners.filter(x => x.jockey).length, 0), trainers: races.reduce((a, r) => a + r.runners.filter(x => x.trainer).length, 0) };
  }

  const api = { parseHKJC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HKJC = api;
})(this);
