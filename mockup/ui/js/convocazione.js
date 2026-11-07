/* =========================================================
   TEAMMANIX · Convocazione (schermate 18, 19, 20, 21)
   Solo mockup: dati di esempio in memoria, nessuna rete.
   Varianti: ?stato=vuoto | ?stato=passato | ?sport=scherma | ?nav=senza-tab
   ========================================================= */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var icon = function (n, c) { return '<svg class="tm-icon' + (c ? ' ' + c : '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };

  /* ---------- Badge (stessi del catalogo) ---------- */
  var B = {
    'confermato': ['success', 'check-circle', 'Confermato'],
    'declinato': ['danger', 'x-circle', 'Declinato'],
    'senza-risposta': ['warning', 'help', 'Senza risposta'],
    'da-avvisare': ['info', 'send', 'Da avvisare'],
    'impegnato': ['warning', 'clock', 'Impegnato altrove'],
    'cert-scadenza': ['warning', 'clock', 'In scadenza'],
    'infortunato': ['warning', 'bandage', 'Infortunato'],
    'squal-g': ['squal', 'card', 'Squalificato, giornata 2 di 2'],
    'squal-new': ['squal', 'card', 'Squalificato'],
    'squal-info': ['info', 'card', 'Squalificato, disponibile in allenamento'],
    'cert-scaduto': ['danger', 'error', 'Certificato scaduto'],
    'cert-mancante': ['danger', 'file-x', 'Certificato mancante'],
    'assenza': ['warning', 'calendar-x', 'Non disponibile fino al ']
  };
  function badge(k, suffix) {
    var b = B[k];
    return '<span class="tm-badge' + (b[0] ? ' tm-badge--' + b[0] : '') + '" data-nuxt-ui="UBadge">' + icon(b[1]) + b[2] + (suffix || '') + '</span>';
  }

  /* ---------- Dati ---------- */
  function p(num, name, role, list, extra) {
    var o = { id: name.toLowerCase().replace(/[^a-z]/g, ''), num: num, name: name, role: role, list: list };
    for (var k in extra || {}) o[k] = extra[k];
    return o;
  }
  var DATA = {
    calcio: {
      tp: true, noun: 'partita',
      title: 'Partita contro US Pontassieve', team: 'Under 17',
      short: 'sab 7 nov · 15:30', long: 'Sabato 7 novembre, 15:30', place: 'Campo comunale Via dello Sport',
      people: [
        p(1, 'Tommaso Bianchi', 'Portiere', 'conv', { status: 'confermato', tp: 'T' }),
        p(2, 'Lorenzo Ricci', 'Difensore', 'conv', { status: 'confermato', tp: 'T' }),
        p(3, 'Matteo Galli', 'Difensore', 'not', { status: 'declinato', reason: 'Impegno personale' }),
        p(4, 'Gabriele Conti', 'Centrocampista', 'not', { block: 'infortunato' }),
        p(5, 'Riccardo Ferri', 'Difensore', 'not', { block: 'squal-g', squal: true }),
        p(6, 'Samuele Neri', 'Difensore', 'conv', { status: 'confermato', tp: 'T' }),
        p(7, 'Leonardo Marini', 'Attaccante', 'not', { block: 'cert-scaduto' }),
        p(8, 'Edoardo Greco', 'Centrocampista', 'conv', { status: 'confermato', tp: 'T' }),
        p(9, 'Francesco Rinaldi', 'Attaccante', 'conv', { status: 'confermato', tp: 'T' }),
        p(10, 'Andrea Lombardi', 'Centrocampista', 'conv', { status: 'confermato', tp: 'T' }),
        p(11, 'Davide Fontana', 'Attaccante', 'conv', { status: 'confermato', tp: 'T' }),
        p(12, 'Niccolò Sarti', 'Portiere', 'conv', { status: 'senza-risposta', tp: 'P' }),
        p(13, 'Filippo Bruni', 'Difensore', 'conv', { status: 'confermato', tp: 'T' }),
        p(14, 'Jacopo Mancini', 'Difensore', 'conv', { status: 'senza-risposta', tp: 'T' }),
        p(15, 'Elia Costa', 'Difensore', 'conv', { status: 'da-avvisare', tp: 'P' }),
        p(16, 'Cosimo Pieri', 'Centrocampista', 'conv', { status: 'confermato', tp: 'T' }),
        p(17, 'Marco Vannucci', 'Centrocampista', 'not', { status: 'declinato', reason: 'Non disponibile' }),
        p(18, 'Giacomo Rossi', 'Centrocampista', 'conv', { status: 'senza-risposta', tp: 'P' }),
        p(19, 'Luca Martini', 'Centrocampista', 'conv', { status: 'senza-risposta', tp: 'P' }),
        p(20, 'Simone Bandini', 'Centrocampista', 'able', { warn: 'cert-scadenza', warnText: 'Certificato: scade mer 18 nov' }),
        p(21, 'Alessio Fabbri', 'Centrocampista', 'able'),
        p(22, 'Pietro Guidi', 'Portiere', 'able'),
        p(23, 'Tommaso Landi', 'Attaccante', 'conv', { status: 'senza-risposta', tp: 'P' }),
        p(24, 'Mattia Giorgi', 'Attaccante', 'conv', { status: 'da-avvisare', tp: 'P' }),
        p(25, 'Christian Bellini', 'Attaccante', 'not', { absence: '15/11' }),
        p(26, 'Federico Paoli', 'Attaccante', 'able', { warn: 'impegnato', warnText: 'Altro evento alle 15:30' })
      ]
    },
    scherma: {
      tp: false, noun: 'gara',
      title: 'Gara · Trofeo regionale di fioretto', team: 'Under 17 fioretto',
      short: 'dom 15 nov · 9:00', long: 'Domenica 15 novembre, 9:00', place: 'Palazzetto dello Sport, Arezzo',
      people: [
        p(null, 'Giulia Marchi', 'Fioretto femminile', 'conv', { status: 'confermato' }),
        p(null, 'Sofia Bellucci', 'Fioretto femminile', 'conv', { status: 'confermato' }),
        p(null, 'Lorenzo Pucci', 'Fioretto maschile', 'conv', { status: 'confermato' }),
        p(null, 'Edoardo Tani', 'Fioretto maschile', 'conv', { status: 'senza-risposta' }),
        p(null, 'Matilde Baldi', 'Fioretto femminile', 'conv', { status: 'da-avvisare' }),
        p(null, 'Andrea Nesti', 'Fioretto maschile', 'able'),
        p(null, 'Alice Fani', 'Fioretto femminile', 'able', { warn: 'cert-scadenza', warnText: 'Certificato: scade ven 20 nov' }),
        p(null, 'Bianca Rossetti', 'Fioretto femminile', 'able'),
        p(null, 'Chiara Lenzi', 'Fioretto femminile', 'not', { block: 'cert-mancante' }),
        p(null, 'Martina Ricci', 'Fioretto femminile', 'not', { block: 'infortunato' })
      ]
    }
  };

  /* ---------- Varianti ----------
     Applicate sul posto, senza ricaricare la pagina: funzionano anche quando il file
     è aperto in un'anteprima che blocca la navigazione. L'indirizzo viene aggiornato
     quando il browser lo consente, così la variante si può condividere. */
  var sport, stato, D, people, readOnly;
  var PRISTINE = JSON.stringify(DATA);
  function setText(sel, t) { $$(sel).forEach(function (e) { e.textContent = t; }); }
  var HELP = {};
  $$('.tm-convocation__help').forEach(function (h) { HELP[h.closest('[data-list]').getAttribute('data-list')] = h.textContent; });

  /* Sezione Staff: markup originale, ripristinato a ogni cambio di variante */
  var staffSec = $('[data-staff-section]');
  var STAFF_HTML = staffSec ? staffSec.innerHTML : '';
  function staffRecount() {
    if (!staffSec) return;
    $$('[data-staff-group]', staffSec).forEach(function (gr) {
      var n = $$(':scope > ul > li', gr).length; gr.hidden = !n;
      var c = gr.querySelector('.tm-group-title__count'); if (c) c.textContent = n;
    });
    var sum = staffSec.querySelector('[data-staff-summary]');
    if (sum) { var nsi = $$('[data-staff-group="si"] > ul > li', staffSec).length; sum.textContent = nsi + (nsi === 1 ? ' disponibile su ' : ' disponibili su ') + $$('[data-staff-group] > ul > li', staffSec).length; }
    staffSec.querySelector('[data-no-coach]').hidden = $$('[data-staff-group="si"] [data-role="allenatore"]', staffSec).length > 0;
  }
  /* Staff squalificato: per le partite compare tra i non disponibili, il proprio controllo è disabilitato con il motivo.
     Negli allenamenti il controllo resta attivo. */
  function staffSuspended() {
    var g = staffSec.querySelector('[data-staff-self]'), li = g.closest('li');
    $$('[role="radio"]', g).forEach(function (r) { r.disabled = true; r.setAttribute('aria-checked', 'false'); });
    g.setAttribute('aria-describedby', 'self-note');
    g.insertAdjacentHTML('afterend', '<p class="tm-response-note" id="self-note">' + badge('squal-new').replace('Squalificato', 'Sei squalificato per questa partita') + '</p>');
    /* Livello evento separato dallo stato d'iscrizione: nell'evento risulta Non disponibile */
    li.querySelector('.js-staff-badge').outerHTML = '<span class="tm-badge tm-badge--danger" data-nuxt-ui="UBadge">' + icon('x-circle') + 'Non disponibile</span>';
    staffSec.querySelector('[data-staff-group="no"] ul').appendChild(li);
    staffRecount();
  }

  function applyVariant(search) {
    var qs = new URLSearchParams(search || '');
    sport = qs.get('sport') === 'scherma' ? 'scherma' : 'calcio';
    stato = qs.get('stato');
    D = JSON.parse(PRISTINE)[sport];
    people = D.people;
    readOnly = stato === 'passato';
    /* Tipo di evento: la squalifica vale solo per le partite */
    var training = qs.get('evento') === 'allenamento';
    D.match = !training;
    if (training) {
      D.title = 'Allenamento'; D.short = 'gio 12 nov · 18:30'; D.long = 'Giovedì 12 novembre, 18:30'; D.noun = 'allenamento'; D.tp = false;
      people.forEach(function (x) { if (x.squal) { x.list = 'able'; delete x.block; x.warn = 'squal-info'; x.warnText = ''; } });
    }
    if (readOnly) people.forEach(function (x) { if (x.status === 'da-avvisare') { x.list = 'able'; delete x.status; } });
    if (stato === 'vuoto') people.forEach(function (x) { if (x.list === 'conv' || x.status === 'declinato') { x.list = 'able'; delete x.status; delete x.reason; } });

    /* Navigazione su telefono: tab bar visibile (predefinita) oppure schermata di lavoro senza tab bar */
    var app = $('[data-app]'), noTab = qs.get('nav') === 'senza-tab';
    app.classList.toggle('tm-app--with-actionbar', !noTab);
    app.classList.toggle('tm-app--task', noTab);

    setText('[data-ev="title"]', D.title);
    setText('[data-ev="crumb"]', D.title);
    setText('[data-ev="sub"]', 'Convocazione · ' + D.team + ' · ' + D.short);
    setText('[data-ev="long"]', D.title + ' · ' + D.team + ' · ' + D.long + ' · ' + D.place);
    $('[data-readonly-banner]').hidden = !readOnly;
    $$('[data-send]').forEach(function (b) { b.hidden = readOnly; });
    $('[data-actionbar]').hidden = readOnly;
    if (staffSec) {
      staffSec.innerHTML = STAFF_HTML;
      if (qs.get('staff') === 'squalificato' && !training) staffSuspended();
      if (training) {
        /* Allenamento: lo staff squalificato può rispondere; nessuna azione "Squalifica" */
        var sq = staffSec.querySelector('[data-squal-staff]');
        if (sq) { sq.querySelector('.tm-row__meta').innerHTML = '<span class="tm-badge" data-nuxt-ui="UBadge">' + icon('help') + 'Senza risposta</span>' + badge('squal-info'); staffSec.querySelector('[data-staff-group="attesa"] ul').appendChild(sq); }
        if (qs.get('staff') === 'squalificato') { var me = staffSec.querySelector('[data-staff-self]'); me.insertAdjacentHTML('afterend', '<p class="tm-response-note">' + badge('squal-info') + '</p>'); }
        $$('[data-squal-action]', staffSec).forEach(function (t) { t.hidden = true; });
      }
      staffRecount();
    }
    /* Evento passato: anche la propria disponibilità diventa sola lettura */
    $$('[data-staff-self]').forEach(function (g) { g.hidden = readOnly; });
    $$('.tm-convocation__help').forEach(function (h) { h.hidden = readOnly; h.textContent = HELP[h.closest('[data-list]').getAttribute('data-list')]; });

    var tab = $('#cv-t-conv'); if (tab) tab.click();
    $$('#dlg-eval [data-variant]').forEach(function (a) {
      if (a.getAttribute('href') === (search || '?')) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    if (typeof render === 'function' && $('[data-items="conv"]').dataset.ready) render();
  }
  applyVariant(location.search || '?');

  document.addEventListener('click', function (e) {
    var v = e.target.closest('[data-variant]');
    if (!v) return;
    e.preventDefault();
    var href = v.getAttribute('href');
    try { history.replaceState(null, '', href === '?' ? location.pathname : href); } catch (err) { /* anteprima senza history: va bene lo stesso */ }
    applyVariant(href);
    render();
    TM.closeDialog($('#dlg-eval'));
    window.scrollTo(0, 0);
  });

  /* ---------- Rendering ---------- */
  var initials = function (n) { return n.split(' ').map(function (w) { return w[0]; }).join(''); };
  function row(x) {
    /* Avatar con il numero di maglia sotto (sport di squadra); solo avatar negli sport individuali. */
    var lead = '<div class="tm-row__lead tm-row__lead--stack"><span class="tm-avatar" aria-hidden="true" data-nuxt-ui="UAvatar">' + initials(x.name) + '</span>' +
      (x.num !== null ? '<span class="tm-row__num" aria-label="Maglia ' + x.num + '">' + x.num + '</span>' : '') + '</div>';
    var meta = '', actions = '';
    if (x.list === 'conv') {
      meta = badge(x.status) + (x.reason ? '<span>' + x.reason + '</span>' : '') + (x.absence ? badge('assenza', x.absence) : '');
      if (readOnly) {
        actions = D.tp ? '<span class="tm-badge tm-badge--outline">' + (x.tp === 'T' ? 'Titolare' : 'Panchina') + '</span>' : '';
      } else {
        if (D.tp) actions += '<button type="button" class="tm-tp" aria-pressed="' + (x.tp === 'T') + '" aria-label="Titolare: ' + x.name + '" data-tp="' + x.id + '" data-nuxt-ui="UButton (toggle)"><span class="tm-tp__t" aria-hidden="true">T</span><span class="tm-tp__p" aria-hidden="true">P</span></button>';
        actions += rowMenu(x, [['user-minus', 'Togli dai convocati', 'data-remove'], D.match ? ['card', 'Squalifica', 'data-squalifica'] : null]);
      }
    } else if (x.list === 'able') {
      meta = x.warn ? badge(x.warn) + '<span>' + x.warnText + '</span>' : '';
      if (!readOnly) actions = '<button type="button" class="tm-button tm-button--secondary" data-convoca="' + x.id + '" aria-label="Convoca ' + x.name + '" data-nuxt-ui="UButton">Convoca</button>' + (D.match ? rowMenu(x, [['card', 'Squalifica', 'data-squalifica']]) : '');
    } else {
      /* Non convocabili: esclusi (infortunio, squalifica, certificato) o chi ha già risposto che non può.
         Nessuna azione e nessun Titolare/Panchina. */
      meta = x.block ? badge(x.block, x.blockSuffix) : x.absence ? badge('assenza', x.absence) : badge(x.status) + (x.reason ? '<span>' + x.reason + '</span>' : '');
      /* Squalificato in una partita: nessun pulsante per forzare. Agli altri si può assegnare una squalifica */
      if (!readOnly && D.match && !x.squal) actions = rowMenu(x, [['card', 'Squalifica', 'data-squalifica']]);
    }
    /* Assenza dichiarata: unica eccezione tra i non convocabili, si può convocare comunque (con conferma).
       Il pulsante va sotto il testo: la colonna può essere stretta. */
    var below = (x.list === 'not' && x.absence && !readOnly) ? '<button type="button" class="tm-button tm-button--secondary tm-row__below" data-convoca-comunque="' + x.id + '" aria-label="Convoca comunque ' + x.name + '" data-nuxt-ui="UButton">Convoca comunque</button>' : '';
    var sub = x.role;
    return '<li data-person="' + x.id + '"><div class="tm-row' + (x.status === 'da-avvisare' ? ' tm-row--new' : '') + (actions ? '' : ' tm-row--no-trail') + '" data-nuxt-ui="UUser">' + lead +
      '<div class="tm-row__body"><span class="tm-row__title">' + x.name + '</span><span class="tm-row__subtitle">' + sub + '</span>' + (meta ? '<span class="tm-row__meta">' + meta + '</span>' : '') + below + '</div>' +
      (actions ? '<div class="tm-row__trail"><div class="tm-row__actions">' + actions + '</div></div>' : '') + '</div></li>';
  }
  function rowMenu(x, items) {
    var id = 'm-' + x.id;
    var li = items.filter(Boolean).map(function (it) { return '<li role="none"><button type="button" class="tm-menu__item" role="menuitem" ' + it[2] + '="' + x.id + '">' + icon(it[0]) + it[1] + '</button></li>'; }).join('');
    return '<div class="tm-menu-anchor" data-nuxt-ui="UDropdownMenu"><button type="button" class="tm-button tm-button--icon" aria-label="Altre azioni per ' + x.name + '" aria-haspopup="menu" aria-expanded="false" aria-controls="' + id + '" data-menu data-nuxt-ui="UButton">' + icon('dots-v') + '</button><ul class="tm-menu" id="' + id + '" role="menu" hidden>' + li + '</ul></div>';
  }
  function surname(n) { var w = n.split(' '); return w.slice(1).join(' ') + ' ' + w[0]; }
  function byNum(a, b) { return (a.num === null || b.num === null) ? surname(a.name).localeCompare(surname(b.name), 'it') : a.num - b.num; }
  function count(f) { return people.filter(f).length; }

  function render() {
    ['conv', 'able', 'not'].forEach(function (k) {
      var list = people.filter(function (x) { return x.list === k; }).sort(byNum);
      $('[data-items="' + k + '"]').innerHTML = list.map(row).join('');
      $('[data-items="' + k + '"]').hidden = !list.length;
      var empty = $('[data-empty="' + k + '"]');
      empty.hidden = !!list.length;
      if (!list.length) empty.innerHTML = emptyState(k);
      $$('[data-count="' + k + '"]').forEach(function (c) { c.textContent = list.length; });
    });
    var nOut = people.filter(function (x) { return x.list !== 'conv'; }).length;
    $$('[data-count="out"]').forEach(function (c) { c.textContent = nOut; });
    var nConv = count(function (x) { return x.list === 'conv'; });
    var n = { conf: count(function (x) { return x.status === 'confermato' && x.list === 'conv'; }), wait: count(function (x) { return x.status === 'senza-risposta' && x.list === 'conv'; }), nw: count(function (x) { return x.status === 'da-avvisare' && x.list === 'conv'; }) };
    var parts = ['<span><strong>' + nConv + '</strong> convocati</span>', '<span><strong>' + n.conf + '</strong> confermati</span>', '<span><strong>' + n.wait + '</strong> senza risposta</span>'];
    if (n.nw) parts.push('<span><strong>' + n.nw + '</strong> da avvisare</span>');
    /* Su telefono la sezione Staff è in fondo: il riepilogo porta un collegamento diretto */
    var staffSi = $$('[data-staff-group="si"] > ul > li').length, staffTot = $$('[data-staff-group] > ul > li').length;
    if (staffTot) parts.push('<a class="tm-link" href="#cv-staff-t" data-goto-staff>Staff: ' + staffSi + (staffSi === 1 ? ' disponibile su ' : ' disponibili su ') + staffTot + '</a>');
    $('[data-summary]').innerHTML = parts.join('');
    setText('[data-kpi="conv"]', nConv); setText('[data-kpi="confermato"]', n.conf); setText('[data-kpi="senza-risposta"]', n.wait); setText('[data-kpi="da-avvisare"]', n.nw);
    $$('[data-send]').forEach(function (b) {
      var label = n.nw ? 'Invia convocazione a ' + n.nw + (n.nw === 1 ? ' nuovo convocato' : ' nuovi convocati') : 'Nessun nuovo convocato da avvisare';
      var icn = b.querySelector('.tm-button__icon').outerHTML + b.querySelector('.tm-button__spinner').outerHTML;
      b.innerHTML = icn + label;
      b.disabled = !n.nw;
    });
  }
  function emptyState(k) {
    if (k === 'conv') return '<div class="tm-card"><div class="tm-empty"><div class="tm-empty__icon">' + icon('users', 'tm-icon--md') + '</div><h3 class="tm-h2">Nessun convocato</h3><p class="tm-empty__text">Scegli dai convocabili chi chiamare per questa ' + D.noun + '.</p>' +
      (readOnly ? '' : '<button type="button" class="tm-button tm-button--secondary tm-convocation__tabs-only" data-goto-able data-nuxt-ui="UButton">' + icon('user-plus', 'tm-button__icon') + 'Scegli dai convocabili</button>') + '</div></div>';
    if (k === 'able') return '<div class="tm-card"><div class="tm-empty"><div class="tm-empty__icon">' + icon('check-all', 'tm-icon--md') + '</div><h3 class="tm-h2">Tutti convocati</h3><p class="tm-empty__text">Non resta nessuno da convocare.</p></div></div>';
    return '<div class="tm-card"><div class="tm-empty"><div class="tm-empty__icon">' + icon('check-circle', 'tm-icon--md') + '</div><h3 class="tm-h2">Nessuno escluso</h3><p class="tm-empty__text">Tutta la rosa è convocabile.</p></div></div>';
  }

  /* ---------- Azioni ---------- */
  var live = $('#cv-live');
  function find(id) { return people.filter(function (x) { return x.id === id; })[0]; }
  function animateOut(id, done) {
    var li = $('[data-person="' + id + '"] .tm-row');
    if (!li || (window.TM && TM.reduceMotion)) { done(); return; }
    li.classList.add('is-leaving');
    setTimeout(done, 180);
  }
  function focusAfter(list, index) {
    var btns = $$('[data-items="' + list + '"] [data-convoca], [data-items="' + list + '"] [data-remove]');
    var t = btns[Math.min(index, btns.length - 1)];
    if (t) t.focus(); else { var pnl = $(list === 'conv' ? '#cv-p-conv' : '#cv-p-out'); if (pnl) pnl.focus(); }
  }
  function convoca(x) {
    var idx = $$('[data-items="able"] [data-convoca]').map(function (b) { return b.getAttribute('data-convoca'); }).indexOf(x.id);
    animateOut(x.id, function () {
      x.list = 'conv'; x.status = 'da-avvisare'; x.tp = 'P'; delete x.warnText; delete x.warn;
      render();
      var r = $('[data-items="conv"] [data-person="' + x.id + '"] .tm-row'); if (r) r.classList.add('is-entering');
      live.textContent = x.name + ' aggiunto ai convocati. Da avvisare.';
      focusAfter('able', idx);
    });
  }
  function rimuovi(x) {
    var idx = $$('[data-items="conv"] [data-remove]').map(function (b) { return b.getAttribute('data-remove'); }).indexOf(x.id);
    animateOut(x.id, function () {
      /* Torna tra i convocabili, oppure tra i non convocabili se nel frattempo il suo stato lo esclude */
      x.list = (x.block || x.absence) ? 'not' : 'able'; delete x.status; delete x.reason; delete x.tp;
      render();
      live.textContent = x.name + ' tolto dai convocati, ora tra i ' + (x.list === 'not' ? 'non convocabili.' : 'convocabili.');
      focusAfter('conv', idx);
    });
  }

  var pending = null, sqTarget = null;
  document.addEventListener('tm:change', function (e) {
    var g = e.target.closest('[data-sq-type]'); if (!g) return;
    var t = e.detail.value === 'tempo';
    $('[data-sq-g]').hidden = t; $('[data-sq-t]').hidden = !t; $('#sq-err').hidden = true;
  });
  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-convoca]');
    if (c) {
      var x = find(c.getAttribute('data-convoca'));
      if (x.warn === 'impegnato') {
        pending = x;
        $('[data-busy-text]').textContent = x.name + ' è già convocato in un altro evento alla stessa ora. Se lo convochi riceverà due convocazioni e sceglierà lui a quale rispondere.';
        TM.openDialog('dlg-impegnato', c);
      } else convoca(x);
      return;
    }
    /* ---- Squalifica (solo partite): precompila persona e partita ---- */
    var sqb = e.target.closest('[data-squalifica], [data-squalifica-staff]');
    if (sqb) {
      var pid = sqb.getAttribute('data-squalifica'), sid = sqb.getAttribute('data-squalifica-staff');
      var who = pid ? find(pid) : null, sli = sid ? $('[data-staff-section] [data-squalifica-staff="' + sid + '"]').closest('li') : null;
      sqTarget = { person: who, staff: sli };
      var nm = who ? who.name : sli.querySelector('.tm-row__title').textContent;
      $('[data-sq-person]').textContent = nm;
      $('[data-sq-role]').textContent = who ? 'Giocatore' + (who.num !== null ? ' · n. ' + who.num : '') : 'Staff · ' + sli.querySelector('.tm-row__role').textContent;
      $('[data-sq-ini]').textContent = initials(nm);
      $('#sq-n').value = 1; $('#sq-end').value = ''; $('#sq-err').hidden = true; $('#sq-end').removeAttribute('aria-invalid'); $('#sq-n').removeAttribute('aria-invalid');
      var r0 = $('[data-sq-type] [data-value="giornate"]'); r0.click();
      setTimeout(function () { TM.openDialog('dlg-squal', sqb); }, 0);
      return;
    }
    if (e.target.closest('[data-sq-save]')) {
      var type = $('[data-sq-type] [aria-checked="true"]').getAttribute('data-value');
      var n = parseInt($('#sq-n').value, 10), end = $('#sq-end').value, err = $('#sq-err');
      var bad = type === 'giornate' ? (!(n >= 1) ? 'indica almeno 1 giornata.' : '') : (!end ? 'indica la data di fine.' : (end < '2026-11-07' ? 'la data di fine non può essere prima della partita.' : ''));
      if (bad) { $('[data-sq-err]').textContent = 'Errore: ' + bad; err.hidden = false; var fld = type === 'giornate' ? $('#sq-n') : $('#sq-end'); fld.setAttribute('aria-invalid', 'true'); fld.setAttribute('aria-describedby', 'sq-err'); fld.focus(); return; }
      var dd = end ? end.split('-') : null;
      var suffix = type === 'giornate' ? ', giornata 1 di ' + n : ' fino al ' + (+dd[2]) + '/' + (+dd[1]);
      TM.closeDialog($('#dlg-squal'));
      if (sqTarget.person) {
        var x2 = sqTarget.person, wasNotified = x2.list === 'conv' && x2.status !== 'da-avvisare';
        animateOut(x2.id, function () {
          x2.list = 'not'; x2.block = 'squal-new'; x2.blockSuffix = suffix; x2.squal = true; delete x2.status; delete x2.reason; delete x2.tp; delete x2.warn; delete x2.warnText;
          render();
          live.textContent = x2.name + ' squalificato, ora tra i non convocabili.';
        });
        TM.toast({ tone: 'success', title: 'Squalifica registrata', text: ' ' + x2.name + ' è tra i non convocabili' + (wasNotified ? ' e riceverà un avviso.' : '.') });
      } else if (sqTarget.staff) {
        var li2 = sqTarget.staff;
        li2.querySelector('.tm-row__meta').innerHTML = badge('squal-new', suffix);
        var t2 = li2.querySelector('[data-squal-action]'); if (t2) t2.remove();
        li2.querySelector('.tm-row').classList.add('tm-row--no-trail');
        staffSec.querySelector('[data-staff-group="no"] ul').appendChild(li2);
        staffRecount(); render();
        TM.toast({ tone: 'success', title: 'Squalifica registrata', text: ' ' + li2.querySelector('.tm-row__title').textContent + ' non è disponibile per questa partita.' });
      }
      return;
    }
    var cc = e.target.closest('[data-convoca-comunque]');
    if (cc) {
      pending = find(cc.getAttribute('data-convoca-comunque'));
      $('[data-absence-text]').textContent = pending.name + ' ha dichiarato un\'assenza fino al ' + pending.absence + '. Convocarlo comunque?';
      TM.openDialog('dlg-assenza', cc);
      return;
    }
    if (e.target.closest('[data-absence-confirm]')) {
      TM.closeDialog($('#dlg-assenza'));
      if (pending) { var a = pending; animateOut(a.id, function () { a.list = 'conv'; a.status = 'da-avvisare'; a.tp = 'P'; render(); live.textContent = a.name + ' convocato nonostante l\'assenza. Da avvisare.'; var b2 = $('#cv-p-out'); if (b2) b2.focus(); }); }
      pending = null; return;
    }
    if (e.target.closest('[data-busy-confirm]')) { TM.closeDialog($('#dlg-impegnato')); if (pending) convoca(pending); pending = null; return; }
    var r = e.target.closest('[data-remove]');
    if (r) {
      var y = find(r.getAttribute('data-remove'));
      if (y.status === 'da-avvisare') { rimuovi(y); return; }
      pending = y;
      $('[data-remove-text]').textContent = y.name + ' aveva già ricevuto la convocazione: riceverà un avviso che non è più convocato e tornerà tra i ' + ((y.block || y.absence) ? 'non convocabili.' : 'convocabili.');
      TM.openDialog('dlg-rimuovi', r);
      return;
    }
    if (e.target.closest('[data-remove-confirm]')) {
      TM.closeDialog($('#dlg-rimuovi'));
      if (pending) { var z = pending; rimuovi(z); TM.toast({ tone: 'info', title: 'Tolto dai convocati', text: ' ' + z.name + ' riceverà un avviso.' }); }
      pending = null; return;
    }
    var s = e.target.closest('[data-send]');
    if (s) {
      var nw = people.filter(function (x) { return x.list === 'conv' && x.status === 'da-avvisare'; }).sort(byNum);
      $('[data-send-text]').textContent = 'Ricevono la notifica ' + (nw.length === 1 ? 'questa persona:' : 'queste ' + nw.length + ' persone:');
      $('[data-send-list]').innerHTML = nw.map(function (x) { return '<li><div class="tm-row tm-row--no-trail"><div class="tm-row__lead tm-row__lead--stack"><span class="tm-avatar" aria-hidden="true">' + initials(x.name) + '</span>' + (x.num !== null ? '<span class="tm-row__num">' + x.num + '</span>' : '') + '</div><div class="tm-row__body"><span class="tm-row__title">' + x.name + '</span><span class="tm-row__subtitle">' + x.role + '</span></div></div></li>'; }).join('');
      TM.openDialog('dlg-invia', s);
      return;
    }
    if (e.target.closest('[data-send-confirm]')) {
      var sent = people.filter(function (x) { return x.list === 'conv' && x.status === 'da-avvisare'; });
      sent.forEach(function (x) { x.status = 'senza-risposta'; });
      TM.closeDialog($('#dlg-invia'));
      render();
      TM.toast({ tone: 'success', title: 'Convocazione inviata', text: ' ' + sent.length + (sent.length === 1 ? ' persona avvisata.' : ' persone avvisate.') });
      return;
    }
    if (e.target.closest('[data-goto-able]')) { var t = $('#cv-t-out'); t.click(); t.focus(); }
  });
  document.addEventListener('tm:change', function (e) { if (e.target.closest('[data-staff-self]')) setTimeout(render, 0); });
  document.addEventListener('click', function (e) {
    var gs = e.target.closest('[data-goto-staff]');
    if (gs) { e.preventDefault(); var sec = $('#cv-staff-t'); sec.setAttribute('tabindex', '-1'); $('.tm-convocation__staff').scrollIntoView({ behavior: TM.reduceMotion ? 'auto' : 'smooth' }); sec.focus({ preventScroll: true }); return; }
    var g = e.target.closest('[data-tp]');
    if (!g) return;
    var x = find(g.getAttribute('data-tp'));
    x.tp = x.tp === 'T' ? 'P' : 'T';
    g.setAttribute('aria-pressed', x.tp === 'T' ? 'true' : 'false');
    live.textContent = x.name + ': ' + (x.tp === 'T' ? 'titolare' : 'panchina');
  });

  $('[data-items="conv"]').dataset.ready = '1';
  render();
})();
