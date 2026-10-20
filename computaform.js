/* Punter25 — Computaform PDF layout reader.
   Works on pdf.js text items ({x, y, w, s, str}) per page and understands:
   - "FIELDS, RATINGS FOR ..." pages (two races side by side): No-Draw, horse, weight,
     stars (X/XX/XXX), comment, Computaform odds (F/B), Computaform & Speed ratings
   - "JOCKEY INDEX" / "TRAINER INDEX" pages: fills jockey and trainer per runner */
(function (root) {
  'use strict';

  function clean(s) {
    return s
      .replace(/\uFFFD{2,}/g, ' … ')
      .replace(/(\d)\uFFFD(\d)/g, '$1.$2')
      .replace(/\uFFFD/g, '.')
      .replace(/[\u00A0\u2009]/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .trim();
  }

  // Group items into rows (same baseline) and join them, marking wide gaps with " | ".
  function rows(items, tol, gapBar) {
    tol = tol || 2.5; gapBar = gapBar || 6;
    const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const out = [];
    for (const it of sorted) {
      let r = out.length ? out[out.length - 1] : null;
      if (!r || Math.abs(r.y - it.y) > tol) { r = { y: it.y, items: [] }; out.push(r); }
      r.items.push(it);
    }
    for (const r of out) {
      r.items.sort((a, b) => a.x - b.x);
      let t = '', end = null;
      for (const it of r.items) {
        if (end != null) { const g = it.x - end; t += g > gapBar ? ' | ' : g > 0.8 ? ' ' : ''; }
        t += it.str; end = it.x + (it.w || 0);
      }
      r.text = clean(t);
    }
    return out;
  }

  const pageText = p => p.items.map(i => i.str).join(' ');
  const titleCase = s => s.toLowerCase().replace(/(^|[\s(\-'’])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const normName = s => String(s || '').toUpperCase().replace(/\([A-Z]{2,3}\)/g, '').replace(/[^A-Z0-9]/g, '');

  const MONTHS = { JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 };

  function parseHeader(t) {
    const h = { title: t };
    const tm = t.match(/\b(\d{1,2}):(\d{2})\b/); if (tm) h.time = tm[1].padStart(2, '0') + ':' + tm[2];
    const dm = t.match(/\b(\d{3,4})\s?m\b\s*(TURF|POLY(?:TRACK)?|SAND|AWT|DIRT)?/i);
    if (dm) { h.distance = dm[1]; h.surface = (dm[2] || '').toUpperCase(); }
    const pm = t.match(/R\s?(\d{1,3}(?:[ ,]\d{3})+)/); if (pm) h.prize = 'R' + pm[1].replace(/ /g, ',');
    const cls = t.match(/(MAIDEN\s+(?:JUVENILE\s+)?PLATE(?:\s*\([^)]*\))?|MR\s?\d+\s+HANDICAP(?:\s*\([^)]*\))?|CLASS\s+\d|[A-F]\s+STAKES|GRADE\s+\d[^0-9]*?(?=\s\d{3,4}m)|FM\s?\d+\s+HANDICAP|HANDICAP|PLATE|STAKES)/i);
    if (cls) h.cls = cls[1].replace(/\s+/g, ' ').trim();
    return h;
  }

  function parseFieldsPage(p, races) {
    const mid = p.w / 2;
    for (const [x0, x1] of [[0, mid], [mid, p.w + 1]]) {
      const col = p.items.filter(i => i.x >= x0 && i.x < x1);
      const bigs = col.filter(i => i.s >= 10 && /^\d{1,2}$/.test(i.str.trim())).sort((a, b) => b.y - a.y);
      if (!bigs.length) continue;
      const small = col.filter(i => i.s < 10);
      // race headers: small text right of the big race number, a few lines either side of it
      const local = bigs.map(b => {
        const hdrItems = small.filter(i => i.x > b.x && i.y <= b.y + 14 && i.y >= b.y - 9 && !/^NO-?$|^DR$|HORSE|COMMENT|F\/B/.test(i.str));
        const hdr = rows(hdrItems).map(r => r.text).join(' ').replace(/\s*\|\s*/g, ' ');
        const no = +b.str.trim();
        let race = races.find(r => r.no === no);
        if (!race) { race = Object.assign({ no, runners: [] }, parseHeader(hdr)); race.head = hdr.slice(0, 160); races.push(race); }
        return { y: b.y, race, srX: null, inRatings: false };
      });
      const findLocal = y => { let best = null; for (const l of local) if (l.y > y - 1 && (!best || l.y < best.y)) best = l; return best; };
      for (const r of rows(small)) {
        const L = findLocal(r.y); if (!L) continue;
        const race = L.race;
        if (/COMPUTAFORM RATINGS/.test(r.text)) {
          L.inRatings = true; const sp = r.items.find(i => /SPEED RATINGS/.test(i.str)); L.srX = sp ? sp.x - 40 : null; continue;
        }
        const s = r.text.replace(/\s*\|\s*/g, '  ');
        const m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+(.+?)\s+(\d{2}(?:\.\d)?)(?:\s+(X{1,3})(?=\s{2,}|\s*$))?(?:\s{2,}(.*?))??(?:\s+(\d{1,3}\/\d{1,3}|EVS|EVENS))?\s*$/);
        if (m && !L.inRatings) {
          const no = +m[1];
          if (!race.runners.some(x => x.no === no)) {
            race.runners.push({ no, draw: m[2], name: m[3].replace(/\s+/g, ' ').trim(), weight: m[4], stars: m[5] ? m[5].length : 0,
              comment: (m[6] || '').replace(/\s{2,}/g, ' ').trim(), odds: (m[7] || '').toUpperCase().replace('EVENS', 'EVS') });
          }
          continue;
        }
        if (L.inRatings && L.srX != null) {
          const left = clean(r.items.filter(i => i.x < L.srX).map(i => i.str).join(' '));
          const right = clean(r.items.filter(i => i.x >= L.srX).map(i => i.str).join(' '));
          const rx = /^(\d{1,2})\s+(.+?)\s+(\d{1,3}|-)$/;
          const a = left.match(rx), b = right.match(rx);
          race.cfTop = race.cfTop || []; race.srTop = race.srTop || [];
          if (a && a[3] !== '-') race.cfTop.push({ no: +a[1], v: +a[3] });
          if (b && b[3] !== '-') race.srTop.push({ no: +b[1], v: +b[3] });
        }
      }
    }
  }

  // "R1 - 10 Addicted To You … 59.0 … G S Kotzen"
  function parseIndexPage(p, kind, races) {
    let n = 0;
    const rx = /R(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z][A-Za-z0-9'’ .\-()]*?)\s*…?\s*(\d{2}\.\d)\s*…?\s*([A-Z][A-Za-z'’.\- ]*?[A-Za-z])\s*(?=\||R\d{1,2}\s*-|Strike|$)/g;
    for (const r of rows(p.items, 2.5, 12)) {
      let m; rx.lastIndex = 0;
      while ((m = rx.exec(r.text))) {
        const race = races.find(x => x.no === +m[1]); if (!race) continue;
        const run = race.runners.find(x => x.no === +m[2]); if (!run) continue;
        if (normName(run.name) !== normName(m[3]) && !normName(run.name).startsWith(normName(m[3]).slice(0, 6))) continue;
        run[kind] = m[5].trim(); n++;
      }
    }
    return n;
  }


  // ---------- UK Computaform OnLine layout ----------
  // Race page: big race number, time, class, distance, "Top 3 Computer Ratings", TIPSTER.
  // Runner block: saddle number + NAME, trainer line, right-hand row "Sh SR Jockey stats Wght HR Drw", form lines.
  // End of race: "BETTING: 6-4 HORSE; 13-8 HORSE; ..." and "RUNNERS COMMENTS".
  function parseUK(pages) {
    const races = []; const meeting = {}; let cur = null;
    const first = pages[0] ? pageText(pages[0]) : '';
    const mm = first.match(/([A-Z][A-Z' ()\-]+?)\s+(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+(\d{1,2})\s+([A-Z]+)\s+(\d{4})/);
    if (mm) { meeting.track = titleCase(mm[1].replace(/.*FORM GUIDE\s+/i, '').trim()); const mo = MONTHS[mm[3].toUpperCase()]; if (mo) meeting.date = `${mm[4]}-${String(mo).padStart(2, '0')}-${mm[2].padStart(2, '0')}`; }
    const isDate = t => /^\d{2}[A-Z][a-z]{2}\d{4}$/.test(t.trim());
    for (const p of pages) {
      const its = p.items;
      const big = its.find(i => i.s >= 30 && /^\d{1,2}$/.test(i.str.trim()));
      if (big) {
        const no = +big.str.trim();
        cur = races.find(r => r.no === no) || (races.push({ no, runners: [], top3: [] }), races[races.length - 1]);
        const top = its.filter(i => i.y > big.y - 60);
        const tm = top.find(i => /^\d{1,2}:\d{2}$/.test(i.str.trim())); if (tm) cur.time = tm.str.trim().padStart(5, '0');
        const topText = rows(top.filter(i => i.y > big.y + 30)).map(r => r.text.replace(/\s*\|\s*/g, ' ')).join(' ');
        const dm = topText.match(/\b(\d)\s(\d{3})\s?m\b/) || topText.match(/\b(\d{3,4})\s?m\b/);
        if (dm) cur.distance = dm[2] ? dm[1] + dm[2] : dm[1];
        const sf = top.find(i => i.x > 380 && /^(AW|TURF|Turf|Polytrack|Tapeta|Fibresand)$/.test(i.str.trim())); if (sf) cur.surface = sf.str.trim().toUpperCase();
        const clsRow = rows(top).find(r => /Cla\s?ss\s+[A-Z0-9]/.test(r.text.replace(/\s*\|\s*/g, ' ')));
        if (clsRow) { const c = clsRow.text.replace(/\s*\|\s*/g, ' ').match(/Cla\s?ss\s+([A-Z0-9]+)/); if (c) cur.cls = 'Class ' + c[1]; }
        const title = rows(top.filter(i => i.s >= 10 && i.s < 14 && i.x > 90 && i.x < 400)).map(r => r.text).join(' ').replace(/-\s+/g, '-').replace(/\s*\|\s*/g, ' ');
        cur.title = title; cur.head = [title, cur.cls].filter(Boolean).join(' · ');
        const hdr = its.find(i => /Top 3 Computer Ratings/.test(i.str));
        if (hdr) {
          rows(its.filter(i => i.x >= hdr.x - 30 && i.y < hdr.y - 1 && i.y > hdr.y - 45)).forEach(r => {
            const m = r.text.replace(/\s*\|\s*/g, ' ').match(/^(\d{1,2})\s+(.+)$/); if (m && cur.top3.length < 3) cur.top3.push({ rank: cur.top3.length + 1, no: +m[1], name: m[2].trim() });
          });
        }
      } else {
        const cont = pageText(p).match(/RACE\s+(\d{1,2})\s+.{0,60}?Continued/);
        if (cont) cur = races.find(r => r.no === +cont[1]) || cur;
      }
      if (!cur) continue;
      // runners
      const heads = its.filter(i => i.s >= 12 && i.s < 20 && i.x < 40 && /^\d{1,2}$/.test(i.str.trim())).sort((a, b) => b.y - a.y);
      heads.forEach((h, k) => {
        const no = +h.str.trim();
        const nameIt = its.find(i => i.s >= 9 && i.s < 12 && i.x > 40 && i.x < 120 && i.y > h.y && i.y < h.y + 14);
        if (!nameIt) return;
        const run = { no, name: nameIt.str.replace(/\s+/g, ' ').trim(), draw: '', weight: '', odds: '', jockey: '', trainer: '', form: [] };
        const tr = its.find(i => i.x > 40 && i.x < 60 && i.s > 6 && i.s < 8 && i.y < h.y + 2 && i.y > h.y - 8 && /[A-Za-z]/.test(i.str) && !/\d/.test(i.str));
        if (tr) run.trainer = titleCase(tr.str.trim()).replace(/\b([A-Z])(?=\s)/g, '$1');
        const right = its.filter(i => i.x > 380 && Math.abs(i.y - h.y) <= 4 && i.s > 5.5);
        const jk = right.find(i => i.x > 412 && i.x < 470 && /[A-Za-z]/.test(i.str) && !/\(/.test(i.str));
        if (jk) run.jockey = jk.str.trim();
        const wt = right.find(i => i.x > 515 && i.x < 540 && /^\d{2}(\.\d)?$/.test(i.str.trim())); if (wt) run.weight = wt.str.trim();
        const hr = right.find(i => i.x >= 540 && i.x < 557 && /^\d{1,3}$/.test(i.str.trim())); if (hr) run.hr = +hr.str.trim();
        const dr = right.find(i => i.x >= 557 && /^\d{1,2}$/.test(i.str.trim())); if (dr) run.draw = dr.str.trim();
        const sr = right.find(i => i.x > 400 && i.x < 414 && /^\d{1,3}$/.test(i.str.trim())); if (sr) run.sr = +sr.str.trim();
        const sh = right.find(i => i.x > 385 && i.x < 400 && /^[A-Z]{1,3}$/.test(i.str.trim())); if (sh) run.gear = sh.str.trim();
        const lower = heads[k + 1] ? heads[k + 1].y + 14 : -1;
        its.filter(i => isDate(i.str) && i.x < 35 && i.y < h.y && i.y > lower).sort((a, b) => b.y - a.y).forEach(d => {
          const fin = its.find(i => Math.abs(i.y - d.y) < 1.5 && i.x > 333 && i.x < 347);
          if (fin) run.form.push({ y: d.y, f: fin.str.trim() });
        });
        if (!cur.runners.some(x => x.no === no)) cur.runners.push(run); else Object.assign(cur.runners.find(x => x.no === no), run);
        cur._last = cur.runners.find(x => x.no === no);
      });
      // form lines that continue at the top of a page belong to the last runner
      if (cur._last && heads.length) {
        const topHead = heads[0];
        its.filter(i => isDate(i.str) && i.x < 35 && i.y > topHead.y + 14).sort((a, b) => b.y - a.y).forEach(d => {
          const fin = its.find(i => Math.abs(i.y - d.y) < 1.5 && i.x > 333 && i.x < 347);
          const prev = races.flatMap(r => r.runners).find(x => x._pendingForm);
          if (fin && prev) prev.form.push({ y: d.y, f: fin.str.trim() });
        });
      }
      races.forEach(r => r.runners.forEach(x => delete x._pendingForm));
      if (cur._last) cur._last._pendingForm = true;
      // betting + runner comments
      const rs = rows(its).map(r => ({ y: r.y, text: r.text.replace(/\s*\|\s*/g, ' '), items: r.items }));
      const bi = rs.findIndex(r => /^BETTING:/.test(r.text));
      if (bi >= 0) {
        let t = '';
        for (let j = bi; j < rs.length && !/RUNNERS COMMENTS|END RUNNERS/.test(rs[j].text); j++) t += ' ' + rs[j].text;
        cur.betting = t.replace(/^\s*BETTING:\s*/, '').trim();
      }
      const ci = rs.findIndex(r => /^RUNNERS COMMENTS/.test(r.text));
      const commentRows = ci >= 0 ? rs.slice(ci + 1) : (!heads.length && !big ? rs : []);
      commentRows.forEach(r => {
        const a = r.items[0], b2 = r.items[1];
        if (!a || !b2 || a.x > 26 || !/^\d{1,2}$/.test(a.str.trim()) || b2.x < 30 || b2.x > 40) return;
        const run = cur.runners.find(x => x.no === +a.str.trim());
        if (run && !run.comment) run.comment = clean(r.items.slice(2).map(i => i.str).join(' ')).replace(/^(?:\d+-\d+|EVS|EVENS)(?:j?fav|f)?\s*\([^)]*\)\s*/i, '').slice(0, 110);
      });
      const end = pageText(p).match(/END RUNNERS \((\d+)\) RACE (\d+)/); if (end) { const r = races.find(x => x.no === +end[2]); if (r) r.declared = +end[1]; }
    }
    // odds from BETTING line (entries without a price share the previous price; "X-1 AND BETTER OTHERS" → rest)
    for (const r of races) {
      if (!r.betting) continue;
      let price = null, others = null;
      r.betting.replace(/\.$/, '').split(';').map(x => x.trim()).filter(Boolean).forEach(e => {
        const m = e.match(/^(\d+-\d+|EVS|EVENS)\s+(.+)$/i); let nm = e;
        if (m) { price = m[1].toUpperCase().replace('EVENS', 'EVS').replace('-', '/'); nm = m[2]; }
        if (/BETTER OTHERS|OTHERS$/i.test(nm)) { others = price; return; }
        const run = r.runners.find(x => normName(x.name) === normName(nm)); if (run && price) run.odds = price;
      });
      if (others) { const [a, b] = others.split('/').map(Number); const est = b ? `${Math.max(a + 2, Math.round(a * 1.25))}/${b}` : others; r.runners.forEach(x => { if (!x.odds) { x.odds = est; x.oddsEst = true; } }); }
    }
    races.forEach(r => {
      r.runners.sort((a, b) => a.no - b.no);
      r.runners.forEach(x => {
        // form lines are listed oldest → newest in reading order
        x.formFig = x.form.map(f => /^\d+$/.test(f.f) ? (+f.f >= 10 ? '0' : f.f) : f.f.charAt(0)).join('');
        x.recent = x.form.slice(-3).map(f => +f.f).filter(n => n > 0);
        const t = r.top3.find(t => t.no === x.no && normName(x.name).startsWith(normName(t.name).slice(0, 5)));
        x.cf = t ? { rank: t.rank, v: null } : null;
        if (x.sr != null) x.spd = x.sr;
        delete x._last; delete x._pendingForm;
      });
      delete r._last;
      const bySr = r.runners.filter(x => x.spd != null).sort((a, b) => b.spd - a.spd);
      r.runners.forEach(x => { const i = bySr.indexOf(x); x.sr = i >= 0 && i < 4 ? { rank: i + 1, v: x.spd } : null; });
    });
    const live = races.filter(r => r.runners.length).sort((a, b) => a.no - b.no);
    const n = live.reduce((a, r) => a + r.runners.length, 0);
    return { layout: 'UK', meeting, races: live, runners: n, jockeys: live.reduce((a, r) => a + r.runners.filter(x => x.jockey).length, 0), trainers: live.reduce((a, r) => a + r.runners.filter(x => x.trainer).length, 0) };
  }

  function parseComputaform(pages) {
    const races = []; const meeting = {};
    let fieldsPages = 0;
    pages.forEach(p => {
      const t = pageText(p);
      if (/FIELDS,\s*RATINGS FOR/i.test(t)) {
        fieldsPages++;
        if (!meeting.track) {
          const mm = t.match(/FIELDS,\s*RATINGS FOR\s+(.+?)\s+(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+(\d{1,2})\s+([A-Z]+)\s+(\d{4})/i);
          if (mm) { meeting.track = titleCase(mm[1].replace(/^HOLLYWOODBETS\s+/i, '').trim()); meeting.sponsor = /^HOLLYWOODBETS/i.test(mm[1]) ? 'Hollywoodbets' : '';
            const mo = MONTHS[mm[3].toUpperCase()]; if (mo) meeting.date = `${mm[4]}-${String(mo).padStart(2, '0')}-${mm[2].padStart(2, '0')}`; }
        }
        parseFieldsPage(p, races);
      }
    });
    const live = races.filter(r => r.runners.length).sort((a, b) => a.no - b.no);
    let jockeys = 0, trainers = 0;
    pages.forEach(p => {
      const t = rows(p.items).slice(0, 3).map(r => r.text).join(' ');
      if (/JOCKEY INDEX/i.test(t)) trainers += parseIndexPage(p, 'trainer', live);
      else if (/TRAINER INDEX/i.test(t)) jockeys += parseIndexPage(p, 'jockey', live);
    });
    live.forEach(r => {
      r.runners.sort((a, b) => a.no - b.no);
      const rank = (list, no) => { const s = (list || []).slice().sort((a, b) => b.v - a.v); const i = s.findIndex(x => x.no === no); return i < 0 ? null : { rank: i + 1, v: s[i].v }; };
      r.runners.forEach(x => { x.cf = rank(r.cfTop, x.no); x.sr = rank(r.srTop, x.no); });
    });
    const res = { layout: 'SA', meeting, races: live, fieldsPages, jockeys, trainers, runners: live.reduce((a, r) => a + r.runners.length, 0) };
    if (res.runners) return res;
    if (pages.some(p => /Top 3 Computer Ratings|END RUNNERS/.test(pageText(p)))) return parseUK(pages);
    return res;
  }

  // Plain-text version of the parsed card (re-importable "No, Horse, Draw, Weight, Odds, Jockey, Trainer" lines)
  function toText(res) {
    const out = [];
    if (res.meeting.track) out.push(`${res.meeting.sponsor ? res.meeting.sponsor + ' ' : ''}${res.meeting.track} ${res.meeting.date || ''}`.trim(), '');
    for (const r of res.races) {
      out.push(`RACE ${r.no}  ${r.time || ''}  ${r.distance ? r.distance + 'm' : ''} ${r.surface || ''}  ${r.cls || ''}`.replace(/\s{3,}/g, '  ').trim());
      for (const x of r.runners) out.push([x.no, x.name, x.draw, x.weight, x.odds, x.jockey || '', x.trainer || ''].join(', ') + (x.stars ? `   ${'X'.repeat(x.stars)}` : '') + (x.comment ? `  ${x.comment}` : ''));
      out.push('');
    }
    return out.join('\n');
  }

  const api = { parseComputaform, parseUK, toText, rows, clean, parseHeader };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Computaform = api;
})(this);
