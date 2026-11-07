/* =========================================================
   TEAMMANIX · Assenze (schermata 33), giocatore e staff
   Solo mockup: dati in memoria, oggi = giovedì 5 novembre 2026.
   Varianti: ?stato=vuoto | ?stato=chiusa | ?stato=errore
   Nessun motivo e nessun testo libero: solo date.
   ========================================================= */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var icon = function (n, c) { return '<svg class="tm-icon' + (c ? ' ' + c : '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  var TODAY = '2026-11-05';
  var MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  var GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

  var TEAMS_BASE = {
    u17: { label: 'Under 17', season: '2026/27', from: '2026-09-01', to: '2027-06-30', closed: false },
    u18: { label: 'Under 18', season: '2026/27', from: '2026-09-01', to: '2027-06-30', closed: false },
    u16: { label: 'Under 16', season: '2025/26', from: '2025-09-01', to: '2026-06-30', closed: true }
  };
  var ABS_BASE = [
    { id: 'a1', team: 'u17', start: '2026-11-03', end: '2026-11-15' },
    { id: 'a2', team: 'u17', start: '2026-12-21', end: '2027-01-06' },
    { id: 'a3', team: 'u17', start: '2026-10-12', end: '2026-10-14' },
    { id: 'a4', team: 'u16', start: '2026-04-22', end: '2026-04-25' }
  ];
  /* Eventi in cui la persona è già convocata (per il secondo passo) */
  var EVENTS = [
    { team: 'u17', date: '2026-11-07', time: '15:30', title: 'Partita contro US Pontassieve' },
    { team: 'u17', date: '2026-11-12', time: '18:30', title: 'Allenamento' },
    { team: 'u17', date: '2026-11-14', time: '15:00', title: 'Partita contro ASD Rignanese' },
    { team: 'u18', date: '2026-11-08', time: '10:30', title: 'Partita contro AC Bagno a Ripoli' },
    { team: 'u17', date: '2026-12-19', time: '15:00', title: 'Torneo di Natale' }
  ];

  /* Vista: 'atleta' (le mie assenze) oppure 'squadra' (staff: assenze della squadra + le proprie) */
  var VIEW = document.body.getAttribute('data-view') || 'atleta';
  var STAFF_OWN = [{ id: 'm1', team: 'u17', start: '2026-12-24', end: '2027-01-02' }];
  var TEAM_ABS = [
    { who: 'Elia Costa', role: 'Giocatore · n. 15', start: '2026-11-03', end: '2026-11-15' },
    { who: 'Christian Bellini', role: 'Giocatore · n. 25', start: '2026-11-01', end: '2026-11-15' },
    { who: 'Andrea Sodi', role: 'Staff · Preparatore', start: '2026-11-03', end: '2026-11-15' },
    { who: 'Paolo Ferretti', role: 'Staff · Vice', start: '2026-12-01', end: null },
    { who: 'Matteo Galli', role: 'Giocatore · n. 3', start: '2026-12-21', end: '2027-01-06' },
    { who: 'Marco Bertini', role: 'Staff · Allenatore, sei tu', start: '2026-12-24', end: '2027-01-02' },
    { who: 'Elia Costa', role: 'Giocatore · n. 15', start: '2026-10-12', end: '2026-10-14' }
  ];
  var TEAM;
  var TEAMS, ABS, readOnly, editing = null, seq = 10;
  var live = $('#as-live');

  function d(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function short(iso) { var x = d(iso); return x.getDate() + ' ' + MESI[x.getMonth()]; }
  function slash(iso) { var x = d(iso); return x.getDate() + '/' + (x.getMonth() + 1); }
  function day(iso) { var x = d(iso); return GIORNI[x.getDay()] + ' ' + x.getDate() + ' ' + MESI[x.getMonth()]; }
  function state(a) { if (a.end && a.end < TODAY) return 'passata'; if (a.start > TODAY) return 'futura'; return 'corso'; }
  var ST = { corso: ['warning', 'clock', 'In corso'], futura: ['info', 'calendar', 'Futura'], passata: ['', 'check', 'Passata'] };
  function stBadge(s) { var b = ST[s]; return '<span class="tm-badge' + (b[0] ? ' tm-badge--' + b[0] : '') + '" data-nuxt-ui="UBadge">' + icon(b[1]) + b[2] + '</span>'; }
  function period(a) { return a.end ? short(a.start) + ' – ' + short(a.end) : 'Dal ' + short(a.start); }
  function openTeams() { return Object.keys(TEAMS).filter(function (k) { return !TEAMS[k].closed; }); }

  /* ---------- Varianti (applicate sul posto, come nella convocazione) ---------- */
  function applyVariant(search) {
    var qs = new URLSearchParams(search || '');
    var stato = qs.get('stato');
    TEAMS = JSON.parse(JSON.stringify(TEAMS_BASE));
    ABS = JSON.parse(JSON.stringify(ABS_BASE));
    if (VIEW === 'squadra') {
      TEAMS = { u17: TEAMS.u17 };
      ABS = JSON.parse(JSON.stringify(STAFF_OWN));
      TEAM = stato === 'vuoto' ? [] : JSON.parse(JSON.stringify(TEAM_ABS));
    }
    if (stato === 'vuoto') ABS = [];
    if (stato === 'chiusa') { delete TEAMS.u17; delete TEAMS.u18; ABS = ABS.filter(function (a) { return a.team === 'u16'; }); }
    readOnly = openTeams().length === 0;
    $$('[data-new]').forEach(function (b) { b.disabled = readOnly; });
    $('[data-readonly-note]').hidden = !readOnly;
    $$('#dlg-eval [data-variant]').forEach(function (a) { if (a.getAttribute('href') === (search || '?')) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    render();
    if (stato === 'errore') setTimeout(function () { openForm(null, { team: 'u17', start: '2027-06-20', end: '2027-07-10' }); validate(); }, 50);
  }

  /* ---------- Elenco ---------- */
  function row(a) {
    var t = TEAMS[a.team], ro = t.closed;
    var days = a.end ? Math.round((d(a.end) - d(a.start)) / 86400000) + 1 : 0;
    var sub = a.end ? (days === 1 ? '1 giorno' : days + ' giorni') : 'Fino a nuovo avviso';
    var menu = '<div class="tm-menu-anchor" data-nuxt-ui="UDropdownMenu"><button type="button" class="tm-button tm-button--icon" aria-label="Azioni per l\'assenza ' + period(a) + '" aria-haspopup="menu" aria-expanded="false" aria-controls="menu-' + a.id + '" data-menu' + (ro ? ' disabled' : '') + ' data-nuxt-ui="UButton">' + icon('dots-v') + '</button>' +
      '<ul class="tm-menu" id="menu-' + a.id + '" role="menu" hidden><li role="none"><button type="button" class="tm-menu__item" role="menuitem" data-edit="' + a.id + '">' + icon('edit') + 'Modifica</button></li><li class="tm-menu__sep" role="separator"></li><li role="none"><button type="button" class="tm-menu__item tm-menu__item--danger" role="menuitem" data-delete="' + a.id + '">' + icon('trash') + 'Elimina</button></li></ul></div>';
    return '<li><div class="tm-row"><div class="tm-row__lead"><span class="tm-notif__icon">' + icon('calendar-x') + '</span></div><div class="tm-row__body"><span class="tm-row__title tm-period">' + period(a) + '</span><span class="tm-row__subtitle">' + sub + '</span><span class="tm-row__meta">' + stBadge(state(a)) + '</span></div><div class="tm-row__trail">' + menu + '</div></div></li>';
  }
  /* Vista squadra: elenco in sola lettura, raggruppato per stato */
  function renderTeam() {
    var box = $('[data-team]');
    if (!box) return;
    if (!TEAM.length) {
      box.innerHTML = '<div class="tm-card"><div class="tm-empty"><div class="tm-empty__icon">' + icon('calendar-x', 'tm-icon--md') + '</div><h2 class="tm-h2">Nessuna assenza in squadra</h2><p class="tm-empty__text">Quando un giocatore o un membro dello staff dichiara un\'assenza, la trovi qui.</p></div></div>';
      return;
    }
    box.innerHTML = [['corso', 'In corso'], ['futura', 'Future'], ['passata', 'Passate']].map(function (g) {
      var list = TEAM.filter(function (a) { return state(a) === g[0]; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
      if (!list.length) return '';
      return '<section class="tm-group" aria-labelledby="tg-' + g[0] + '"><h2 class="tm-group-title" id="tg-' + g[0] + '">' + g[1] + ' <span class="tm-group-title__count">' + list.length + '</span></h2><ul class="tm-list tm-list--card" role="list">' +
        list.map(function (a) {
          return '<li><div class="tm-row tm-row--no-trail" data-nuxt-ui="UUser"><div class="tm-row__lead"><span class="tm-avatar" aria-hidden="true">' + a.who.split(' ').map(function (w) { return w[0]; }).join('') + '</span></div>' +
            '<div class="tm-row__body"><span class="tm-row__title">' + a.who + '</span><span class="tm-row__subtitle">' + a.role + '</span><span class="tm-row__meta"><span class="tm-period">' + period(a) + '</span>' + stBadge(state(a)) + '</span></div></div></li>';
        }).join('') + '</ul></section>';
    }).join('');
  }
  function render() {
    renderTeam();
    var box = $('[data-groups]');
    if (!ABS.length) {
      box.innerHTML = '<div class="tm-card"><div class="tm-empty"><div class="tm-empty__icon">' + icon('calendar-x', 'tm-icon--md') + '</div><h2 class="tm-h2">Nessuna assenza</h2><p class="tm-empty__text">Se sai già che non potrai esserci, indicalo: lo staff lo vede quando prepara le convocazioni.</p>' +
        (readOnly ? '' : '<button type="button" class="tm-button" data-new data-nuxt-ui="UButton">' + icon('plus', 'tm-button__icon') + 'Imposta assenza</button>') + '</div></div>';
      $('[data-actionbar]').hidden = VIEW === 'atleta';
    } else {
      $('[data-actionbar]').hidden = false;
      box.innerHTML = Object.keys(TEAMS).map(function (k) {
        var t = TEAMS[k];
        var list = ABS.filter(function (a) { return a.team === k; }).sort(function (a, b) {
          /* In corso, poi future (dalla più vicina), poi passate (dalla più recente) */
          var r = { corso: 0, futura: 1, passata: 2 }, sa = state(a), sb = state(b);
          if (sa !== sb) return r[sa] - r[sb];
          return sa === 'passata' ? (a.start < b.start ? 1 : -1) : (a.start < b.start ? -1 : 1);
        });
        var head = '<h2 class="tm-group-title">' + t.label + ' · Stagione ' + t.season + (t.closed ? ' <span class="tm-badge" data-nuxt-ui="UBadge">' + icon('lock') + 'Chiusa</span>' : '') + '</h2>';
        var body = list.length ? '<ul class="tm-list tm-list--card" role="list">' + list.map(row).join('') + '</ul>' : '<p class="tm-text-muted tm-text-sm">Nessuna assenza per questa squadra.</p>';
        return '<section class="tm-group" aria-label="' + t.label + ', stagione ' + t.season + '">' + head + body + '</section>';
      }).join('');
    }
    if (readOnly) $('[data-actionbar]').hidden = false;
    var cur = ABS.filter(function (a) { return !TEAMS[a.team].closed && state(a) === 'corso'; })[0];
    $('[data-current]').hidden = !cur;
    if (cur) $('[data-current-text]').innerHTML = '<strong>Assenza in corso ' + (cur.end ? 'fino al ' + slash(cur.end) : 'fino a nuovo avviso') + '.</strong> Per lo staff risulti non disponibile in ' + TEAMS[cur.team].label + '.';
  }

  /* ---------- Modulo ---------- */
  var f = { team: $('#f-team'), start: $('#f-start'), end: $('#f-end'), open: $('#f-open'), err: $('#f-error'), season: $('#f-season') };
  function seasonHelp() {
    var t = TEAMS[f.team.value];
    f.season.textContent = 'La stagione ' + t.season + ' va dal ' + d(t.from).getDate() + ' ' + MESI[d(t.from).getMonth()] + ' ' + t.from.slice(0, 4) + ' al ' + d(t.to).getDate() + ' ' + MESI[d(t.to).getMonth()] + ' ' + t.to.slice(0, 4) + '.';
    f.start.min = f.end.min = t.from; f.start.max = f.end.max = t.to;
  }
  function setOpen(on) {
    f.open.setAttribute('aria-checked', on ? 'true' : 'false');
    f.end.disabled = on;
    if (on) f.end.value = '';
  }
  function openForm(a, preset) {
    editing = a;
    var src = a || preset || { team: openTeams()[0], start: '2026-11-10', end: '2026-11-15' };
    var opts = openTeams();
    f.team.innerHTML = opts.map(function (k) { return '<option value="' + k + '">' + TEAMS[k].label + ' · Stagione ' + TEAMS[k].season + '</option>'; }).join('');
    $('[data-team-field]').hidden = opts.length < 2;
    f.team.value = src.team; f.start.value = src.start; f.end.value = src.end || '';
    setOpen(!src.end);
    clearError();
    seasonHelp();
    $('[data-form-title]').textContent = a ? 'Modifica assenza' : 'Imposta assenza';
    $('[data-step="1"]').hidden = false; $('[data-step="2"]').hidden = true;
    TM.openDialog('dlg-form');
  }
  function clearError() {
    f.err.hidden = true;
    [f.start, f.end].forEach(function (i) { i.removeAttribute('aria-invalid'); i.setAttribute('aria-describedby', 'f-season'); });
  }
  function showError(msg, fields) {
    $('[data-error-text]').textContent = 'Errore: ' + msg;
    f.err.hidden = false;
    fields.forEach(function (i) { i.setAttribute('aria-invalid', 'true'); i.setAttribute('aria-describedby', 'f-season f-error'); });
  }
  function validate() {
    clearError();
    var t = TEAMS[f.team.value], s = f.start.value, e = f.open.getAttribute('aria-checked') === 'true' ? null : f.end.value;
    if (!s || (!e && f.open.getAttribute('aria-checked') !== 'true')) { showError('indica la data di inizio e quella di fine, oppure attiva "Fino a nuovo avviso".', [!s ? f.start : f.end]); return false; }
    if (s < t.from || s > t.to || (e && (e < t.from || e > t.to))) { showError('il periodo deve rientrare nelle date della stagione.', e && (e > t.to || e < t.from) ? [f.end] : [f.start]); return false; }
    if (e && e < s) { showError('la data di fine deve essere uguale o successiva a quella di inizio.', [f.end]); return false; }
    return { team: f.team.value, start: s, end: e };
  }
  function save() {
    var v = validate();
    if (!v) { (f.start.getAttribute('aria-invalid') ? f.start : f.end).focus(); return; }
    if (editing) { editing.team = v.team; editing.start = v.start; editing.end = v.end; }
    else ABS.push({ id: 'n' + (seq++), team: v.team, start: v.start, end: v.end });
    render();
    var conflicts = EVENTS.filter(function (ev) { return ev.team === v.team && ev.date >= v.start && (!v.end || ev.date <= v.end) && ev.date >= TODAY; });
    if (!conflicts.length) {
      TM.closeDialog($('#dlg-form'));
      TM.toast({ tone: 'success', title: 'Assenza salvata', text: ' ' + (v.end ? 'Dal ' + slash(v.start) + ' al ' + slash(v.end) + '.' : 'Dal ' + slash(v.start) + ', fino a nuovo avviso.') });
      return;
    }
    /* Secondo passo: eventi in cui era già convocato */
    $('[data-form-title]').textContent = 'Eri già convocato';
    $('[data-conflict-text]').textContent = 'Assenza salvata. Nel periodo risultavi convocato ' + (conflicts.length === 1 ? 'a questo evento' : 'a questi ' + conflicts.length + ' eventi') + ': vuoi declinare?';
    $('[data-conflicts]').innerHTML = conflicts.map(function (ev, i) {
      return '<li><div class="tm-row" data-conflict="' + i + '"><div class="tm-row__lead"><span class="tm-notif__icon">' + icon(ev.title.indexOf('Partita') === 0 ? 'match' : 'training') + '</span></div><div class="tm-row__body"><span class="tm-row__title tm-row__title--wrap">' + ev.title + '</span><span class="tm-row__subtitle">' + day(ev.date) + ' · ' + ev.time + '</span></div><div class="tm-row__trail"><button type="button" class="tm-button tm-button--secondary" data-decline="' + i + '" aria-label="Declina ' + ev.title + ', ' + day(ev.date) + '" data-nuxt-ui="UButton">Declina</button></div></div></li>';
    }).join('');
    $('[data-decline-all]').disabled = false;
    $('[data-step="1"]').hidden = true; $('[data-step="2"]').hidden = false;
    var first = $('[data-decline]'); if (first) first.focus();
  }
  function decline(btn) {
    var trail = btn.parentNode;
    trail.innerHTML = '<span class="tm-badge tm-badge--danger" data-nuxt-ui="UBadge">' + icon('x-circle') + 'Declinato</span>';
    live.textContent = 'Convocazione declinata.';
    if (!$('[data-decline]')) { $('[data-decline-all]').disabled = true; $('[data-done]').focus(); }
  }

  /* ---------- Eventi ---------- */
  document.addEventListener('click', function (e) {
    var v = e.target.closest('[data-variant]');
    if (v) {
      e.preventDefault();
      var href = v.getAttribute('href');
      try { history.replaceState(null, '', href === '?' ? location.pathname : href); } catch (err) {}
      TM.closeDialog($('#dlg-eval'));
      applyVariant(href);
      window.scrollTo(0, 0);
      return;
    }
    if (e.target.closest('[data-new]')) { if (!readOnly) openForm(null); return; }
    var ed = e.target.closest('[data-edit]');
    if (ed) { var a = ABS.filter(function (x) { return x.id === ed.getAttribute('data-edit'); })[0]; setTimeout(function () { openForm(a); }, 0); return; }
    var del = e.target.closest('[data-delete]');
    if (del) {
      var b = ABS.filter(function (x) { return x.id === del.getAttribute('data-delete'); })[0];
      $('#dlg-delete')._target = b;
      $('[data-delete-text]').textContent = 'L\'assenza ' + (b.end ? 'dal ' + short(b.start) + ' al ' + short(b.end) : 'dal ' + short(b.start)) + ' viene tolta. Lo staff ti vedrà di nuovo disponibile in quelle date.';
      setTimeout(function () { TM.openDialog('dlg-delete'); }, 0);
      return;
    }
    if (e.target.closest('[data-delete-confirm]')) {
      var t = $('#dlg-delete')._target;
      ABS = ABS.filter(function (x) { return x !== t; });
      TM.closeDialog($('#dlg-delete'));
      render();
      TM.toast({ tone: 'info', title: 'Assenza eliminata' });
      return;
    }
    if (e.target === f.open || e.target.closest('#f-open')) { setTimeout(function () { setOpen(f.open.getAttribute('aria-checked') === 'true'); clearError(); }, 0); return; }
    if (e.target.closest('[data-save]')) { save(); return; }
    var dc = e.target.closest('[data-decline]');
    if (dc) { decline(dc); return; }
    if (e.target.closest('[data-decline-all]')) { $$('[data-decline]').forEach(decline); TM.toast({ tone: 'success', title: 'Convocazioni declinate' }); return; }
    if (e.target.closest('[data-done]')) { TM.closeDialog($('#dlg-form')); TM.toast({ tone: 'success', title: 'Assenza salvata' }); }
  });
  f.team.addEventListener('change', function () { seasonHelp(); clearError(); });
  [f.start, f.end].forEach(function (i) { i.addEventListener('change', clearError); });

  applyVariant(location.search || '?');
})();
