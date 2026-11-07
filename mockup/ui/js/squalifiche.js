/* =========================================================
   TEAMMANIX · Squalifiche (schermata 34)
   Solo mockup: dati in memoria. Oggi = giovedì 5 novembre 2026.
   La squalifica vale solo per le partite.
   Varianti: ?stato=vuoto | ?stato=fine-stagione | ?stato=errore
   ========================================================= */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var icon = function (n, c) { return '<svg class="tm-icon' + (c ? ' ' + c : '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  var MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  var MESI_L = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  var GIORNI_L = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

  /* Partite della squadra (la squalifica conta solo queste) */
  var MATCHES = {
    '2026-10-03': 'contro Rufina', '2026-10-10': 'contro Pelago', '2026-10-17': 'contro Lastra a Signa', '2026-10-24': 'contro Fiesole',
    '2026-10-31': 'contro AC Figline', '2026-11-07': 'contro US Pontassieve', '2026-11-14': 'contro ASD Rignanese', '2026-11-21': 'contro Sangiovannese',
    '2026-11-28': 'contro Incisa', '2026-12-05': 'contro Montevarchi', '2026-12-12': 'contro Bucine', '2026-12-19': 'contro Cavriglia',
    '2026-05-30': 'contro Montevarchi', '2026-06-06': 'contro Bucine'
  };
  var PEOPLE = [
    ['Riccardo Ferri', 'Giocatore · n. 5'], ['Davide Fontana', 'Giocatore · n. 11'], ['Gabriele Conti', 'Giocatore · n. 4'], ['Tommaso Landi', 'Giocatore · n. 23'],
    ['Lorenzo Ricci', 'Giocatore · n. 2'], ['Edoardo Greco', 'Giocatore · n. 8'], ['Jacopo Mancini', 'Giocatore · n. 14'],
    ['Marco Bertini', 'Staff · Allenatore'], ['Paolo Ferretti', 'Staff · Vice'], ['Stefano Mazzei', 'Staff · Dirigente accompagnatore'], ['Andrea Sodi', 'Staff · Preparatore']
  ];
  var BASE = [
    { id: 's1', who: 'Riccardo Ferri', type: 'giornate', n: 2, start: '2026-10-31', comp: 'Campionato regionale Under 17', orig: 'sab 24 ott · contro Fiesole' },
    { id: 's2', who: 'Stefano Mazzei', type: 'tempo', start: '2026-11-02', end: '2026-11-30', comp: 'Campionato regionale Under 17' },
    { id: 's3', who: 'Davide Fontana', type: 'giornate', n: 1, start: '2026-11-14', comp: 'Coppa Toscana' },
    { id: 's4', who: 'Gabriele Conti', type: 'giornate', n: 1, start: '2026-10-17' },
    { id: 's5', who: 'Tommaso Landi', type: 'tempo', start: '2026-10-01', end: '2026-10-10' }
  ];
  var TODAY, SEASON_END, SQ, viewMonth, editing = null, seq = 10;

  function d(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function iso(dt) { return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
  function short(s) { var x = d(s); return GIORNI[x.getDay()] + ' ' + x.getDate() + ' ' + MESI[x.getMonth()]; }
  function slash(s) { var x = d(s); return x.getDate() + '/' + (x.getMonth() + 1); }
  function role(who) { return (PEOPLE.filter(function (p) { return p[0] === who; })[0] || ['', ''])[1]; }
  function initials(n) { return n.split(' ').map(function (w) { return w[0]; }).join(''); }
  var matchDates = function () { return Object.keys(MATCHES).sort(); };

  /* Partite coinvolte: a giornate le prime N dalla data di inizio, a tempo quelle nel periodo (mai oltre la fine stagione) */
  function matchesOf(q) {
    var all = matchDates().filter(function (m) { return m >= q.start && m <= SEASON_END; });
    return q.type === 'giornate' ? all.slice(0, q.n) : all.filter(function (m) { return m <= q.end; });
  }
  function state(q) {
    var ms = matchesOf(q);
    if (q.type === 'tempo') return q.end < TODAY ? 'concluse' : (q.start > TODAY ? 'future' : 'corso');
    var served = ms.filter(function (m) { return m < TODAY; }).length;
    if (served >= q.n) return 'concluse';
    if (ms.length < q.n && ms.every(function (m) { return m < TODAY; })) return 'corso';
    return q.start > TODAY ? 'future' : 'corso';
  }
  function badgeOf(q, st) {
    if (st === 'concluse') return '<span class="tm-badge" data-nuxt-ui="UBadge">' + icon('check') + 'Conclusa</span>';
    var t = q.type === 'tempo' ? 'Squalificato fino al ' + slash(q.end) :
      (st === 'future' ? 'Squalificato dal ' + slash(q.start) : 'Squalificato, giornata ' + Math.min(q.n, matchesOf(q).filter(function (m) { return m < TODAY; }).length + 1) + ' di ' + q.n);
    return '<span class="tm-badge tm-badge--squal" data-nuxt-ui="UBadge">' + icon('card') + t + '</span>';
  }
  function residuo(q, st) {
    if (st === 'concluse') return 'Scontata';
    if (q.type === 'tempo') return 'Fino al ' + slash(q.end);
    var left = q.n - matchesOf(q).filter(function (m) { return m < TODAY; }).length;
    return 'Ancora ' + left + (left === 1 ? ' giornata' : ' giornate');
  }

  /* ---------- Elenco ---------- */
  /* Riga compatta dell'elenco: altezza uniforme, il dettaglio si apre in un pannello */
  function rowHtml(q) {
    var st = state(q);
    return '<li><button type="button" class="tm-row tm-row--button" data-open="' + q.id + '" aria-haspopup="dialog" data-nuxt-ui="UUser"><div class="tm-row__lead"><span class="tm-avatar" aria-hidden="true">' + initials(q.who) + '</span></div>' +
      '<div class="tm-row__body"><span class="tm-row__title">' + q.who + '</span><span class="tm-row__subtitle">' + role(q.who) + ' · ' + residuo(q, st) + '</span><span class="tm-row__meta">' + badgeOf(q, st) + '</span></div>' +
      '<div class="tm-row__trail">' + icon('chevron-right', 'tm-icon--muted') + '</div></button></li>';
  }
  function detailHtml(q) {
    var st = state(q), ms = matchesOf(q);
    var carry = q.type === 'giornate' && ms.length < q.n && st !== 'concluse' && TODAY > SEASON_END;
    var ml = ms.map(function (m) {
      var done = m < TODAY;
      return '<li class="tm-minilist__item"><span class="tm-minilist__date">' + short(m) + '</span><span>' + MATCHES[m] + '</span><span class="tm-minilist__state' + (done ? '' : ' tm-minilist__state--todo') + '">' + icon(done ? 'check' : 'clock', 'tm-icon--xs') + (done ? 'Scontata' : 'Da scontare') + '</span></li>';
    }).join('');
    var note = carry ? '<div class="tm-banner tm-banner--warning">' + icon('warning') + '<div class="tm-banner__body"><strong>Passa alla prossima stagione.</strong> La stagione è finita con ' + (q.n - ms.length) + (q.n - ms.length === 1 ? ' giornata' : ' giornate') + ' da scontare: valgono dalla prima partita della stagione successiva.</div></div>' : '';
    return '<div class="tm-person"><span class="tm-avatar tm-avatar--lg" aria-hidden="true">' + initials(q.who) + '</span><div class="tm-person__body"><span class="tm-person__name">' + q.who + '</span><span class="tm-person__role">' + role(q.who) + '</span></div></div>' +
      '<span>' + badgeOf(q, st) + '</span>' + note +
      '<dl class="tm-squal__facts"><div><dt>Tipo</dt><dd>' + (q.type === 'tempo' ? 'A tempo' : 'A giornate (' + q.n + ')') + '</dd></div><div><dt>Residuo</dt><dd>' + residuo(q, st) + '</dd></div>' +
      '<div><dt>Dal</dt><dd>' + short(q.start) + '</dd></div>' + (q.end ? '<div><dt>Fino al</dt><dd>' + short(q.end) + '</dd></div>' : '') +
      (q.comp ? '<div><dt>Competizione</dt><dd>' + q.comp + '</dd></div>' : '') + (q.orig ? '<div><dt>Partita di origine</dt><dd>' + q.orig + '</dd></div>' : '') + '</dl>' +
      '<section class="tm-group" aria-labelledby="det-m"><h3 class="tm-group-title" id="det-m">Partite coinvolte <span class="tm-group-title__count">' + ms.length + '</span></h3>' +
      (ml ? '<ul class="tm-minilist">' + ml + '</ul>' : '<p class="tm-text-muted tm-text-sm">Nessuna partita in calendario nel periodo.</p>') + '</section>';
  }
  var current = null;
  function openDetail(q, opener) {
    current = q;
    $('[data-detail-title]').textContent = 'Squalifica';
    $('[data-detail]').innerHTML = detailHtml(q);
    TM.openDialog('dlg-detail', opener);
  }
  function renderList() {
    var box = $('[data-list]');
    if (!SQ.length) {
      box.innerHTML = '<div class="tm-card"><div class="tm-empty"><div class="tm-empty__icon">' + icon('card', 'tm-icon--md') + '</div><h2 class="tm-h2">Nessuna squalifica</h2><p class="tm-empty__text">Quando registri una squalifica, la persona non è convocabile per le partite coinvolte.</p><button type="button" class="tm-button" data-new data-nuxt-ui="UButton">' + icon('plus', 'tm-button__icon') + 'Nuova squalifica</button></div></div>';
      $('[data-actionbar]').hidden = true;
      return;
    }
    $('[data-actionbar]').hidden = false;
    box.innerHTML = [['corso', 'In corso'], ['future', 'Future'], ['concluse', 'Concluse']].map(function (g) {
      var list = SQ.filter(function (q) { return state(q) === g[0]; }).sort(function (a, b) { return a.start < b.start ? (g[0] === 'concluse' ? 1 : -1) : (g[0] === 'concluse' ? -1 : 1); });
      if (!list.length) return '';
      return '<section class="tm-group" aria-labelledby="g-' + g[0] + '"><h2 class="tm-group-title" id="g-' + g[0] + '">' + g[1] + ' <span class="tm-group-title__count">' + list.length + '</span></h2><ul class="tm-list tm-list--card" role="list">' + list.map(rowHtml).join('') + '</ul></section>';
    }).join('');
  }

  /* ---------- Calendario ---------- */
  function renderCal() {
    var y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    var first = new Date(y, m, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    var html = '<div class="tm-calendar__nav"><button type="button" class="tm-button tm-button--icon" data-cal="-1" aria-label="Mese precedente">' + icon('chevron-left') + '</button><h2 class="tm-calendar__month" aria-live="polite">' + MESI_L[m] + ' ' + y + '</h2><button type="button" class="tm-button tm-button--icon" data-cal="1" aria-label="Mese successivo">' + icon('chevron-right') + '</button></div>';
    html += '<div class="tm-calendar__wd" aria-hidden="true">' + ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(function (g) { return '<span>' + g + '</span>'; }).join('') + '</div>';
    for (var w = 0; w < 6; w++) {
      var ws = new Date(start); ws.setDate(start.getDate() + w * 7);
      if (w > 3 && ws.getMonth() !== m) break;
      var we = new Date(ws); we.setDate(ws.getDate() + 6);
      var days = '', bars = '';
      for (var i = 0; i < 7; i++) {
        var dd = new Date(ws); dd.setDate(ws.getDate() + i); var k = iso(dd);
        var cls = 'tm-calendar__day' + (dd.getMonth() !== m ? ' tm-calendar__day--out' : '') + (k === TODAY ? ' tm-calendar__day--today' : '') + (MATCHES[k] ? ' tm-calendar__day--match' : '');
        days += '<span class="' + cls + '" style-col="' + (i + 1) + '">' + dd.getDate() + '</span>';
      }
      SQ.forEach(function (q) {
        if (q.type === 'tempo') {
          var a = q.start > iso(ws) ? q.start : iso(ws), b = q.end < iso(we) ? q.end : iso(we);
          if (a > b) return;
          var c1 = (d(a).getDay() + 6) % 7 + 1, c2 = (d(b).getDay() + 6) % 7 + 1;
          bars += '<span class="tm-calendar__bar" data-col="' + c1 + '" data-span="' + (c2 - c1 + 1) + '" role="img" aria-label="' + q.who + ', squalifica a tempo dal ' + slash(q.start) + ' al ' + slash(q.end) + '">' + icon('card') + q.who + '</span>';
        } else {
          matchesOf(q).forEach(function (md) {
            if (md < iso(ws) || md > iso(we)) return;
            var c = (d(md).getDay() + 6) % 7 + 1, x = d(md);
            bars += '<span class="tm-calendar__bar tm-calendar__bar--day" data-col="' + c + '" data-span="1" role="img" aria-label="' + q.who + ', giornata di squalifica, ' + GIORNI_L[x.getDay()] + ' ' + x.getDate() + ' ' + MESI_L[x.getMonth()] + '" title="' + q.who + '">' + initials(q.who) + '</span>';
          });
        }
      });
      html += '<div class="tm-calendar__week" role="group" aria-label="Settimana dal ' + ws.getDate() + ' ' + MESI_L[ws.getMonth()] + '">' + days + bars + '</div>';
    }
    html += '<p class="tm-calendar__legend"><span>Barra con nome: squalifica a tempo</span><span>Iniziali: giornata di squalifica in una partita</span><span>Numero sottolineato: giorno di partita</span></p>';
    var box = $('[data-calendar]');
    box.innerHTML = html;
    /* Posizioni nella griglia impostate dallo script (nessuno stile scritto nel markup) */
    $$('[style-col]', box).forEach(function (e) { e.style.gridColumn = e.getAttribute('style-col'); e.style.gridRow = '1'; e.removeAttribute('style-col'); });
    $$('[data-col]', box).forEach(function (e) { e.style.gridColumn = e.getAttribute('data-col') + ' / span ' + e.getAttribute('data-span'); });
  }
  function render() { renderList(); renderCal(); }

  /* ---------- Modulo ---------- */
  var f = { who: $('#f-who'), start: $('#f-start'), n: $('#f-n'), end: $('#f-end'), comp: $('#f-comp'), orig: $('#f-orig'), err: $('#f-error') };
  f.who.innerHTML = '<optgroup label="Giocatori">' + PEOPLE.filter(function (p) { return p[1].indexOf('Giocatore') === 0; }).map(function (p) { return '<option>' + p[0] + '</option>'; }).join('') + '</optgroup><optgroup label="Staff">' + PEOPLE.filter(function (p) { return p[1].indexOf('Staff') === 0; }).map(function (p) { return '<option>' + p[0] + '</option>'; }).join('') + '</optgroup>';
  function typeVal() { return $('[data-type] [aria-checked="true"]').getAttribute('data-value'); }
  function setType(t) {
    $$('[data-type] [role="radio"]').forEach(function (r) { var on = r.getAttribute('data-value') === t; r.setAttribute('aria-checked', on); r.tabIndex = on ? 0 : -1; });
    $('[data-g]').hidden = t !== 'giornate'; $('[data-t]').hidden = t !== 'tempo';
  }
  function clearErr() { f.err.hidden = true; [f.start, f.n, f.end].forEach(function (i) { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); }); }
  function err(msg, field) { $('[data-error-text]').textContent = 'Errore: ' + msg; f.err.hidden = false; field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', 'f-error'); }
  function openForm(q, preset) {
    editing = q || null;
    var s = q || preset || { who: 'Lorenzo Ricci', type: 'giornate', n: 1, start: TODAY > '2026-11-07' ? TODAY : '2026-11-07', end: '', comp: 'Campionato regionale Under 17', orig: '' };
    f.who.value = s.who; setType(s.type); f.start.value = s.start; f.n.value = s.n || 1; f.end.value = s.end || ''; f.comp.value = s.comp || ''; f.orig.value = s.orig || '';
    $('[data-form-title]').textContent = q ? 'Modifica squalifica' : 'Nuova squalifica';
    clearErr();
    TM.openDialog('dlg-form');
  }
  function validate() {
    clearErr();
    var t = typeVal();
    if (!f.start.value) { err('indica la data di inizio.', f.start); return null; }
    if (t === 'giornate' && !(parseInt(f.n.value, 10) >= 1)) { err('indica almeno 1 giornata.', f.n); return null; }
    if (t === 'tempo' && !f.end.value) { err('indica la data di fine.', f.end); return null; }
    if (t === 'tempo' && f.end.value < f.start.value) { err('la data di fine deve essere uguale o successiva a quella di inizio.', f.end); return null; }
    return { who: f.who.value, type: t, start: f.start.value, n: t === 'giornate' ? parseInt(f.n.value, 10) : null, end: t === 'tempo' ? f.end.value : null, comp: f.comp.value, orig: f.orig.value };
  }

  /* ---------- Varianti ---------- */
  function applyVariant(search) {
    var qs = new URLSearchParams(search || ''), stato = qs.get('stato');
    TODAY = '2026-11-05'; SEASON_END = '2027-06-30';
    SQ = JSON.parse(JSON.stringify(BASE));
    $('[data-season]').textContent = 'Under 17 · Stagione 2026/27';
    if (stato === 'vuoto') SQ = [];
    if (stato === 'fine-stagione') {
      TODAY = '2026-06-10'; SEASON_END = '2026-06-07';
      SQ = [{ id: 'f1', who: 'Jacopo Mancini', type: 'giornate', n: 3, start: '2026-05-30', comp: 'Campionato regionale Under 17', orig: 'sab 23 mag · contro Pontassieve' }];
      $('[data-season]').textContent = 'Under 17 · Stagione 2025/26, conclusa';
    }
    viewMonth = d(TODAY); viewMonth.setDate(1);
    $$('#dlg-eval [data-variant]').forEach(function (a) { if (a.getAttribute('href') === (search || '?')) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    var t = $('#v-t-list'); if (t) t.click();
    render();
    if (stato === 'errore') setTimeout(function () { openForm(null, { who: 'Paolo Ferretti', type: 'tempo', start: '2026-11-20', end: '2026-11-10', comp: '', orig: '' }); validate(); }, 60);
  }

  document.addEventListener('tm:change', function (e) { if (e.target.closest('[data-type]')) { setType(e.detail.value); clearErr(); } });
  document.addEventListener('click', function (e) {
    var v = e.target.closest('[data-variant]');
    if (v) { e.preventDefault(); var h = v.getAttribute('href'); try { history.replaceState(null, '', h === '?' ? location.pathname : h); } catch (x) {} TM.closeDialog($('#dlg-eval')); applyVariant(h); window.scrollTo(0, 0); return; }
    if (e.target.closest('[data-new]')) { openForm(null); return; }
    var c = e.target.closest('[data-cal]');
    if (c) { viewMonth.setMonth(viewMonth.getMonth() + (+c.getAttribute('data-cal'))); renderCal(); $('[data-cal="' + c.getAttribute('data-cal') + '"]').focus(); return; }
    var op = e.target.closest('[data-open]');
    if (op) { openDetail(SQ.filter(function (x) { return x.id === op.getAttribute('data-open'); })[0], op); return; }
    if (e.target.closest('[data-detail-edit]')) { TM.closeDialog($('#dlg-detail')); var cq = current; setTimeout(function () { openForm(cq); }, 0); return; }
    if (e.target.closest('[data-detail-delete]')) {
      TM.closeDialog($('#dlg-detail'));
      $('#dlg-delete')._t = current;
      $('[data-delete-text]').textContent = 'La squalifica di ' + current.who + ' viene tolta: tornerà convocabile per le partite coinvolte non ancora giocate.';
      setTimeout(function () { TM.openDialog('dlg-delete'); }, 0); return;
    }
    var ed = e.target.closest('[data-edit]');
    if (ed) { var q = SQ.filter(function (x) { return x.id === ed.getAttribute('data-edit'); })[0]; setTimeout(function () { openForm(q); }, 0); return; }
    var del = e.target.closest('[data-delete]');
    if (del) {
      var q2 = SQ.filter(function (x) { return x.id === del.getAttribute('data-delete'); })[0];
      $('#dlg-delete')._t = q2;
      $('[data-delete-text]').textContent = 'La squalifica di ' + q2.who + ' viene tolta: tornerà convocabile per le partite coinvolte non ancora giocate.';
      setTimeout(function () { TM.openDialog('dlg-delete'); }, 0); return;
    }
    if (e.target.closest('[data-delete-confirm]')) {
      var t = $('#dlg-delete')._t; SQ = SQ.filter(function (x) { return x !== t; });
      TM.closeDialog($('#dlg-delete')); render(); TM.toast({ tone: 'info', title: 'Squalifica eliminata' }); return;
    }
    if (e.target.closest('[data-save]')) {
      var val = validate();
      if (!val) { $('[aria-invalid="true"]', $('#dlg-form')).focus(); return; }
      if (editing) { for (var k in val) editing[k] = val[k]; } else { val.id = 'n' + (seq++); SQ.push(val); }
      TM.closeDialog($('#dlg-form')); render();
      var nm = matchesOf(val).filter(function (m) { return m >= TODAY; }).length;
      TM.toast({ tone: 'success', title: editing ? 'Squalifica aggiornata' : 'Squalifica registrata', text: ' ' + val.who + (nm ? ' non è convocabile per ' + nm + (nm === 1 ? ' partita.' : ' partite.') : '.') });
      $('#sq-live').textContent = 'Squalifica di ' + val.who + ' salvata.';
    }
  });

  applyVariant(location.search || '?');
})();
