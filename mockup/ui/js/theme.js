/* TeamManix · tema scelto per la valutazione del mockup (Chiaro, Scuro, Automatico).
   Caricato nel <head> per evitare il lampo di tema sbagliato. */
(function () {
  try {
    var t = localStorage.getItem('tm-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage non disponibile: segue il sistema */ }
})();
