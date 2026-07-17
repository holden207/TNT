/**
 * Runtime patches & UX chrome for TNT Maritime Intelligence.
 * Loaded after the original page — index.html on disk is never modified.
 */
(function () {
  'use strict';

  var LOGO_URL = '/images/tnt-logo-round.png';

  // ── Helpers ────────────────────────────────────────────────────────
  function noTnt(tf) {
    return !tf || tf === '-' || tf === '—' || tf === '–';
  }

  function hasTnt(tf) {
    return !noTnt(tf);
  }

  function toast(message, kind) {
    var host = document.getElementById('tnt-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'tnt-toast-host';
      host.className = 'tnt-toast-host';
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    var el = document.createElement('div');
    el.className = 'tnt-toast ' + (kind || 'info');
    el.innerHTML =
      '<span></span><button type="button" class="tnt-toast-close" aria-label="Dismiss">×</button>';
    el.querySelector('span').textContent = message;
    el.querySelector('.tnt-toast-close').addEventListener('click', function () {
      el.remove();
    });
    host.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.remove();
    }, 4200);
  }

  // ── Branding: logo across app chrome ───────────────────────────────
  function applyBranding() {
    var logo = document.querySelector('.header-logo');
    if (logo) {
      logo.alt = 'Tug Network Team';
      logo.width = 56;
      logo.height = 56;
      logo.decoding = 'async';
    }

    var title = document.querySelector('.header-title h1');
    if (title && !title.dataset.branded) {
      title.dataset.branded = '1';
      title.textContent = 'TNT • Global Maritime Intelligence';
    }

    var sub = document.querySelector('.header-title p');
    if (sub && !sub.dataset.branded) {
      sub.dataset.branded = '1';
      sub.textContent = 'CPT · Fairplay · Ocean Group · Sulnorte';
    }

    // Favicon (also injected server-side; keep for local/static fallback)
    if (!document.querySelector('link[rel="icon"]')) {
      var link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = LOGO_URL;
      document.head.appendChild(link);
    }
  }

  // ── Fix: report view switch called missing gr(DIM) ─────────────────
  if (typeof sw === 'function') {
    window.sw = function (v) {
      VIEW = v;
      ['table', 'analytics', 'multiport', 'report'].forEach(function (n) {
        var el = document.getElementById('vw-' + n);
        if (el) el.classList.toggle('active', n === v);
      });
      document.querySelectorAll('.nav-tab').forEach(function (t, i) {
        t.classList.toggle(
          'active',
          ['table', 'analytics', 'multiport', 'report'][i] === v
        );
      });
      if (v === 'analytics' && typeof rndAn === 'function') rndAn();
      if (v === 'multiport' && typeof rndMp === 'function') rndMp();
      if (v === 'report' && typeof DIMS !== 'undefined' && DIMS.length && typeof runReport === 'function') {
        runReport();
      }
    };
  }

  if (typeof render === 'function') {
    window.render = function () {
      if (VIEW === 'table' && typeof rndTbl === 'function') rndTbl();
      if (VIEW === 'analytics' && typeof rndAn === 'function') rndAn();
      if (VIEW === 'multiport' && typeof rndMp === 'function') rndMp();
      if (VIEW === 'report' && typeof DIMS !== 'undefined' && DIMS.length && typeof runReport === 'function') {
        runReport();
      }
    };
  }

  // ── Fix: report TNT filters used em-dash while data uses hyphen ────
  window.getReportData = function () {
    var co = (document.getElementById('rq-co') || {}).value || '';
    var cd = (document.getElementById('rq-cd') || {}).value || '';
    var o = (document.getElementById('rq-o') || {}).value || '';
    var d = (document.getElementById('rq-d') || {}).value || '';
    var g = (document.getElementById('rq-g') || {}).value || '';
    var c = (document.getElementById('rq-c') || {}).value || '';
    var v = (document.getElementById('rq-v') || {}).value || '';
    var tp = (document.getElementById('rq-tp') || {}).value || '';
    var tm = (document.getElementById('rq-tm') || {}).value || '';
    var ow = (document.getElementById('rq-ow') || {}).value || '';
    var ch = (document.getElementById('rq-ch') || {}).value || '';
    var m = parseFloat((document.getElementById('rq-m') || {}).value) || 0;

    var result = F.filter(function (r) {
      if (co && r.co !== co) return false;
      if (cd && r.cd !== cd) return false;
      if (o && r.o !== o) return false;
      if (d && r.d !== d) return false;
      if (g && r.g !== g) return false;
      if (c && r.c !== c) return false;
      if (v && r.v !== v) return false;
      if (m && r.mt < m) return false;
      if (ow && !r.ow.includes(ow)) return false;
      if (ch && !r.ch.includes(ch)) return false;
      if (tm && !(r.to || '').includes(tm) && !(r.td || '').includes(tm)) return false;
      if (tp === 'both' && r.tf !== '> Origin / > Dest') return false;
      if (tp === 'any' && noTnt(r.tf)) return false;
      if (tp === 'none' && hasTnt(r.tf)) return false;
      return true;
    });

    var pills = [];
    var lbls = {
      co: 'Origin Country', cd: 'Dest. Country', o: 'Origin Port', d: 'Dest. Port',
      g: 'Group', c: 'Commodity', v: 'Vessel', tp: 'TNT', tm: 'TNT Member',
      ow: 'Owner', ch: 'Charterer', m: 'Min Mt',
    };
    var vals = { co: co, cd: cd, o: o, d: d, g: g, c: c, v: v, tp: tp, tm: tm, ow: ow, ch: ch, m: m || '' };
    Object.keys(vals).forEach(function (k) {
      var val = vals[k];
      if (!val) return;
      pills.push(
        '<span class="pill" style="background:#FEF3C7;color:#92400E">' +
          lbls[k] + ': <b>' + val + '</b>' +
          ' <span class="pill-x" data-rk="rq-' + k + '" onclick="clrRQ(this.dataset.rk)">✕</span></span>'
      );
    });
    var rqa = document.getElementById('rq-active');
    if (rqa) rqa.innerHTML = pills.join('');
    return result;
  };

  // ── Fix: Report Builder aggregation (multi-value dims, totals, Port Calls) ──
  var EXPAND_DIMS = { tntm: 1, owner: 1, chtr: 1, tug: 1 };

  function uniqNonEmpty(arr) {
    var out = [];
    var seen = Object.create(null);
    (arr || []).forEach(function (x) {
      if (!x) return;
      var k = String(x);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(x);
    });
    return out;
  }

  function portCalls(voy) {
    return (Number(voy) || 0) * 2; // each voyage ⇒ origin + dest call
  }

  function summarizeSource(RD) {
    var vol = 0;
    var voy = 0;
    var tnt = 0;
    var jwl = 0;
    RD.forEach(function (r) {
      vol += r.mt;
      voy += r.ca;
      if (hasTnt(r.tf)) tnt++;
      if (r.tf === '> Origin / > Dest') jwl++;
    });
    return {
      n: RD.length,
      vol: vol,
      voy: voy,
      calls: portCalls(voy),
      tnt: tnt,
      jwl: jwl,
    };
  }

  window.getKeys = function (r, dim) {
    if (dim === 'o') return [r.o];
    if (dim === 'd') return [r.d];
    if (dim === 'co') return [r.co];
    if (dim === 'cd') return [r.cd];
    if (dim === 'pair') return [r.o + ' → ' + r.d];
    if (dim === 'c') return [r.c];
    if (dim === 'g') return [r.g];
    if (dim === 'v') return [r.v];
    if (dim === 'tntp') {
      if (r.tf === '> Origin / > Dest') return ['Prompt Opportunity (both ends)'];
      if (r.tf === '> Origin') return ['TNT at Origin only'];
      if (r.tf === '> Dest') return ['TNT at Dest. only'];
      return ['No TNT presence'];
    }
    if (dim === 'tntm') {
      var ms = uniqNonEmpty([r.to, r.td]);
      return ms.length ? ms : ['(none)'];
    }
    if (dim === 'owner') {
      var owners = uniqNonEmpty(r.ow);
      return owners.length ? owners : ['(none)'];
    }
    if (dim === 'chtr') {
      var chtrs = uniqNonEmpty(r.ch);
      return chtrs.length ? chtrs : ['(none)'];
    }
    if (dim === 'tug') {
      var tugs = uniqNonEmpty([].concat(r.tw || [], r.tx || []));
      return tugs.length ? tugs : ['(none)'];
    }
    return ['—'];
  };

  window.runReport = function () {
    if (!DIMS.length) {
      alert('Select at least one Group By dimension.');
      return;
    }
    if (DIMS.includes('detail')) {
      rndDet();
      return;
    }

    var dims = DIMS.slice();
    var hasExpand = dims.some(function (d) {
      return EXPAND_DIMS[d];
    });
    var RD = getReportData();
    var agg = Object.create(null);

    RD.forEach(function (r, ri) {
      var keyCombos = [[]];
      dims.forEach(function (dim) {
        var vals = getKeys(r, dim);
        var next = [];
        keyCombos.forEach(function (existing) {
          vals.forEach(function (v) {
            next.push(existing.concat([v]));
          });
        });
        keyCombos = next;
      });

      keyCombos.forEach(function (combo) {
        var k = combo.join(' ║ ');
        if (!agg[k]) {
          agg[k] = {
            keys: combo,
            vol: 0,
            voy: 0,
            calls: 0,
            n: 0,
            tnt: 0,
            jwl: 0,
            ow: new Set(),
            ch: new Set(),
            tg: new Set(),
            tm: new Set(),
            vts: new Set(),
            _ids: new Set(),
          };
        }
        var a = agg[k];
        // Presence attribution: full metrics per matching entity/group.
        // Deduplicate if the same corridor maps to the same key more than once.
        if (a._ids.has(ri)) return;
        a._ids.add(ri);
        a.vol += r.mt;
        a.voy += r.ca;
        a.calls += portCalls(r.ca);
        a.n++;
        if (hasTnt(r.tf)) a.tnt++;
        if (r.tf === '> Origin / > Dest') a.jwl++;
        (r.ow || []).forEach(function (x) {
          if (x) a.ow.add(x);
        });
        (r.ch || []).forEach(function (x) {
          if (x) a.ch.add(x);
        });
        [].concat(r.tw || [], r.tx || []).forEach(function (x) {
          if (x) a.tg.add(x);
        });
        if (r.to) a.tm.add(r.to);
        if (r.td) a.tm.add(r.td);
        if (r.v) a.vts.add(r.v);
      });
    });

    var rows = Object.keys(agg)
      .map(function (k) {
        var a = agg[k];
        return {
          keys: a.keys,
          vol: a.vol,
          voy: a.voy,
          calls: a.calls,
          n: a.n,
          tnt: a.tnt,
          jwl: a.jwl,
          ow: Array.from(a.ow),
          ch: Array.from(a.ch),
          tg: Array.from(a.tg),
          tm: Array.from(a.tm),
          vts: Array.from(a.vts),
        };
      })
      .sort(function (a, b) {
        return b.vol - a.vol;
      });

    window._rptMeta = Object.assign(summarizeSource(RD), { expanded: hasExpand, groups: rows.length });
    _rows = rows;
    _renderRpt = function () {
      return renderAggTable(rows);
    };
    document.getElementById('rpt-wrap').innerHTML = renderAggTable(rows);
    document.getElementById('rpt-cnt').textContent =
      rows.length +
      ' groups · ' +
      RD.length +
      ' corridors · ' +
      RD.reduce(function (s, r) {
        return s + r.mt;
      }, 0).toFixed(0) +
      ' Mt';
  };

  window.renderAggTable = function (rows) {
    var sv = cv('cvol');
    var sy = cv('cvoy');
    var sc = cv('ccal');
    var st = cv('ctnt');
    var sj = cv('cjwl');
    var scov = cv('ccov');
    var so = cv('cow');
    var sch = cv('cch');
    var stu = cv('ctu');
    var sm = cv('cmb');
    var svt = cv('cvt');

    var h = '<table class="rpt-tbl"><thead><tr>';
    DIMS.forEach(function (dim) {
      h +=
        '<th data-k="key_' +
        dim +
        '" onclick="srptH(this)">' +
        DIM_LABELS[dim] +
        ' ↕</th>';
    });
    h += '<th data-k="n" onclick="srptH(this)" class="rn">Corridors ↕</th>';
    if (sv) h += '<th data-k="vol" onclick="srptH(this)" class="rn">Volume (Mt) ↕</th>';
    if (sy) h += '<th data-k="voy" onclick="srptH(this)" class="rn">Voyages ↕</th>';
    if (sc) h += '<th data-k="calls" onclick="srptH(this)" class="rn">Port Calls ↕</th>';
    if (st) h += '<th data-k="tnt" onclick="srptH(this)" class="rn">TNT Corridors ↕</th>';
    if (sj) h += '<th data-k="jwl" onclick="srptH(this)" class="rn">Prompt Opp. ↕</th>';
    if (scov) h += '<th data-k="cov" onclick="srptH(this)" class="rn">TNT Share % ↕</th>';
    if (svt) h += '<th>Vessel Types</th>';
    if (so) h += '<th>Shipowners</th>';
    if (sch) h += '<th>Charterers</th>';
    if (stu) h += '<th>Tug Companies</th>';
    if (sm) h += '<th>TNT Members</th>';
    h += '</tr></thead><tbody>';

    rows.forEach(function (row) {
      var tntShare = row.n > 0 ? ((row.tnt / row.n) * 100).toFixed(0) + '%' : '—';
      h += '<tr>';
      DIMS.forEach(function (dim, i) {
        var val = row.keys[i] || '—';
        var isTNT = dim === 'tntm' && val !== '(none)';
        h +=
          '<td><strong style="color:' +
          (isTNT ? 'var(--green)' : 'var(--navy)') +
          '">' +
          val +
          '</strong></td>';
      });
      h += '<td class="rn">' + row.n + '</td>';
      if (sv) h += '<td class="rn">' + row.vol.toFixed(1) + '</td>';
      if (sy) h += '<td class="rn">' + row.voy.toLocaleString() + '</td>';
      if (sc) h += '<td class="rn">' + (row.calls != null ? row.calls : portCalls(row.voy)).toLocaleString() + '</td>';
      if (st) {
        h +=
          '<td class="rn" style="color:' +
          (row.tnt > 0 ? 'var(--green)' : 'var(--muted)') +
          '">' +
          row.tnt +
          '</td>';
      }
      if (sj) {
        h +=
          '<td class="rn" style="color:' +
          (row.jwl > 0 ? '#D97706' : 'var(--muted)') +
          '">' +
          (row.jwl || '—') +
          '</td>';
      }
      if (scov) h += '<td class="rn">' + tntShare + '</td>';
      if (svt) {
        h +=
          '<td>' +
          row.vts
            .slice(0, 3)
            .map(function (x) {
              return '<span class="cr">' + x + '</span>';
            })
            .join('') +
          '</td>';
      }
      if (so) {
        h +=
          '<td>' +
          row.ow
            .slice(0, 4)
            .map(function (x) {
              return '<span class="cr">' + x + '</span>';
            })
            .join('') +
          (row.ow.length > 4
            ? ' <span style="color:var(--muted);font-size:9px">+' + (row.ow.length - 4) + '</span>'
            : '') +
          '</td>';
      }
      if (sch) {
        h +=
          '<td>' +
          row.ch
            .slice(0, 4)
            .map(function (x) {
              return '<span class="cr cr-c">' + x + '</span>';
            })
            .join('') +
          (row.ch.length > 4
            ? ' <span style="color:var(--muted);font-size:9px">+' + (row.ch.length - 4) + '</span>'
            : '') +
          '</td>';
      }
      if (stu) {
        h +=
          '<td>' +
          row.tg
            .slice(0, 4)
            .map(function (x) {
              return '<span class="cr">' + x + '</span>';
            })
            .join('') +
          (row.tg.length > 4
            ? ' <span style="color:var(--muted);font-size:9px">+' + (row.tg.length - 4) + '</span>'
            : '') +
          '</td>';
      }
      if (sm) {
        h +=
          '<td>' +
          row.tm
            .map(function (x) {
              return '<span class="cr cr-t">' + x + '</span>';
            })
            .join('') +
          '</td>';
      }
      h += '</tr>';
    });

    // Footer always uses unique-corridor totals (avoids double-count when dims expand).
    var meta = window._rptMeta || summarizeSource([]);
    var tv = meta.vol;
    var ty = meta.voy;
    var tc = meta.calls;
    var tn = meta.n;
    var tt = meta.tnt;
    var tj = meta.jwl;
    var footLabel = window._rptMeta && window._rptMeta.expanded
      ? 'TOTAL (' + rows.length + ' groups · ' + tn + ' unique corridors)'
      : 'TOTAL (' + rows.length + ' groups)';

    h += '</tbody><tfoot><tr>';
    h += '<td colspan="' + DIMS.length + '"><strong>' + footLabel + '</strong></td>';
    h += '<td class="rn">' + tn + '</td>';
    if (sv) h += '<td class="rn">' + tv.toFixed(1) + '</td>';
    if (sy) h += '<td class="rn">' + ty.toLocaleString() + '</td>';
    if (sc) h += '<td class="rn">' + tc.toLocaleString() + '</td>';
    if (st) h += '<td class="rn">' + tt + '</td>';
    if (sj) h += '<td class="rn">' + tj + '</td>';
    if (scov) h += '<td class="rn">' + (tn > 0 ? ((tt / tn) * 100).toFixed(0) + '%' : '—') + '</td>';
    if (svt || so || sch || stu || sm) {
      var extra = [svt, so, sch, stu, sm].filter(Boolean).length;
      h += '<td colspan="' + extra + '"></td>';
    }
    h += '</tr></tfoot></table>';
    return h;
  };

  window.rndDet = function () {
    var RD = getReportData();
    var sv = cv('cvol');
    var sy = cv('cvoy');
    var sc = cv('ccal');
    var st = cv('ctnt');
    var so = cv('cow');
    var sch = cv('cch');
    var stu = cv('ctu');
    var h =
      '<table class="rpt-tbl"><thead><tr>' +
      '<th>Origin Port</th><th>Orig. Country</th>' +
      '<th>Dest. Port</th><th>Dest. Country</th>' +
      '<th>Commodity</th><th>Group</th><th>Vessel Type</th>' +
      (sv ? '<th class="rn">Mt 2025</th>' : '') +
      (sy ? '<th class="rn">Voyages</th>' : '') +
      (sc ? '<th class="rn">Port Calls</th>' : '') +
      (st ? '<th>TNT Status</th>' : '') +
      (so ? '<th>Shipowners</th>' : '') +
      (sch ? '<th>Charterers</th>' : '') +
      (stu ? '<th>Towage — Origin</th><th>Towage — Dest</th>' : '') +
      '</tr></thead><tbody>';

    RD.forEach(function (r) {
      var tl =
        r.tf === '> Origin / > Dest'
          ? '👑 ' + r.to + '+' + r.td
          : r.tf === '> Origin'
            ? '⚓ ' + r.to
            : r.tf === '> Dest'
              ? '⚓ ' + r.td
              : '—';
      h +=
        '<tr>' +
        '<td><strong>' +
        r.o +
        '</strong></td><td>' +
        r.co +
        '</td>' +
        '<td><strong>' +
        r.d +
        '</strong></td><td>' +
        r.cd +
        '</td>' +
        '<td style="color:var(--blue);font-weight:600">' +
        r.c +
        '</td>' +
        '<td style="font-size:10px;color:var(--muted)">' +
        r.g +
        '</td>' +
        '<td style="font-size:10px">' +
        r.v +
        '</td>' +
        (sv ? '<td class="rn">' + r.mt.toFixed(1) + '</td>' : '') +
        (sy ? '<td class="rn">' + r.ca.toLocaleString() + '</td>' : '') +
        (sc ? '<td class="rn">' + portCalls(r.ca).toLocaleString() + '</td>' : '') +
        (st
          ? '<td style="font-size:10px;color:' +
            (hasTnt(r.tf) ? 'var(--green)' : 'var(--muted)') +
            '">' +
            tl +
            '</td>'
          : '') +
        (so ? '<td style="font-size:9px">' + (r.ow || []).slice(0, 3).join(', ') + '</td>' : '') +
        (sch ? '<td style="font-size:9px">' + (r.ch || []).slice(0, 3).join(', ') + '</td>' : '') +
        (stu
          ? '<td style="font-size:9px">' +
            ((r.tw || []).slice(0, 2).join(', ') || '—') +
            '</td>' +
            '<td style="font-size:9px">' +
            ((r.tx || []).slice(0, 2).join(', ') || '—') +
            '</td>'
          : '') +
        '</tr>';
    });

    var meta = summarizeSource(RD);
    window._rptMeta = Object.assign(meta, { expanded: false, groups: RD.length });
    h +=
      '</tbody><tfoot><tr><td colspan="7"><strong>TOTAL — ' +
      RD.length +
      ' corridors</strong></td>' +
      (sv ? '<td class="rn"><strong>' + meta.vol.toFixed(1) + '</strong></td>' : '') +
      (sy ? '<td class="rn"><strong>' + meta.voy.toLocaleString() + '</strong></td>' : '') +
      (sc ? '<td class="rn"><strong>' + meta.calls.toLocaleString() + '</strong></td>' : '') +
      (st ? '<td></td>' : '') +
      (so ? '<td></td>' : '') +
      (sch ? '<td></td>' : '') +
      (stu ? '<td></td><td></td>' : '') +
      '</tr></tfoot></table>';
    document.getElementById('rpt-wrap').innerHTML = h;
    document.getElementById('rpt-cnt').textContent =
      RD.length + ' corridors · ' + meta.vol.toFixed(0) + ' Mt';
  };

  if (typeof resetReport === 'function') {
    var _resetReport = resetReport;
    window.resetReport = function () {
      _resetReport();
      // Restore default metric columns
      [
        ['cvol', true],
        ['cvoy', true],
        ['ccal', true],
        ['ctnt', true],
        ['cjwl', true],
        ['ccov', false],
        ['cow', false],
        ['cch', false],
        ['ctu', false],
        ['cmb', false],
        ['cvt', false],
      ].forEach(function (pair) {
        var el = document.getElementById(pair[0]);
        if (!el) return;
        el.checked = pair[1];
        var lab = el.closest('.ct');
        if (lab) lab.classList.toggle('on', pair[1]);
      });
      window._rptMeta = null;
    };
  }

  // ── Fix: table sort relied on implicit global event ────────────────
  if (typeof srt === 'function') {
    window.srt = function (k, ev) {
      var e = ev || window.event;
      if (SK === k) SD *= -1;
      else {
        SK = k;
        SD = -1;
      }
      document.querySelectorAll('thead th').forEach(function (th) {
        th.classList.remove('sorted');
        var si = th.querySelector('.si');
        if (si) si.textContent = '↕';
      });
      var target = e && (e.currentTarget || e.target);
      if (target) {
        var th = target.closest ? target.closest('th') : target;
        if (th && th.tagName === 'TH') {
          th.classList.add('sorted');
          var si = th.querySelector('.si');
          if (si) si.textContent = SD === -1 ? '↓' : '↑';
        }
      }
      go();
    };

    document.querySelectorAll('#vw-table thead th[onclick]').forEach(function (th) {
      var m = (th.getAttribute('onclick') || '').match(/srt\('([^']+)'\)/);
      if (!m) return;
      th.removeAttribute('onclick');
      th.addEventListener('click', function (e) {
        srt(m[1], e);
      });
    });
  }

  // ── Fix: print reports use the live logo asset ─────────────────────
  if (typeof rptPrint === 'function') {
    var _rptPrint = rptPrint;
    window.rptPrint = function () {
      var c = document.getElementById('rpt-wrap').innerHTML;
      var filtersEl = document.getElementById('pills');
      var filters = filtersEl ? filtersEl.innerText.trim() : '';
      var w = window.open('', '_blank');
      if (!w) {
        toast('Allow pop-ups to print the report.', 'warn');
        return;
      }
      var logoAbs = window.location.origin + LOGO_URL;
      w.document.write(
        '<!DOCTYPE html><html><head><title>TNT Report</title>' +
        '<style>' +
        '*{font-family:Arial Narrow,Arial,sans-serif;}' +
        'body{font-size:11px;padding:20px;color:#1E293B;}' +
        '.print-header{display:flex;align-items:center;gap:16px;margin-bottom:14px;' +
        '  padding-bottom:12px;border-bottom:2.5px solid #D4900A;}' +
        '.print-logo{width:72px;height:72px;border-radius:50%;object-fit:cover;background:#0b1f3a;flex-shrink:0;}' +
        '.print-title h1{font-size:16px;font-weight:700;color:#002060;margin:0 0 2px 0;}' +
        '.print-title p{font-size:9px;color:#64748B;margin:1px 0;}' +
        '.print-filters{font-size:9px;color:#64748B;margin-bottom:10px;}' +
        'table{border-collapse:collapse;width:100%;margin-top:8px;}' +
        'th{padding:6px 9px;background:#002060;color:#fff;text-align:left;font-size:10px;font-weight:700;}' +
        'td{padding:5px 9px;border-bottom:1px solid #E2E8F0;font-size:10px;vertical-align:top;}' +
        'tr:nth-child(even) td{background:#F8FAFC;}' +
        'tfoot td{font-weight:700;background:#F1F5F9;border-top:2px solid #CBD5E1;}' +
        '.rn{text-align:right;font-weight:600;}' +
        '@media print{@page{margin:15mm;}body{padding:0;}}' +
        '</style></head><body>' +
        '<div class="print-header">' +
        '<img class="print-logo" src="' + logoAbs + '" alt="Tug Network Team">' +
        '<div class="print-title">' +
        '<h1>TNT Global Maritime Intelligence</h1>' +
        '<p>CPT Towage · Fairplay Towage · Ocean Group · Sulnorte</p>' +
        '<p>Report generated: ' + new Date().toLocaleString() + '</p>' +
        '</div></div>' +
        (filters ? '<div class="print-filters"><strong>Active filters:</strong> ' + filters + '</div>' : '') +
        c +
        '</body></html>'
      );
      w.document.close();
      w.focus();
      setTimeout(function () {
        w.print();
      }, 250);
      void _rptPrint;
    };
  }

  // ── UX: friendlier export feedback ─────────────────────────────────
  if (typeof csvExp === 'function') {
    var _csvExp = csvExp;
    window.csvExp = function () {
      _csvExp();
      toast('CSV download started for the current view.', 'ok');
    };
  }
  if (typeof rptCSV === 'function') {
    var _rptCsv = rptCSV;
    window.rptCSV = function () {
      _rptCsv();
      toast('Report CSV download started.', 'ok');
    };
  }

  // ── Storage helpers ────────────────────────────────────────────────
  function lsGet(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) { /* private mode */ }
  }

  function isNarrow() {
    return window.matchMedia && window.matchMedia('(max-width: 860px)').matches;
  }

  function userInitials(user) {
    var name = (user && (user.displayName || user.username)) || 'U';
    var parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name).slice(0, 2).toUpperCase();
  }

  function roleLabel(role) {
    var r = String(role || '').toLowerCase();
    if (r === 'admin') return 'Administrator';
    if (r === 'analyst') return 'Analyst';
    if (r === 'viewer') return 'Viewer';
    return r ? r.charAt(0).toUpperCase() + r.slice(1) : 'User';
  }

  // ── UX: user session bar + logout + password change ───────────────
  function mountUserChrome() {
    var user = window.__TNT_USER__;
    if (!user) return;
    if (document.getElementById('tnt-user-bar')) return;

    var host =
      document.querySelector('.main-topbar') ||
      document.querySelector('.header-top');
    if (!host) return;

    var bar = document.createElement('div');
    bar.id = 'tnt-user-bar';
    bar.className = 'tnt-user-bar';
    bar.innerHTML =
      '<div class="tnt-user-meta">' +
      '<span class="tnt-user-name"></span>' +
      '<span class="tnt-user-role"></span>' +
      '</div>' +
      '<span class="tnt-user-initials" aria-hidden="true"></span>' +
      '<img class="tnt-user-avatar" src="' + LOGO_URL + '" alt="" width="32" height="32">' +
      '<button type="button" class="tnt-logout" id="tnt-change-pw" title="Change your password">Password</button>' +
      '<button type="button" class="tnt-logout" id="tnt-logout" title="End your session">Sign out</button>';

    var display = user.displayName || user.username;
    bar.querySelector('.tnt-user-name').textContent = display;
    bar.querySelector('.tnt-user-role').textContent = roleLabel(user.role);
    bar.querySelector('.tnt-user-initials').textContent = userInitials(user);

    host.appendChild(bar);

    document.getElementById('tnt-logout').addEventListener('click', async function () {
      if (!window.confirm('Sign out of TNT Maritime Intelligence?')) return;
      try {
        await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
      } catch (_) { /* ignore */ }
      window.location.href = '/login';
    });

    document.getElementById('tnt-change-pw').addEventListener('click', openPasswordModal);
  }

  function openPasswordModal() {
    if (document.getElementById('tnt-pw-modal')) return;

    var backdrop = document.createElement('div');
    backdrop.id = 'tnt-pw-modal';
    backdrop.className = 'tnt-pw-modal';
    backdrop.innerHTML =
      '<div class="tnt-pw-dialog" role="dialog" aria-modal="true" aria-labelledby="tnt-pw-title">' +
      '<h2 id="tnt-pw-title">Change password</h2>' +
      '<p class="tnt-pw-lead">Update the password for your personal account.</p>' +
      '<form id="tnt-pw-form" class="tnt-pw-form">' +
      '<label for="tnt-pw-current">Current password</label>' +
      '<input id="tnt-pw-current" type="password" autocomplete="current-password" required maxlength="128">' +
      '<label for="tnt-pw-new">New password</label>' +
      '<input id="tnt-pw-new" type="password" autocomplete="new-password" required maxlength="128">' +
      '<label for="tnt-pw-confirm">Confirm new password</label>' +
      '<input id="tnt-pw-confirm" type="password" autocomplete="new-password" required maxlength="128">' +
      '<div id="tnt-pw-error" class="tnt-pw-error" hidden></div>' +
      '<div class="tnt-pw-actions">' +
      '<button type="button" class="tnt-pw-cancel" id="tnt-pw-cancel">Cancel</button>' +
      '<button type="submit" class="tnt-pw-save" id="tnt-pw-save">Save</button>' +
      '</div></form></div>';

    document.body.appendChild(backdrop);

    function close() {
      backdrop.remove();
    }

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close();
    });
    document.getElementById('tnt-pw-cancel').addEventListener('click', close);

    document.getElementById('tnt-pw-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var errEl = document.getElementById('tnt-pw-error');
      var saveBtn = document.getElementById('tnt-pw-save');
      var currentPassword = document.getElementById('tnt-pw-current').value;
      var newPassword = document.getElementById('tnt-pw-new').value;
      var confirmPassword = document.getElementById('tnt-pw-confirm').value;

      errEl.hidden = true;
      errEl.textContent = '';

      if (newPassword !== confirmPassword) {
        errEl.hidden = false;
        errEl.textContent = 'New passwords do not match.';
        return;
      }

      saveBtn.disabled = true;
      try {
        var res = await fetch('/api/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword, confirmPassword: confirmPassword }),
        });
        var data = await res.json().catch(function () {
          return { ok: false, error: 'Unexpected server response.' };
        });
        if (!res.ok || !data.ok) {
          errEl.hidden = false;
          errEl.textContent = data.error || 'Could not update password.';
          saveBtn.disabled = false;
          return;
        }
        close();
        toast('Password updated successfully.', 'ok');
      } catch (_) {
        errEl.hidden = false;
        errEl.textContent = 'Unable to reach the server.';
        saveBtn.disabled = false;
      }
    });

    document.getElementById('tnt-pw-current').focus();
  }

  // ── UX: welcome strip ──────────────────────────────────────────────
  function mountWelcome() {
    var user = window.__TNT_USER__;
    var topbar = document.querySelector('.main-topbar');
    var main = document.querySelector('.main');
    if (!main || document.getElementById('tnt-welcome')) return;

    var name = (user && (user.displayName || user.username)) || 'there';
    // Prefer first name / username for the greeting like the mockup
    var greet = name;
    if (user && user.username) greet = user.username;
    else if (name.indexOf(' ') > 0) greet = name.split(/\s+/)[0];

    var bar = document.createElement('div');
    bar.id = 'tnt-welcome';
    bar.className = 'tnt-welcome';
    bar.innerHTML =
      '<span class="tnt-welcome-ico" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
      '</span>' +
      '<div class="tnt-welcome-text">' +
      'Welcome back, <strong></strong> — filter corridors in the sidebar, then open a row for full voyage &amp; TNT context.' +
      '</div>' +
      '<button type="button" class="tnt-welcome-dismiss" id="tnt-welcome-dismiss" aria-label="Dismiss welcome">×</button>';
    bar.querySelector('strong').textContent = greet;

    if (topbar) {
      topbar.insertBefore(bar, topbar.firstChild);
    } else {
      main.insertBefore(bar, main.firstChild);
    }

    var dismiss = document.getElementById('tnt-welcome-dismiss');
    if (dismiss) {
      dismiss.addEventListener('click', function () {
        sessionStorage.setItem('tnt-welcome-dismissed', '1');
        bar.remove();
      });
    }
  }

  // ── UX: search shortcut hint ───────────────────────────────────────
  function mountSearchHint() {
    var input = document.getElementById('f-q');
    if (!input || input.closest('.tnt-search-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'tnt-search-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var ico = document.createElement('span');
    ico.className = 'tnt-search-ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">' +
      '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
    wrap.appendChild(ico);
    var kbd = document.createElement('span');
    kbd.className = 'tnt-kbd';
    kbd.textContent = '/';
    kbd.title = 'Press / to focus search';
    wrap.appendChild(kbd);
    input.setAttribute('aria-label', 'Search ports, commodities, and companies');
    input.placeholder = 'Search ports, commodities, companies…';
  }

  // ── UX: bottom help bar ────────────────────────────────────────────
  function mountHelpBar() {
    var body = document.querySelector('.app-body');
    if (!body || document.getElementById('tnt-help-bar')) return;
    var shell = document.createElement('div');
    shell.id = 'tnt-help-bar';
    shell.className = 'tnt-help-bar';
    shell.innerHTML =
      '<div class="tnt-help-hints">' +
      '<span><kbd>/</kbd> Search</span>' +
      '<span><kbd>\\</kbd> Filters</span>' +
      '<span><kbd>Esc</kbd> Close</span>' +
      '<span>Click a corridor row for towage & TNT context</span>' +
      '</div>' +
      '<button type="button" class="tnt-help-open" id="tnt-help-open">Keyboard shortcuts</button>';
    var appRoot = body.parentNode;
    if (appRoot) appRoot.appendChild(shell);
    document.getElementById('tnt-help-open').addEventListener('click', openHelpModal);
  }

  function fixHelpBarLayout() {
    var help = document.getElementById('tnt-help-bar');
    var body = document.body;
    if (!help || !body) return;
    if (help.parentNode !== body) body.appendChild(help);
  }

  function openHelpModal() {
    if (document.getElementById('tnt-help-modal')) return;
    var modal = document.createElement('div');
    modal.id = 'tnt-help-modal';
    modal.className = 'tnt-help-modal';
    modal.innerHTML =
      '<div class="tnt-help-dialog" role="dialog" aria-modal="true" aria-labelledby="tnt-help-title">' +
      '<h2 id="tnt-help-title">Keyboard shortcuts</h2>' +
      '<p>Work faster across corridors, analytics, and reports.</p>' +
      '<ul class="tnt-help-list">' +
      '<li><span>Focus search</span><kbd>/</kbd></li>' +
      '<li><span>Show or hide filters</span><kbd>\\</kbd></li>' +
      '<li><span>Close detail / dialogs</span><kbd>Esc</kbd></li>' +
      '<li><span>Open shortcuts</span><kbd>?</kbd></li>' +
      '<li><span>Move between tabs</span><kbd>← →</kbd></li>' +
      '<li><span>Open a corridor</span><span>Click a table row</span></li>' +
      '</ul>' +
      '<button type="button" class="tnt-help-close" id="tnt-help-close">Got it</button>' +
      '</div>';
    document.body.appendChild(modal);
    function close() {
      modal.remove();
    }
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    document.getElementById('tnt-help-close').addEventListener('click', close);
    document.getElementById('tnt-help-close').focus();
  }

  // ── UX: sidebar collapse + mobile filter drawer ────────────────────
  function setFiltersOpen(open) {
    document.body.classList.toggle('tnt-filters-open', !!open);
    var btn = document.getElementById('tnt-sidebar-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', open || !document.body.classList.contains('tnt-sidebar-collapsed') ? 'true' : 'false');
      var label = btn.querySelector('.tnt-toggle-label');
      if (label) {
        if (isNarrow()) label.textContent = open ? 'Hide filters' : 'Filters';
        else label.textContent = document.body.classList.contains('tnt-sidebar-collapsed') ? 'Show filters' : 'Hide filters';
      }
    }
  }

  function setSidebarCollapsed(collapsed) {
    document.body.classList.toggle('tnt-sidebar-collapsed', !!collapsed);
    lsSet('tnt-sidebar-collapsed', collapsed ? '1' : '0');
    if (!isNarrow()) setFiltersOpen(!collapsed);
    var btn = document.getElementById('tnt-sidebar-toggle');
    if (btn) {
      var label = btn.querySelector('.tnt-toggle-label');
      if (label && !isNarrow()) {
        label.textContent = collapsed ? 'Show filters' : 'Hide filters';
      }
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.title = (collapsed ? 'Show' : 'Hide') + ' filter sidebar (\\)';
    }
  }

  function toggleFilters() {
    if (isNarrow()) {
      setFiltersOpen(!document.body.classList.contains('tnt-filters-open'));
      return;
    }
    setSidebarCollapsed(!document.body.classList.contains('tnt-sidebar-collapsed'));
  }

  function mountSidebarControls() {
    if (document.getElementById('tnt-sidebar-toggle')) return;

    var headerTop = document.querySelector('.header-top');
    if (headerTop) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'tnt-sidebar-toggle';
      btn.className = 'tnt-sidebar-toggle';
      btn.innerHTML = '<span class="tnt-toggle-label">Hide filters</span> <kbd>\\</kbd>';
      btn.setAttribute('aria-controls', 'tnt-filter-sidebar');
      btn.addEventListener('click', toggleFilters);
      var brand = headerTop.querySelector('.header-brand');
      if (brand && brand.nextSibling) headerTop.insertBefore(btn, brand.nextSibling);
      else headerTop.insertBefore(btn, headerTop.firstChild);
    }

    var sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.id = sidebar.id || 'tnt-filter-sidebar';
      sidebar.setAttribute('aria-label', 'Filters');
    }

    if (!document.getElementById('tnt-sidebar-backdrop')) {
      var backdrop = document.createElement('div');
      backdrop.id = 'tnt-sidebar-backdrop';
      backdrop.className = 'tnt-sidebar-backdrop';
      backdrop.addEventListener('click', function () {
        setFiltersOpen(false);
      });
      document.body.appendChild(backdrop);
    }

    var preferCollapsed = lsGet('tnt-sidebar-collapsed', '0') === '1';
    if (!isNarrow() && preferCollapsed) setSidebarCollapsed(true);
    else setSidebarCollapsed(false);

    window.addEventListener('resize', function () {
      if (isNarrow()) {
        document.body.classList.remove('tnt-sidebar-collapsed');
        setFiltersOpen(false);
      } else {
        setFiltersOpen(false);
        setSidebarCollapsed(lsGet('tnt-sidebar-collapsed', '0') === '1');
      }
    });
  }

  // ── UX: quick filter presets ───────────────────────────────────────
  function mountQuickFilters() {
    var main = document.querySelector('.main');
    var resBar = document.querySelector('.res-bar');
    if (!main || !resBar || document.getElementById('tnt-quick-filters')) return;

    var bar = document.createElement('div');
    bar.id = 'tnt-quick-filters';
    bar.className = 'tnt-quick-filters';
    bar.innerHTML =
      '<span class="tnt-quick-label">Quick</span>' +
      '<button type="button" class="tnt-chip" data-preset="prompt">Prompt opportunities</button>' +
      '<button type="button" class="tnt-chip" data-preset="any">Any TNT</button>' +
      '<button type="button" class="tnt-chip" data-preset="energy">Energy</button>' +
      '<button type="button" class="tnt-chip" data-preset="minerals">Minerals</button>' +
      '<button type="button" class="tnt-chip" data-preset="clear">Clear quick filters</button>';

    main.insertBefore(bar, resBar);

    function syncActive() {
      var tp = (document.getElementById('f-tp') || {}).value || '';
      var g = (document.getElementById('f-g') || {}).value || '';
      bar.querySelectorAll('.tnt-chip[data-preset]').forEach(function (chip) {
        var p = chip.getAttribute('data-preset');
        var on =
          (p === 'prompt' && tp === 'both') ||
          (p === 'any' && tp === 'any') ||
          (p === 'energy' && g === 'Energy') ||
          (p === 'minerals' && g === 'Minerals');
        chip.classList.toggle('active', !!on);
      });
    }

    bar.addEventListener('click', function (e) {
      var chip = e.target.closest('.tnt-chip');
      if (!chip) return;
      var preset = chip.getAttribute('data-preset');
      var tp = document.getElementById('f-tp');
      var g = document.getElementById('f-g');
      if (preset === 'clear') {
        if (tp) tp.value = '';
        if (g) g.value = '';
        toast('Quick filters cleared.', 'info');
      } else if (preset === 'prompt') {
        if (tp) tp.value = tp.value === 'both' ? '' : 'both';
      } else if (preset === 'any') {
        if (tp) tp.value = tp.value === 'any' ? '' : 'any';
      } else if (preset === 'energy') {
        if (g) g.value = g.value === 'Energy' ? '' : 'Energy';
      } else if (preset === 'minerals') {
        if (g) g.value = g.value === 'Minerals' ? '' : 'Minerals';
      }
      if (typeof go === 'function') go();
      syncActive();
      if (isNarrow()) setFiltersOpen(false);
    });

    window.__tntSyncQuickFilters = syncActive;
    syncActive();
  }

  // ── UX: debounce search + volume inputs ────────────────────────────
  function mountDebouncedInputs() {
    ['f-q', 'f-m'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.tntDebounced) return;
      el.dataset.tntDebounced = '1';
      el.removeAttribute('oninput');
      var timer = null;
      el.addEventListener('input', function () {
        markUpdating(true);
        clearTimeout(timer);
        timer = setTimeout(function () {
          if (typeof go === 'function') go();
        }, id === 'f-q' ? 220 : 280);
      });
    });
  }

  function markUpdating(on) {
    var count = document.querySelector('.res-count');
    if (!count) return;
    count.classList.toggle('tnt-updating', !!on);
    var dot = count.querySelector('.tnt-updating-dot');
    if (on && !dot) {
      dot = document.createElement('span');
      dot.className = 'tnt-updating-dot';
      dot.setAttribute('aria-hidden', 'true');
      count.insertBefore(dot, count.firstChild);
    }
    if (!on && dot) dot.remove();
  }

  // ── UX: persist view tab + page size ───────────────────────────────
  function restorePreferences() {
    var pgsz = document.getElementById('pgsz');
    var savedSize = lsGet('tnt-page-size', '');
    var sizeChanged = false;
    if (pgsz && savedSize && pgsz.value !== savedSize) {
      pgsz.value = savedSize;
      sizeChanged = true;
    }
    if (pgsz && !pgsz.dataset.tntPersist) {
      pgsz.dataset.tntPersist = '1';
      pgsz.addEventListener('change', function () {
        lsSet('tnt-page-size', pgsz.value);
      });
    }
    if (sizeChanged && typeof go === 'function') {
      try {
        go();
      } catch (_) { /* ignore */ }
    }
    var savedView = lsGet('tnt-view', '');
    if (savedView && savedView !== 'table' && typeof sw === 'function' &&
        ['table', 'analytics', 'multiport', 'report'].indexOf(savedView) !== -1) {
      try {
        sw(savedView);
      } catch (_) { /* ignore */ }
    }
  }

  function persistView(v) {
    lsSet('tnt-view', v);
  }

  // ── UX: scroll-to-top on table ─────────────────────────────────────
  function mountScrollTop() {
    var wrap = document.querySelector('#vw-table .tbl-wrap');
    var view = document.getElementById('vw-table');
    if (!wrap || !view || document.getElementById('tnt-scroll-top')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'tnt-scroll-top';
    btn.className = 'tnt-scroll-top';
    btn.title = 'Back to top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.textContent = '↑';
    view.appendChild(btn);
    wrap.addEventListener('scroll', function () {
      btn.classList.toggle('visible', wrap.scrollTop > 280);
    });
    btn.addEventListener('click', function () {
      wrap.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── UX: accessibility on sidebar sections ──────────────────────────
  function polishSidebarA11y() {
    document.querySelectorAll('.sidebar-section').forEach(function (sec, i) {
      var hdr = sec.querySelector('.sec-hdr');
      var body = sec.querySelector('.sec-body');
      if (!hdr || !body) return;
      var id = body.id || 'tnt-sec-' + i;
      body.id = id;
      hdr.setAttribute('role', 'button');
      hdr.setAttribute('tabindex', '0');
      hdr.setAttribute('aria-controls', id);
      hdr.setAttribute('aria-expanded', body.classList.contains('open') ? 'true' : 'false');
      if (!hdr.dataset.tntA11y) {
        hdr.dataset.tntA11y = '1';
        hdr.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            hdr.click();
          }
        });
        hdr.addEventListener('click', function () {
          setTimeout(function () {
            hdr.setAttribute('aria-expanded', body.classList.contains('open') ? 'true' : 'false');
          }, 0);
        });
      }
    });
  }

  // ── UX: active filter count badge ──────────────────────────────────
  function countActiveFilters() {
    if (typeof FIDS === 'undefined') return 0;
    var n = 0;
    Object.keys(FIDS).forEach(function (k) {
      var el = document.getElementById(FIDS[k]);
      if (el && String(el.value || '').trim()) n += 1;
    });
    return n;
  }

  function updateFilterBadge() {
    var btn = document.querySelector('.sb-actions .btn-out');
    if (!btn) return;
    var badge = btn.querySelector('.tnt-filter-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tnt-filter-badge';
      badge.setAttribute('aria-hidden', 'true');
      btn.appendChild(badge);
    }
    var n = countActiveFilters();
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = String(n);
      btn.title = n + ' active filter' + (n === 1 ? '' : 's') + ' — click to reset';
    } else {
      badge.hidden = true;
      badge.textContent = '';
      btn.title = 'Reset all filters';
    }
  }

  if (typeof go === 'function') {
    var _go = go;
    window.go = function () {
      // Rebuild F with dash-normalized TNT presence checks (do not rely on post-filter).
      var f = getF();
      F = DATA.filter(function (r) {
        if (f.q) {
          var hay = [r.o, r.d, r.co, r.cd, r.c, r.v]
            .concat(r.ow || [], r.ch || [], r.tw || [], r.tx || [])
            .join(' ')
            .toLowerCase();
          if (hay.indexOf(f.q) === -1) return false;
        }
        if (f.o && r.o !== f.o) return false;
        if (f.d && r.d !== f.d) return false;
        if (f.co && r.co !== f.co) return false;
        if (f.cd && r.cd !== f.cd) return false;
        if (f.g && r.g !== f.g) return false;
        if (f.c && r.c !== f.c) return false;
        if (f.v && r.v !== f.v) return false;
        if (f.m && r.mt < f.m) return false;
        if (f.ow && !(r.ow || []).includes(f.ow)) return false;
        if (f.ch && !(r.ch || []).includes(f.ch)) return false;
        if (f.tg && !(r.tw || []).includes(f.tg) && !(r.tx || []).includes(f.tg)) return false;
        if (f.tm && !(r.to || '').includes(f.tm) && !(r.td || '').includes(f.tm)) return false;
        if (f.tp === 'both' && r.tf !== '> Origin / > Dest') return false;
        if (f.tp === 'any' && noTnt(r.tf)) return false;
        if (f.tp === 'none' && hasTnt(r.tf)) return false;
        return true;
      });
      F.sort(function (a, b) {
        return typeof a[SK] === 'string'
          ? SD * a[SK].localeCompare(b[SK])
          : SD * (a[SK] - b[SK]);
      });
      PG = 1;
      updSum();
      updPills(f);
      render();
      markUpdating(false);
      updateFilterBadge();
      polishTableEmpty();
      polishOtherEmpty();
      if (typeof window.__tntSyncQuickFilters === 'function') window.__tntSyncQuickFilters();
    };
  }

  if (typeof rst === 'function') {
    var _rst = rst;
    window.rst = function () {
      _rst();
      if (typeof window.__tntSyncQuickFilters === 'function') window.__tntSyncQuickFilters();
      toast('All filters cleared.', 'info');
    };
  }

  // Persist view when switching tabs (wrap existing patched sw)
  if (typeof sw === 'function') {
    var _swPersist = sw;
    window.sw = function (v) {
      _swPersist(v);
      persistView(v);
      if (isNarrow()) setFiltersOpen(false);
    };
  }

  function isTypingTarget(el) {
    var tag = (el && el.tagName) || '';
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable);
  }

  // ── UX: global keyboard shortcuts ──────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var help = document.getElementById('tnt-help-modal');
      if (help) {
        help.remove();
        return;
      }
      var pw = document.getElementById('tnt-pw-modal');
      if (pw) {
        pw.remove();
        return;
      }
      if (document.body.classList.contains('tnt-filters-open')) {
        setFiltersOpen(false);
        return;
      }
      var dp = document.getElementById('dp');
      if (dp && dp.classList.contains('open') && typeof clsDp === 'function') clsDp();
      return;
    }

    if (isTypingTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === '/') {
      e.preventDefault();
      var q = document.getElementById('f-q');
      if (q) {
        if (isNarrow()) setFiltersOpen(true);
        else if (document.body.classList.contains('tnt-sidebar-collapsed')) setSidebarCollapsed(false);
        q.focus();
        q.select();
      }
      return;
    }

    if (e.key === '\\') {
      e.preventDefault();
      toggleFilters();
      return;
    }

    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      openHelpModal();
    }
  });

  // ── UX: click-outside closes detail panel ──────────────────────────
  document.addEventListener('click', function (e) {
    var dp = document.getElementById('dp');
    if (!dp || !dp.classList.contains('open')) return;
    if (dp.contains(e.target)) return;
    if (e.target.closest && e.target.closest('tbody tr')) return;
    if (e.target.closest && e.target.closest('.mp-card')) return;
    if (typeof clsDp === 'function') clsDp();
  });

  // Track detail panel open state for body class
  var dpEl = document.getElementById('dp');
  if (dpEl && typeof MutationObserver !== 'undefined') {
    new MutationObserver(function () {
      document.body.classList.toggle('tnt-dp-open', dpEl.classList.contains('open'));
    }).observe(dpEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── UX: empty-state polish for report ──────────────────────────────
  function polishEmpty() {
    var wrap = document.getElementById('rpt-wrap');
    if (!wrap) return;
    if (!wrap.querySelector('.empty')) return;
    var h3 = wrap.querySelector('.empty h3');
    if (h3 && !h3.dataset.polished) {
      h3.dataset.polished = '1';
      h3.insertAdjacentHTML(
        'afterend',
        '<p class="tnt-hint">Choose Group By dimensions, optionally refine with Query filters, then click <strong>Generate Report</strong>.</p>'
      );
    }
  }

  function ensureEmptyCta(empty, label, onClick) {
    if (!empty || empty.querySelector('.tnt-empty-cta')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tnt-empty-cta';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    empty.appendChild(btn);
  }

  function polishTableEmpty() {
    var empty = document.querySelector('#vw-table .empty');
    if (!empty) return;
    var p = empty.querySelector('p');
    if (p && !empty.dataset.polishedText) {
      empty.dataset.polishedText = '1';
      p.textContent = 'Try broadening your search, or clear filters to see all corridors again.';
    }
    ensureEmptyCta(empty, 'Clear all filters', function () {
      if (typeof rst === 'function') rst();
    });
  }

  function polishOtherEmpty() {
    document.querySelectorAll('#vw-multiport .empty, #vw-analytics .empty').forEach(function (empty) {
      if (empty.dataset.polishedHint) return;
      empty.dataset.polishedHint = '1';
      if (!empty.querySelector('.tnt-hint')) {
        var hint = document.createElement('p');
        hint.className = 'tnt-hint';
        hint.textContent =
          empty.closest('#vw-multiport')
            ? 'Widen filters or choose “Any TNT presence” to surface more recruit corridors.'
            : 'Adjust sidebar filters to refresh these charts for the corridors you care about.';
        empty.appendChild(hint);
      }
      ensureEmptyCta(empty, 'Clear all filters', function () {
        if (typeof rst === 'function') rst();
      });
    });
  }

  // ── UX: nav tabs titles + keyboard ─────────────────────────────────
  var NAV_TITLES = [
    'Browse and filter trade corridors',
    'Charts for volume, coverage, and members',
    'Prompt opportunities and one-sided TNT corridors',
    'Build custom grouped reports and export',
  ];

  document.querySelectorAll('.nav-tab').forEach(function (tab, i) {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('tabindex', tab.classList.contains('active') ? '0' : '-1');
    if (NAV_TITLES[i]) tab.title = NAV_TITLES[i];
    tab.addEventListener('keydown', function (e) {
      var tabs = Array.prototype.slice.call(document.querySelectorAll('.nav-tab'));
      var idx = tabs.indexOf(tab);
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tab.click();
        return;
      }
      var next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % tabs.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = tabs.length - 1;
      if (next >= 0) {
        e.preventDefault();
        tabs.forEach(function (t, j) {
          t.setAttribute('tabindex', j === next ? '0' : '-1');
        });
        tabs[next].focus();
      }
    });
    tab.addEventListener('click', function () {
      document.querySelectorAll('.nav-tab').forEach(function (t) {
        t.setAttribute('tabindex', t === tab ? '0' : '-1');
      });
    });
  });

  // Summary card tooltips
  document.querySelectorAll('.sc').forEach(function (card) {
    var lbl = card.querySelector('.sc-lbl');
    if (lbl && !card.title) card.title = 'Click to filter by: ' + lbl.textContent.trim();
  });

  // Open Towage & TNT section by default for discoverability
  function openKeySidebarSections() {
    document.querySelectorAll('.sidebar-section').forEach(function (sec) {
      var hdr = sec.querySelector('.sec-hdr');
      var body = sec.querySelector('.sec-body');
      if (!hdr || !body) return;
      var label = (hdr.textContent || '').toLowerCase();
      if (label.indexOf('towage') !== -1 && !body.classList.contains('open')) {
        body.classList.add('open');
      }
    });
  }

  // ── Dashboard shell: dark filter sidebar with horizontal navigation ─
  var NAV_ICONS = {
    table:
      '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>',
    analytics:
      '<svg viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-6"/></svg>',
    multiport:
      '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="M10.5 10.5l3 3"/></svg>',
    report:
      '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>',
  };

  var SC_ICONS = [
    { cls: 'blue', svg: '<svg viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-5"/><path d="M12 15V7"/><path d="M16 15v-3"/></svg>' },
    { cls: 'teal', svg: '<svg viewBox="0 0 24 24"><path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7z"/><path d="M9 12l2 2 4-4"/></svg>' },
    { cls: 'purple', svg: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V6l-8-3-8 3v6c0 6 8 10 8 10z"/></svg>' },
    { cls: 'red', svg: '<svg viewBox="0 0 24 24"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 4.3L2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/></svg>' },
    { cls: 'amber', svg: '<svg viewBox="0 0 24 24"><path d="M3 17l6-8 4 5 3-4 5 7"/><path d="M3 17h18"/></svg>' },
    { cls: 'cyan', svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' },
  ];

  var SC_LABELS = [
    'Total Corridors',
    'Prompt Opportunities',
    'TNT Present',
    'Without TNT',
    'Total Volume',
    'TNT Coverage (Voyages)',
  ];

  var COUNTRY_FLAG = {
    'Saudi Arabia': '🇸🇦', China: '🇨🇳', Brazil: '🇧🇷', Australia: '🇦🇺', USA: '🇺🇸',
    'United States': '🇺🇸', Singapore: '🇸🇬', Netherlands: '🇳🇱', Germany: '🇩🇪',
    'United Kingdom': '🇬🇧', UK: '🇬🇧', India: '🇮🇳', Japan: '🇯🇵', Korea: '🇰🇷',
    'South Korea': '🇰🇷', UAE: '🇦🇪', 'United Arab Emirates': '🇦🇪', Qatar: '🇶🇦',
    Kuwait: '🇰🇼', Oman: '🇴🇲', Iraq: '🇮🇶', Iran: '🇮🇷', Russia: '🇷🇺',
    Norway: '🇳🇴', Spain: '🇪🇸', France: '🇫🇷', Italy: '🇮🇹', Belgium: '🇧🇪',
    'South Africa': '🇿🇦', Nigeria: '🇳🇬', Angola: '🇦🇴', Canada: '🇨🇦',
    Mexico: '🇲🇽', Chile: '🇨🇱', Argentina: '🇦🇷', Colombia: '🇨🇴', Peru: '🇵🇪',
    Indonesia: '🇮🇩', Malaysia: '🇲🇾', Thailand: '🇹🇭', Vietnam: '🇻🇳',
    Philippines: '🇵🇭', Taiwan: '🇹🇼', Egypt: '🇪🇬', Turkey: '🇹🇷', Greece: '🇬🇷',
    Poland: '🇵🇱', Sweden: '🇸🇪', Denmark: '🇩🇰', Finland: '🇫🇮', Portugal: '🇵🇹',
    Morocco: '🇲🇦', Algeria: '🇩🇿', Libya: '🇱🇾', Panama: '🇵🇦', Ecuador: '🇪🇨',
    Venezuela: '🇻🇪', Uruguay: '🇺🇾', 'New Zealand': '🇳🇿', Kazakhstan: '🇰🇿',
  };

  var GROUP_EMOJI = {
    Energy: '🛢️', Minerals: '⛏️', Agri: '🌾', Reefer: '❄️', Forest: '🪵',
  };

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function flagFor(country) {
    return COUNTRY_FLAG[country] || '🌐';
  }

  function mountDashboardShell() {
    if (document.body.dataset.tntShellMounted === '1') return true;

    var header = document.querySelector('.app-header');
    var sidebar = document.querySelector('.sidebar');
    var main = document.querySelector('.main');
    if (!header || !sidebar || !main) return false;

    var brand = header.querySelector('.header-brand');
    var nav = header.querySelector('.nav-tabs');
    var scroll = sidebar.querySelector('.sidebar-scroll');

    if (brand) {
      brand.classList.add('sidebar-brand');
      sidebar.insertBefore(brand, sidebar.firstChild);
    }

    if (nav) {
      nav.classList.remove('sidebar-nav');
      nav.classList.add('main-nav');

      var views = ['table', 'analytics', 'multiport', 'report'];
      var labels = ['Corridors', 'Analytics', 'Multi-Port', 'Report Builder'];
      nav.querySelectorAll('.nav-tab').forEach(function (tab, i) {
        var key = views[i] || 'table';
        tab.innerHTML =
          '<span class="nav-ico" aria-hidden="true">' + (NAV_ICONS[key] || '') + '</span>' +
          '<span>' + labels[i] + '</span>';
        tab.setAttribute('data-view', key);
      });
    }

    if (scroll && !document.getElementById('tnt-filters-hdr')) {
      var fhdr = document.createElement('div');
      fhdr.id = 'tnt-filters-hdr';
      fhdr.className = 'tnt-filters-hdr';
      fhdr.innerHTML =
        '<span>Filters</span>' +
        '<button type="button" class="tnt-reset-all" id="tnt-reset-all">Reset all</button>';
      sidebar.insertBefore(fhdr, scroll);
      fhdr.querySelector('#tnt-reset-all').addEventListener('click', function () {
        if (typeof rst === 'function') rst();
      });
    }

    // Promote search out of accordion so it sits under FILTERS like the mockup
    var searchInput = document.getElementById('f-q');
    if (searchInput && !document.getElementById('tnt-filter-search')) {
      var searchSec = searchInput.closest('.sidebar-section');
      var searchHost = document.createElement('div');
      searchHost.id = 'tnt-filter-search';
      searchHost.className = 'tnt-filter-search';
      var fg = searchInput.closest('.fg') || searchInput.parentNode;
      searchHost.appendChild(fg);
      var insertBeforeEl = scroll || sidebar.querySelector('.sidebar-scroll');
      if (insertBeforeEl) {
        sidebar.insertBefore(searchHost, insertBeforeEl);
      }
      if (searchSec) searchSec.remove();
    }

    // Clean section headers (drop emoji, add chevron)
    sidebar.querySelectorAll('.sec-hdr').forEach(function (hdr) {
      var text = (hdr.textContent || '')
        .replace(/[▼▲▸▾▴›]/g, '')
        .replace(/[^\x20-\x7E&]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      // Fallback clean labels
      var lower = text.toLowerCase();
      if (lower.indexOf('search') !== -1) text = 'Search';
      else if (lower.indexOf('ports') !== -1) text = 'Ports & Countries';
      else if (lower.indexOf('commodity') !== -1) text = 'Commodity & Vessel';
      else if (lower.indexOf('operator') !== -1) text = 'Operators';
      else if (lower.indexOf('towage') !== -1) text = 'Towage & TNT';
      if (!text) text = 'Filters';
      hdr.innerHTML = '<span>' + escHtml(text) + '</span><span class="sec-chevron">›</span>';
    });

    var actions = sidebar.querySelector('.sb-actions');
    if (actions) {
      actions.innerHTML =
        '<button class="btn btn-out" type="button" id="tnt-btn-csv">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>' +
        'Export View (CSV)</button>' +
        '<button class="btn btn-grn" type="button" id="tnt-btn-report">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>' +
        'Report Builder</button>' +
        '<button class="btn btn-print" type="button" id="tnt-btn-print">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>' +
        'Print</button>';
      document.getElementById('tnt-btn-csv').addEventListener('click', function () {
        if (typeof csvExp === 'function') csvExp();
      });
      document.getElementById('tnt-btn-report').addEventListener('click', function () {
        if (typeof sw === 'function') sw('report');
      });
      document.getElementById('tnt-btn-print').addEventListener('click', function () {
        window.print();
      });
    }

    if (!document.getElementById('tnt-sidebar-foot')) {
      var foot = document.createElement('div');
      foot.id = 'tnt-sidebar-foot';
      foot.className = 'sidebar-foot';
      foot.innerHTML =
        '<button type="button" class="tnt-close-detail" id="tnt-close-detail">Close detail</button>' +
        '<p>Click a corridor row for full voyage &amp; TNT context.</p>';
      sidebar.appendChild(foot);
      foot.querySelector('#tnt-close-detail').addEventListener('click', function () {
        if (typeof clsDp === 'function') clsDp();
      });
    }

    // Main topbar host for welcome + user chrome
    if (!document.querySelector('.main-topbar')) {
      var topbar = document.createElement('div');
      topbar.className = 'main-topbar';
      main.insertBefore(topbar, main.firstChild);
    }

    var topbarEl = document.querySelector('.main-topbar');
    if (nav && topbarEl) {
      if (topbarEl.nextSibling) main.insertBefore(nav, topbarEl.nextSibling);
      else main.appendChild(nav);
    }

    if (topbarEl && !document.getElementById('tnt-mobile-filters')) {
      var mob = document.createElement('button');
      mob.type = 'button';
      mob.id = 'tnt-mobile-filters';
      mob.className = 'tnt-mobile-filters';
      mob.setAttribute('aria-label', 'Open filters');
      mob.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M4 6h16M7 12h10M10 18h4"/></svg>';
      topbarEl.insertBefore(mob, topbarEl.firstChild);
      mob.addEventListener('click', function () {
        toggleFilters();
      });
    }

    // Mockup order: summary cards above the results bar
    var sumBar = document.querySelector('.sum-bar');
    var resBar = document.querySelector('.res-bar');
    if (sumBar && resBar && resBar.nextElementSibling === sumBar) {
      main.insertBefore(sumBar, resBar);
    }

    // Metric cards
    if (sumBar) {
      sumBar.querySelectorAll('.sc').forEach(function (card, i) {
        var num = card.querySelector('.sc-num');
        var lbl = card.querySelector('.sc-lbl');
        if (!num) return;
        var ico = SC_ICONS[i] || SC_ICONS[0];
        var label = SC_LABELS[i] || (lbl ? lbl.textContent : '');
        var numHtml = num.outerHTML;
        card.innerHTML =
          '<span class="sc-ico ' + ico.cls + '" aria-hidden="true">' + ico.svg + '</span>' +
          '<div class="sc-body">' + numHtml + '<div class="sc-lbl">' + escHtml(label) + '</div></div>';
        // Restore inline color reset — CSS forces dark text
        var newNum = card.querySelector('.sc-num');
        if (newNum) newNum.removeAttribute('style');
      });
    }

    // Rows-per-page label via CSS; simplify select options text
    var pgsz = document.getElementById('pgsz');
    if (pgsz) {
      Array.prototype.forEach.call(pgsz.options, function (opt) {
        if (opt.value === '50') opt.textContent = '50';
        else if (opt.value === '100') opt.textContent = '100';
        else if (opt.value === '200') opt.textContent = '200';
        else if (opt.value === '9999') opt.textContent = 'All';
      });
    }

    // Add chevron column + tidy header labels (keep existing th nodes for sort listeners)
    var theadRow = document.querySelector('#vw-table thead tr');
    if (theadRow && !theadRow.querySelector('.th-chev')) {
      var th = document.createElement('th');
      th.className = 'th-chev';
      th.setAttribute('aria-hidden', 'true');
      theadRow.appendChild(th);
    }
    if (theadRow) {
      var headerLabels = [
        'Origin Port',
        'Destination Port',
        'Commodity',
        'Mt',
        'Voyage',
        'TNT',
        'Shipowners',
        'Charterers',
        'Towage — Origin',
        'Towage — Dest',
      ];
      theadRow.querySelectorAll('th').forEach(function (thEl, idx) {
        if (thEl.classList.contains('th-chev')) {
          thEl.textContent = '';
          return;
        }
        var label = headerLabels[idx] || (thEl.textContent || '').replace(/[↕↑↓]/g, '').trim();
        var showSort = idx <= 4;
        thEl.innerHTML = escHtml(label) + (showSort ? ' <span class="si">↕</span>' : '');
      });
    }

    // Hide legacy header completely
    header.setAttribute('hidden', 'hidden');
    header.style.display = 'none';

    // Apply shell styles only after DOM has been restructured
    document.body.classList.add('tnt-shell');
    document.body.dataset.tntShellMounted = '1';
    return true;
  }

  function enhanceTableRender() {
    if (typeof rndTbl !== 'function') return;

    window.rndTbl = function () {
      var ps = parseInt((document.getElementById('pgsz') || {}).value, 10) || 50;
      var st = (PG - 1) * ps;
      var rows = F.slice(st, st + ps);
      var tb = document.getElementById('tbody');
      if (!tb) return;

      if (!rows.length) {
        tb.innerHTML =
          '<tr><td colspan="11"><div class="empty"><h3>No corridors match</h3><p>Adjust filters</p></div></td></tr>';
        var pagEmpty = document.getElementById('pag');
        if (pagEmpty) pagEmpty.innerHTML = '';
        return;
      }

      function tBdg(r) {
        var check =
          '<span class="tnt-check" title="TNT present">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>' +
          '</span>';
        if (r.tf === '> Origin / > Dest') {
          return check + ' <span class="bdg bdg-b">' + escHtml(r.to) + ' + ' + escHtml(r.td) + '</span>';
        }
        if (r.tf === '> Origin') {
          return '<span class="bdg bdg-o">' + escHtml(r.to || 'Origin') + '</span>';
        }
        if (r.tf === '> Dest') {
          return '<span class="bdg bdg-d">' + escHtml(r.td || 'Dest') + '</span>';
        }
        return '<span class="bdg bdg-n">—</span>';
      }

      function tgs(a, cl) {
        if (!a || !a.length) return '<span style="color:#CBD5E1">—</span>';
        return a
          .slice(0, 3)
          .map(function (x) {
            return '<span class="tag ' + cl + '" title="' + escHtml(x) + '">' + escHtml(x) + '</span>';
          })
          .join('');
      }

      function twTgs(a) {
        if (!a || !a.length) return '<span style="color:#CBD5E1">—</span>';
        return a
          .slice(0, 3)
          .map(function (x) {
            var isT =
              /Towage|Sulnorte|Ocean|Fairplay|CPT/i.test(x);
            return (
              '<span class="tag ' +
              (isT ? 'tag-t' : 'tag-o') +
              '" title="' +
              escHtml(x) +
              '">' +
              escHtml(x) +
              '</span>'
            );
          })
          .join('');
      }

      function portCell(port, country) {
        return (
          '<div class="port-cell">' +
          '<span class="flag" title="' +
          escHtml(country) +
          '">' +
          flagFor(country) +
          '</span>' +
          '<div class="port-meta"><div class="pn">' +
          escHtml(port) +
          '</div><div class="cn">' +
          escHtml(country) +
          '</div></div></div>'
        );
      }

      function cmCell(r) {
        var g = r.g || '';
        var cls = String(g).toLowerCase().replace(/\s+/g, '');
        var emoji = GROUP_EMOJI[g] || '📦';
        return (
          '<div class="cm-cell">' +
          '<span class="cm-ico ' +
          escHtml(cls) +
          '">' +
          emoji +
          '</span>' +
          '<div><div class="cm">' +
          escHtml(r.c) +
          '</div><div class="gn">' +
          escHtml(g) +
          '</div></div></div>'
        );
      }

      tb.innerHTML = rows
        .map(function (r, i) {
          var rc =
            r.tf === '> Origin / > Dest' ? 'r-both' : r.tf && r.tf !== '-' ? 'r-one' : '';
          return (
            '<tr class="' +
            rc +
            '" onclick="shDp(' +
            (st + i) +
            ')">' +
            '<td>' +
            portCell(r.o, r.co) +
            '</td>' +
            '<td class="hi">' +
            portCell(r.d, r.cd) +
            '</td>' +
            '<td>' +
            cmCell(r) +
            '</td>' +
            '<td class="nr hi">' +
            r.mt.toFixed(1) +
            '</td>' +
            '<td class="nr hi">' +
            r.ca.toLocaleString() +
            '</td>' +
            '<td>' +
            tBdg(r) +
            '</td>' +
            '<td class="hi">' +
            tgs(r.ow, 'tag-o') +
            '</td>' +
            '<td class="hi">' +
            tgs(r.ch, 'tag-c') +
            '</td>' +
            '<td class="hi">' +
            twTgs(r.tw) +
            '</td>' +
            '<td class="hi">' +
            twTgs(r.tx) +
            '</td>' +
            '<td class="td-chev"><span class="row-chev">›</span></td>' +
            '</tr>'
          );
        })
        .join('');

      rndPag(F.length, ps);
    };

    window.rndPag = function (tot, ps) {
      var pages = Math.max(1, Math.ceil(tot / ps) || 1);
      var from = tot ? (PG - 1) * ps + 1 : 0;
      var to = Math.min(PG * ps, tot);
      var h =
        '<div class="pag-left">Showing ' +
        from.toLocaleString() +
        ' to ' +
        to.toLocaleString() +
        ' of ' +
        tot.toLocaleString() +
        ' corridors</div>';
      h += '<div class="pag-mid">';
      h +=
        '<button class="pb" type="button" ' +
        (PG <= 1 ? 'disabled' : '') +
        ' onclick="gp(' +
        Math.max(1, PG - 1) +
        ')">‹</button>';
      var s = Math.max(1, PG - 2);
      var e = Math.min(pages, PG + 2);
      if (s > 1) {
        h += '<button class="pb" type="button" onclick="gp(1)">1</button>';
        if (s > 2) h += '<span class="pi">…</span>';
      }
      for (var p = s; p <= e; p++) {
        h +=
          '<button class="pb' +
          (p === PG ? ' act' : '') +
          '" type="button" onclick="gp(' +
          p +
          ')">' +
          p +
          '</button>';
      }
      if (e < pages) {
        if (e < pages - 1) h += '<span class="pi">…</span>';
        h +=
          '<button class="pb" type="button" onclick="gp(' +
          pages +
          ')">' +
          pages +
          '</button>';
      }
      h +=
        '<button class="pb" type="button" ' +
        (PG >= pages ? 'disabled' : '') +
        ' onclick="gp(' +
        Math.min(pages, PG + 1) +
        ')">›</button>';
      h += '</div>';
      h +=
        '<div class="pag-right"><span>Go to page</span>' +
        '<input type="number" id="tnt-goto-page" min="1" max="' +
        pages +
        '" value="' +
        PG +
        '" aria-label="Go to page">' +
        '<button type="button" class="pb-go" id="tnt-goto-btn" aria-label="Go">›</button></div>';
      var pag = document.getElementById('pag');
      if (!pag) return;
      pag.innerHTML = h;
      var btn = document.getElementById('tnt-goto-btn');
      var inp = document.getElementById('tnt-goto-page');
      if (btn && inp) {
        function jump() {
          var n = parseInt(inp.value, 10);
          if (!n || n < 1) n = 1;
          if (n > pages) n = pages;
          gp(n);
        }
        btn.addEventListener('click', jump);
        inp.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') jump();
        });
      }
    };
  }

  function safeCall(fn) {
    try {
      return fn();
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[TNT] enhancement step failed:', err);
      }
      return undefined;
    }
  }

  function refreshEnhancedTable() {
    if (typeof rndTbl !== 'function') return;
    if (typeof F === 'undefined' || !F || !F.length) return;
    safeCall(function () {
      rndTbl();
    });
  }

  var bootDone = false;

  function boot() {
    var shellOk = !!safeCall(mountDashboardShell);
    if (!shellOk && document.body.dataset.tntShellMounted !== '1') {
      // App markup may not be ready yet (slow host / late parse) — retry below
      return false;
    }

    if (bootDone) {
      refreshEnhancedTable();
      return true;
    }
    bootDone = true;

    safeCall(applyBranding);
    safeCall(enhanceTableRender);
    safeCall(mountUserChrome);
    safeCall(mountSidebarControls);
    safeCall(mountWelcome);
    safeCall(mountSearchHint);
    safeCall(mountDebouncedInputs);
    // Quick filters / help bar intentionally omitted — not in the mockup shell
    safeCall(mountScrollTop);
    safeCall(openKeySidebarSections);
    safeCall(polishSidebarA11y);
    safeCall(restorePreferences);
    safeCall(polishEmpty);
    safeCall(polishTableEmpty);
    safeCall(polishOtherEmpty);
    safeCall(updateFilterBadge);

    refreshEnhancedTable();
    [50, 200, 800].forEach(function (ms) {
      setTimeout(refreshEnhancedTable, ms);
    });

    var observer = new MutationObserver(function () {
      polishEmpty();
      polishTableEmpty();
      polishOtherEmpty();
    });
    var rpt = document.getElementById('rpt-wrap');
    if (rpt) observer.observe(rpt, { childList: true, subtree: true });
    var tbl = document.querySelector('#vw-table .tbl-wrap');
    if (tbl) observer.observe(tbl, { childList: true, subtree: true });
    var mp = document.getElementById('mp-multiport') || document.getElementById('vw-multiport');
    if (mp) observer.observe(mp, { childList: true, subtree: true });
    var an = document.getElementById('vw-analytics');
    if (an) observer.observe(an, { childList: true, subtree: true });

    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('welcome') === '1') {
        toast('Signed in. Welcome to TNT Maritime Intelligence.', 'ok');
        params.delete('welcome');
        var next = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
        window.history.replaceState({}, '', next);
      }
    } catch (_) { /* ignore */ }

    return true;
  }

  function scheduleBoot() {
    safeCall(boot);
    // Retry until shell mounts — covers race with the large inline DATA script on slow hosts
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (document.body.dataset.tntShellMounted === '1' || attempts > 40) {
        clearInterval(timer);
        if (document.body.dataset.tntShellMounted === '1') refreshEnhancedTable();
        return;
      }
      safeCall(boot);
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleBoot);
  } else {
    scheduleBoot();
  }
  window.addEventListener('load', function () {
    if (document.body.dataset.tntShellMounted !== '1') scheduleBoot();
    else refreshEnhancedTable();
  });
})();
