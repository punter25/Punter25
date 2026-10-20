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
    return { meeting, races: live, fieldsPages, jockeys, trainers, runners: live.reduce((a, r) => a + r.runners.length, 0) };
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

  const api = { parseComputaform, toText, rows, clean, parseHeader };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Computaform = api;
})(this);
