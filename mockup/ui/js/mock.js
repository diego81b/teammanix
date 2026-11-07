/* =========================================================
   TEAMMANIX · Interazioni del mockup
   Solo comportamento visivo: nessuna logica applicativa, nessuna rete.
   Ogni modulo si aggancia ad attributi data-* documentati in components.html.
   ========================================================= */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TM = window.TM = window.TM || {};

  function icon(name, extra) {
    return '<svg class="tm-icon' + (extra ? ' ' + extra : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }
  TM.icon = icon;

  /* ---------- Tema (solo valutazione) ---------- */
  function applyTheme(value) {
    var html = document.documentElement;
    if (value === 'light' || value === 'dark') html.setAttribute('data-theme', value);
    else html.removeAttribute('data-theme');
    try { localStorage.setItem('tm-theme', value); } catch (e) {}
    $$('[data-theme-value]').forEach(function (b) {
      var on = b.getAttribute('data-theme-value') === value;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }
  function initTheme() {
    var current = 'auto';
    try { current = localStorage.getItem('tm-theme') || 'auto'; } catch (e) {}
    applyTheme(current);
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-theme-value]');
      if (b) applyTheme(b.getAttribute('data-theme-value'));
    });
  }

  /* ---------- Gruppi radio (segmented, elenchi di scelta) ---------- */
  function selectRadio(radio, focus) {
    var group = radio.closest('[role="radiogroup"]');
    if (!group || radio.disabled) return;
    $$('[role="radio"]', group).forEach(function (r) {
      var on = r === radio;
      r.setAttribute('aria-checked', on ? 'true' : 'false');
      r.tabIndex = on ? 0 : -1;
    });
    if (focus) radio.focus();
    group.dispatchEvent(new CustomEvent('tm:change', { bubbles: true, detail: { value: radio.getAttribute('data-value'), radio: radio } }));
  }
  function initRadios() {
    $$('[role="radiogroup"]').forEach(function (g) {
      var radios = $$('[role="radio"]', g);
      var checked = radios.filter(function (r) { return r.getAttribute('aria-checked') === 'true'; })[0];
      radios.forEach(function (r) { r.tabIndex = (checked ? r === checked : r === radios[0]) ? 0 : -1; });
    });
    document.addEventListener('click', function (e) {
      var r = e.target.closest('[role="radio"]');
      if (r && !r.hasAttribute('data-theme-value')) selectRadio(r);
    });
    document.addEventListener('keydown', function (e) {
      var r = e.target.closest && e.target.closest('[role="radio"]');
      if (!r) return;
      var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      var radios = $$('[role="radio"]', r.closest('[role="radiogroup"]')).filter(function (x) { return !x.disabled; });
      var next = radios[(radios.indexOf(r) + keys[e.key] + radios.length) % radios.length];
      if (next.hasAttribute('data-theme-value')) { applyTheme(next.getAttribute('data-theme-value')); next.focus(); }
      else selectRadio(next, true);
    });
  }

  /* ---------- Tab ---------- */
  function selectTab(tab, focus) {
    var list = tab.closest('[role="tablist"]');
    $$('[role="tab"]', list).forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
    list.dispatchEvent(new CustomEvent('tm:tab', { bubbles: true, detail: { tab: tab } }));
  }
  function initTabs() {
    $$('[role="tablist"]').forEach(function (list) {
      var tabs = $$('[role="tab"]', list);
      var sel = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
      if (sel) selectTab(sel);
    });
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[role="tab"]');
      if (t) selectTab(t);
    });
    document.addEventListener('keydown', function (e) {
      var t = e.target.closest && e.target.closest('[role="tab"]');
      if (!t) return;
      var tabs = $$('[role="tab"]', t.closest('[role="tablist"]'));
      var i = tabs.indexOf(t), n = null;
      if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === 'Home') n = tabs[0];
      if (e.key === 'End') n = tabs[tabs.length - 1];
      if (n) { e.preventDefault(); selectTab(n, true); }
    });
  }

  /* ---------- Interruttori ---------- */
  function initSwitches() {
    document.addEventListener('click', function (e) {
      var s = e.target.closest('[role="switch"]');
      if (!s || s.disabled) return;
      s.setAttribute('aria-checked', s.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    });
  }

  /* ---------- Mostra/nascondi password ---------- */
  function initPassword() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-password-toggle]');
      if (!b) return;
      var input = document.getElementById(b.getAttribute('aria-controls'));
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.setAttribute('aria-pressed', show ? 'true' : 'false');
      b.setAttribute('aria-label', show ? 'Nascondi password' : 'Mostra password');
      var use = b.querySelector('use');
      if (use) use.setAttribute('href', show ? '#i-eye-off' : '#i-eye');
    });
  }

  /* ---------- Dialog (bottom sheet / modale) ---------- */
  TM.openDialog = function (id, opener) {
    var d = document.getElementById(id);
    if (!d) return;
    d._opener = opener || document.activeElement;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    d.dispatchEvent(new CustomEvent('tm:open', { detail: { opener: d._opener } }));
  };
  TM.closeDialog = function (d) {
    if (!d) return;
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
  };
  function initDialogs() {
    document.addEventListener('click', function (e) {
      var o = e.target.closest('[data-dialog-open]');
      if (o) { TM.openDialog(o.getAttribute('data-dialog-open'), o); return; }
      var c = e.target.closest('[data-dialog-close]');
      if (c) { TM.closeDialog(c.closest('dialog')); return; }
      if (e.target.tagName === 'DIALOG' && e.target.classList.contains('tm-dialog')) {
        var r = e.target.getBoundingClientRect();
        var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) TM.closeDialog(e.target);
      }
    });
  }

  /* ---------- Menu a tendina ---------- */
  function closeMenus(except) {
    $$('[data-menu][aria-expanded="true"]').forEach(function (b) {
      if (b === except) return;
      b.setAttribute('aria-expanded', 'false');
      var m = document.getElementById(b.getAttribute('aria-controls'));
      if (m) m.hidden = true;
    });
  }
  function initMenus() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-menu]');
      if (b) {
        var m = document.getElementById(b.getAttribute('aria-controls'));
        var open = b.getAttribute('aria-expanded') !== 'true';
        closeMenus(b);
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        m.hidden = !open;
        if (open) { var first = $('[role="menuitem"]', m); if (first) first.focus(); }
        return;
      }
      if (e.target.closest('[role="menuitem"]')) {
        var menu = e.target.closest('[role="menu"]');
        var trig = $('[aria-controls="' + menu.id + '"]');
        closeMenus();
        if (trig) trig.focus();
        return;
      }
      if (!e.target.closest('[role="menu"]')) closeMenus();
    });
    document.addEventListener('keydown', function (e) {
      var menu = e.target.closest && e.target.closest('[role="menu"]');
      if (e.key === 'Escape') {
        var open = $('[data-menu][aria-expanded="true"]');
        if (open) { closeMenus(); open.focus(); }
        return;
      }
      if (!menu) return;
      var items = $$('[role="menuitem"]:not([disabled])', menu);
      var i = items.indexOf(e.target);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (e.key === 'Tab') closeMenus();
    });
  }

  /* ---------- Toast ---------- */
  var toaster;
  function getToaster() {
    if (toaster) return toaster;
    toaster = $('.tm-toaster');
    if (!toaster) {
      toaster = document.createElement('div');
      toaster.className = 'tm-toaster';
      toaster.setAttribute('aria-live', 'polite');
      toaster.setAttribute('data-nuxt-ui', 'UToast');
      document.body.appendChild(toaster);
    }
    return toaster;
  }
  var toneIcon = { success: 'check-circle', danger: 'error', info: 'info' };
  var toneLabel = { success: 'Fatto', danger: 'Errore', info: 'Info' };
  TM.toast = function (o) {
    var tone = o.tone || 'info';
    var t = document.createElement('div');
    t.className = 'tm-toast tm-toast--' + tone;
    if (tone === 'danger') t.setAttribute('role', 'alert');
    t.innerHTML = icon(toneIcon[tone]) +
      '<div class="tm-toast__body"><strong class="tm-toast__title">' + (o.title || toneLabel[tone]) + '</strong>' + (o.text || '') + '</div>' +
      '<button type="button" class="tm-button tm-button--icon tm-toast__close" aria-label="Chiudi notifica">' + icon('x') + '</button>';
    getToaster().appendChild(t);
    var remove = function () { if (t.parentNode) t.parentNode.removeChild(t); };
    t.querySelector('.tm-toast__close').addEventListener('click', remove);
    if (tone !== 'danger') setTimeout(remove, 5000);
  };
  function initToasts() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-toast-tone]');
      if (b) TM.toast({ tone: b.getAttribute('data-toast-tone'), title: b.getAttribute('data-toast-title'), text: b.getAttribute('data-toast-text') });
    });
  }

  /* ---------- Caricamento (demo) ---------- */
  function initLoadingDemo() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-loading-demo]');
      if (!b || b.classList.contains('is-loading')) return;
      b.classList.add('is-loading');
      b.setAttribute('aria-busy', 'true');
      var status = document.getElementById(b.getAttribute('data-loading-demo'));
      if (status) status.textContent = 'Salvataggio in corso';
      setTimeout(function () {
        b.classList.remove('is-loading');
        b.removeAttribute('aria-busy');
        if (status) status.textContent = 'Salvato';
      }, 2000);
    });
  }

  /* ---------- Risposta alla convocazione: Ci sono / Non posso ---------- */
  function initResponse() {
    document.addEventListener('click', function (e) {
      var yes = e.target.closest('[data-response-yes]');
      var no = e.target.closest('[data-response-no]');
      var change = e.target.closest('[data-response-change]');
      var confirm = e.target.closest('[data-response-confirm]');
      if (yes) setResponse(yes.closest('[data-response]'), 'yes');
      if (no) {
        var box = no.closest('[data-response]');
        /* Staff: nessun motivo, la risposta è diretta. Giocatore: foglio con il motivo */
        if (box.getAttribute('data-response') === 'diretta') { setResponse(box, 'no'); }
        else {
          var dlg = document.getElementById(box.getAttribute('data-response'));
          dlg._target = box;
          TM.openDialog(dlg.id, no);
        }
      }
      if (change) {
        var c = change.closest('[data-response]');
        $('.js-response-actions', c).hidden = false;
        $('.js-response-result', c).hidden = true;
        $('[data-response-yes]', c).focus();
      }
      if (confirm) {
        var d = confirm.closest('dialog');
        var r = $('[role="radio"][aria-checked="true"]', d);
        if (!r) return;
        setResponse(d._target, 'no', r.getAttribute('data-value'));
        TM.closeDialog(d);
      }
    });
    document.addEventListener('tm:change', function (e) {
      var d = e.target.closest('dialog');
      if (!d) return;
      var c = $('[data-response-confirm]', d);
      if (c) { c.disabled = false; c.removeAttribute('aria-disabled'); }
    });
  }
  function setResponse(box, value, reason) {
    if (!box) return;
    var res = $('.js-response-result', box);
    var badge = $('.js-response-badge', box);
    var staff = box.getAttribute('data-response') === 'diretta';
    if (value === 'yes') {
      badge.className = 'tm-badge tm-badge--success js-response-badge';
      badge.innerHTML = icon('check-circle') + (staff ? 'Disponibile' : 'Confermato');
    } else {
      badge.className = 'tm-badge tm-badge--danger js-response-badge';
      badge.innerHTML = icon('x-circle') + (staff ? 'Non disponibile' : 'Declinato: ' + reason);
    }
    $('.js-response-actions', box).hidden = true;
    res.hidden = false;
    $('[data-response-change]', box).focus();
    TM.toast({ tone: 'success', title: 'Risposta inviata', text: staff ? ' La tua disponibilità è registrata.' : (value === 'yes' ? ' Lo staff vede che ci sei.' : ' Lo staff vede che non puoi.') });
  }

  /* ---------- Collezioni a card: ricerca, filtri, ordinamento, selezione ---------- */
  function refreshCollection(id) {
    var list = document.getElementById(id);
    if (!list) return;
    var items = $$('[data-item]', list);
    var q = ($('[data-search-for="' + id + '"]') || {}).value || '';
    q = q.trim().toLowerCase();
    var filters = $$('[data-filter-for="' + id + '"]').map(function (f) { return { key: f.getAttribute('data-filter-key'), val: f.value }; });
    var shown = 0;
    items.forEach(function (it) {
      var ok = !q || (it.getAttribute('data-name') || '').toLowerCase().indexOf(q) > -1;
      filters.forEach(function (f) { if (f.val && (it.getAttribute('data-' + f.key) || '').split(' ').indexOf(f.val) === -1) ok = false; });
      it.hidden = !ok;
      if (ok) shown++;
    });
    var sort = $('[data-sort-for="' + id + '"]');
    if (sort) {
      var key = sort.value;
      items.sort(function (a, b) { return (a.getAttribute('data-' + key) || '').localeCompare(b.getAttribute('data-' + key) || '', 'it', { numeric: true }); })
        .forEach(function (it) { list.appendChild(it); });
    }
    var count = $('[data-count-for="' + id + '"]');
    if (count) count.textContent = shown === 1 ? '1 persona' : shown + ' persone';
    var sel = $('[data-selection-for="' + id + '"]');
    if (sel) {
      var n = $$('[data-item-select]:checked', list).length;
      sel.textContent = n ? n + ' selezionate' : '';
    }
  }
  function initCollections() {
    $$('[data-collection]').forEach(function (l) { refreshCollection(l.id); });
    var handler = function (e) {
      var t = e.target;
      var id = t.getAttribute && (t.getAttribute('data-search-for') || t.getAttribute('data-filter-for') || t.getAttribute('data-sort-for'));
      if (!id && t.matches && t.matches('[data-item-select]')) id = t.closest('[data-collection]').id;
      if (id) refreshCollection(id);
    };
    document.addEventListener('input', handler);
    document.addEventListener('change', handler);
  }

  /* ---------- Barre di avanzamento: larghezza da data-progress (niente stili inline nel markup) ---------- */
  function initProgress() {
    $$('[data-progress]').forEach(function (b) { b.style.width = b.getAttribute('data-progress') + '%'; });
  }

  /* ---------- Titolare/Panchina nel catalogo ---------- */
  function initTpDemo() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-demo-tp]');
      if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    });
  }

  /* ---------- Disponibilità della propria riga staff (sezione Staff dell'evento) ---------- */
  function initStaffSelf() {
    document.addEventListener('tm:change', function (e) {
      var g = e.target.closest('[data-staff-self]');
      if (!g) return;
      var sec = g.closest('[data-staff-section]');
      var li = g.closest('li');
      var yes = e.detail.value === 'si';
      var target = sec.querySelector('[data-staff-group="' + (yes ? 'si' : 'no') + '"] ul');
      var b = li.querySelector('.js-staff-badge');
      b.className = 'tm-badge tm-badge--' + (yes ? 'success' : 'danger') + ' js-staff-badge';
      b.innerHTML = icon(yes ? 'check-circle' : 'x-circle') + (yes ? 'Disponibile' : 'Non disponibile');
      target.appendChild(li);
      var focusTarget = li.querySelector('[role="radio"][aria-checked="true"]'); if (focusTarget) focusTarget.focus();
      $$('[data-staff-group]', sec).forEach(function (gr) {
        var n = $$(':scope > ul > li', gr).length;
        gr.hidden = !n;
        var c = gr.querySelector('.tm-group-title__count'); if (c) c.textContent = n;
      });
      var sum = sec.querySelector('[data-staff-summary]');
      if (sum) { var nsi = $$('[data-staff-group="si"] > ul > li', sec).length; sum.textContent = nsi + (nsi === 1 ? ' disponibile su ' : ' disponibili su ') + $$('[data-staff-group] > ul > li', sec).length; }
      var coach = $$('[data-staff-group="si"] [data-role="allenatore"]', sec).length;
      var banner = sec.querySelector('[data-no-coach]'); if (banner) banner.hidden = coach > 0;
      var live = sec.querySelector('[data-staff-live]'); if (live) live.textContent = 'La tua disponibilità: ' + (yes ? 'disponibile' : 'non disponibile');
    });
  }

  /* ---------- Avvio ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initRadios();
    initTabs();
    initSwitches();
    initPassword();
    initDialogs();
    initMenus();
    initToasts();
    initLoadingDemo();
    initResponse();
    initCollections();
    initProgress();
    initTpDemo();
    initStaffSelf();
  });
  TM.reduceMotion = reduceMotion;
})();
