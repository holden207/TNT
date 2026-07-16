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
      logo.src = LOGO_URL;
      logo.alt = 'Tug Network Team';
      logo.width = 56;
      logo.height = 56;
      logo.decoding = 'async';
    }

    var title = document.querySelector('.header-title h1');
    if (title && !title.dataset.branded) {
      title.dataset.branded = '1';
      title.textContent = 'TNT · Global Maritime Intelligence';
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

  // ── UX: user session bar + logout + password change ───────────────
  function mountUserChrome() {
    var user = window.__TNT_USER__;
    if (!user) return;

    var headerTop = document.querySelector('.header-top');
    if (!headerTop || document.getElementById('tnt-user-bar')) return;

    var bar = document.createElement('div');
    bar.id = 'tnt-user-bar';
    bar.className = 'tnt-user-bar';
    bar.innerHTML =
      '<img class="tnt-user-avatar" src="' + LOGO_URL + '" alt="" width="32" height="32">' +
      '<div class="tnt-user-meta">' +
      '<span class="tnt-user-name"></span>' +
      '<span class="tnt-user-role"></span>' +
      '</div>' +
      '<button type="button" class="tnt-logout" id="tnt-change-pw" title="Change your password">Password</button>' +
      '<button type="button" class="tnt-logout" id="tnt-logout" title="End your session">Sign out</button>';

    bar.querySelector('.tnt-user-name').textContent = user.displayName || user.username;
    bar.querySelector('.tnt-user-role').textContent = (user.role || '').toUpperCase();

    headerTop.appendChild(bar);

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

  // ── UX: welcome strip (once per session) ───────────────────────────
  function mountWelcome() {
    var user = window.__TNT_USER__;
    if (!user || sessionStorage.getItem('tnt-welcome-dismissed')) return;
    var main = document.querySelector('.main');
    if (!main || document.getElementById('tnt-welcome')) return;

    var name = user.displayName || user.username || 'there';
    var bar = document.createElement('div');
    bar.id = 'tnt-welcome';
    bar.className = 'tnt-welcome';
    bar.innerHTML =
      '<img src="' + LOGO_URL + '" alt="">' +
      '<div class="tnt-welcome-text">' +
      'Welcome back, <strong></strong> — use Quick filters below, press <kbd>/</kbd> to search, or open Multi-Port for recruit opportunities.' +
      '</div>' +
      '<button type="button" class="tnt-welcome-dismiss" id="tnt-welcome-dismiss" aria-label="Dismiss welcome">×</button>';
    bar.querySelector('strong').textContent = name;

    main.insertBefore(bar, main.firstChild);

    document.getElementById('tnt-welcome-dismiss').addEventListener('click', function () {
      sessionStorage.setItem('tnt-welcome-dismissed', '1');
      bar.remove();
    });
  }

  // ── UX: search shortcut hint ───────────────────────────────────────
  function mountSearchHint() {
    var input = document.getElementById('f-q');
    if (!input || input.closest('.tnt-search-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'tnt-search-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
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
      _go();
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

  function boot() {
    applyBranding();
    mountUserChrome();
    mountSidebarControls();
    mountWelcome();
    mountSearchHint();
    mountDebouncedInputs();
    mountQuickFilters();
    mountHelpBar();
    fixHelpBarLayout();
    mountScrollTop();
    openKeySidebarSections();
    polishSidebarA11y();
    restorePreferences();
    polishEmpty();
    polishTableEmpty();
    polishOtherEmpty();
    updateFilterBadge();

    var observer = new MutationObserver(function () {
      polishEmpty();
      polishTableEmpty();
      polishOtherEmpty();
    });
    var rpt = document.getElementById('rpt-wrap');
    if (rpt) observer.observe(rpt, { childList: true, subtree: true });
    var tbl = document.querySelector('#vw-table .tbl-wrap');
    if (tbl) observer.observe(tbl, { childList: true, subtree: true });
    var mp = document.getElementById('vw-multiport');
    if (mp) observer.observe(mp, { childList: true, subtree: true });
    var an = document.getElementById('vw-analytics');
    if (an) observer.observe(an, { childList: true, subtree: true });

    // Post-login toast via query flag
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('welcome') === '1') {
        toast('Signed in. Welcome to TNT Maritime Intelligence.', 'ok');
        params.delete('welcome');
        var next = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
        window.history.replaceState({}, '', next);
      }
    } catch (_) { /* ignore */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 0);
  }
})();
