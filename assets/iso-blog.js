/* Piste R « Version retenue » : comportements JS portés de build/piste-r.js.
   Adaptations : root = document, données transmises via <script type="application/json"
   id="iso-blog-articles-data"> (HTML encodé par Liquid | json, jamais brut).
   Aucune dépendance externe.
   RGAA : IntersectionObserver (pas d'écouteur scroll), aria-pressed, aria-live, inert.
   Éco : fonctions déclenchées uniquement sur les éléments présents, pas de polling.
   Sécu : le contenu de la grille filtrée est reconstruit par DOMParser sur du HTML
   pré-rendu côté serveur (Liquid), encodé en JSON, jamais interpolé depuis une saisie
   utilisateur. */

(function () {
  'use strict';


  /* ---------- Article : transformations du corps, reprises de build/piste-r.js ----------
     Le texte de l'article est servi par Shopify (Liquid) ; ce bloc ne fait que le réorganiser :
     intertitres ancrés et sommaire, partie « Questions fréquentes » déplacée en accordéons,
     listes des intertitres de liste en cases à cocher, tableaux lisibles sur mobile. */
  var art = document.querySelector('[data-br-article]');
  var prose = art && art.querySelector('.br-art-prose');
  if (prose) {
    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var slug = function (s) {
      return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    };
    var pmEl = art.querySelector('.br-toc-mob .br-pm');
    var BPM = pmEl ? pmEl.outerHTML : '';

    /* Nettoyage (même règle que la maquette) : styles collés depuis un traitement de texte, émojis */
    var b = prose.innerHTML;
    b = b.replace(/<meta[^>]*>/gi, '');
    b = b.replace(/\s(style|data-[a-z-]+|class|dir)="[^"]*"/gi, '');
    b = b.replace(/<span>([\s\S]*?)<\/span>/gi, '$1');
    b = b.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}️‍]\s?/gu, '');

    /* Intertitres ancrés */
    var toc = [], used = {};
    b = b.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, function (m, inner) {
      var txt = inner.replace(/<[^>]+>/g, '').trim();
      var id = slug(txt) || 'partie';
      if (used[id]) id += '-' + (++used[id]); else used[id] = 1;
      toc.push({ id: id, html: inner.replace(/<[^>]+>/g, '').trim() });
      return '<h2 id="' + id + '">' + inner + '</h2>';
    });

    /* FAQ */
    var faqSec = art.querySelector('[data-br-faq]');
    var fm = b.match(/(<h2([^>]*)>(Questions fr[eé]quentes[^<]*)<\/h2>)([\s\S]*?)(?=<h2|$)/i);
    if (fm && faqSec) {
      var qs = [], h3re = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/gi, q;
      while ((q = h3re.exec(fm[4]))) {
        var qt = q[1].replace(/<[^>]+>/g, '').trim();
        if (qt) qs.push({ q: qt, a: q[2].trim() });
      }
      if (qs.length) {
        b = b.replace(fm[1] + fm[4], '');
        var fid = (fm[2].match(/id="([^"]*)"/) || [])[1] || '';
        toc = toc.filter(function (t) { return t.id !== fid; });
        var half = Math.ceil(qs.length / 2);
        var cols = [qs.slice(0, half), qs.slice(half)].map(function (col) {
          return '<div class="br-faq-col">' + col.map(function (x) {
            return '<details class="br-q"><summary>' + esc(x.q) + BPM + '</summary><div class="br-q-a">' + x.a + '</div></details>';
          }).join('') + '</div>';
        }).join('');
        faqSec.firstElementChild.innerHTML = '<h2 class="br-h2 br-faq-head" id="br-faq-h">' + esc(fm[3].trim()) + '</h2><div class="br-faq">' + cols + '</div>';
        faqSec.hidden = false;
      }
    }

    /* Cases à cocher sous les intertitres de liste */
    b = b.replace(/(<h2[^>]*id="([^"]*)"[^>]*>)([\s\S]*?)(<\/h2>)([\s\S]*?)(?=<h2|$)/gi, function (match, open, id, titleInner, close, rest) {
      var titleTxt = titleInner.replace(/<[^>]+>/g, '');
      if (!/checklist|liste|que mettre|valise maternité pour|papiers à ne pas oublier|salle de naissance|pour le papa/i.test(titleTxt)) return match;
      var idx = 0;
      rest = rest.replace(/<ul>([\s\S]*?)<\/ul>/gi, function (ulM, inner) {
        var items = [], lre = /<li[^>]*>([\s\S]*?)<\/li>/gi, lm;
        while ((lm = lre.exec(inner))) items.push(lm[1].replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1').replace(/<\/?p>/gi, '').trim());
        if (!items.length) return ulM;
        var cks = items.map(function (txt) {
          var cid = 'br-cb-' + id + '-' + (idx++);
          return '<li class="br-check-item"><input type="checkbox" id="' + cid + '"><label class="br-check-label" for="' + cid + '"><span class="br-cb-box" aria-hidden="true"></span><span class="br-cb-txt">' + txt + '</span></label></li>';
        }).join('');
        return '<div class="br-ckwrap" data-total="' + items.length + '"><p class="br-checklist-counter" data-counter="true" aria-live="polite">0 / ' + items.length + '</p><ul class="br-checklist">' + cks + '</ul></div>';
      });
      return open + titleInner + close + rest;
    });

    /* Tableaux : chaque cellule porte l'intitulé de sa colonne (cartes sur mobile) */
    b = b.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, function (tb, inner) {
      var heads = [], hre = /<th[^>]*>([\s\S]*?)<\/th>/gi, hm;
      while ((hm = hre.exec(inner))) heads.push(hm[1].replace(/<[^>]+>/g, '').trim());
      var rows = inner.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, function (tr, cells) {
        var n = 0;
        return '<tr>' + cells.replace(/<td[^>]*>/gi, function () { return '<td data-label="' + esc(heads[n++] || '') + '">'; }) + '</tr>';
      });
      return '<div class="br-table"><table>' + rows + '</table></div>';
    });

    prose.innerHTML = b;

    /* Sommaire */
    if (toc.length) {
      var li = toc.map(function (t) { return '<li><a href="#' + t.id + '" data-toc-id="' + t.id + '">' + esc(t.html) + '</a></li>'; }).join('');
      art.querySelectorAll('[data-br-toc]').forEach(function (ol) { ol.innerHTML = li; });
      var mob = art.querySelector('.br-toc-mob'); if (mob) mob.hidden = false;
      var dt = art.querySelector('.br-toc-desk-title'); if (dt) dt.hidden = false;
    }
  }

  var behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  /* Scroll en tenant compte de la hauteur de l'en-tête collant */
  function scrollToEl(target) {
    if (!target) return;
    var offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sticky-area-height') || '0', 10);
    var top = target.getBoundingClientRect().top + window.scrollY - offset - 20;
    window.scrollTo({ top: top, behavior: behavior });
  }

  /* Ancres TOC : scroll via data-toc-id (évite le double saut natif) */
  document.querySelectorAll('[data-toc-id]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      scrollToEl(document.getElementById(a.dataset.tocId));
    });
  });

  /* Filtre thèmes (page liste).
     Les cartes HTML sont pré-rendues côté serveur dans un <template id="iso-blog-cards-<tag>">
     pour chaque tag, puis récupérées ici par clonage de noeud, pas de génération HTML en JS. */
  var filters = document.querySelectorAll('.br-fil');
  var grid = document.querySelector('.br-grid');
  if (filters.length && grid) {
    function applyFilter(tag) {
      filters.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.tag === tag));
      });
      var tplId = tag === '' ? 'iso-blog-cards-all' : 'iso-blog-cards-' + tag.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      var tpl = document.getElementById(tplId);
      if (!tpl) return;
      /* Clonage sûr : pas de innerHTML, pas d'interpolation JS */
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      grid.appendChild(document.importNode(tpl.content, true));
    }

    filters.forEach(function (b) {
      b.addEventListener('click', function () { applyFilter(b.dataset.tag); });
    });
  }

  /* Sommaire article : section active via IntersectionObserver */
  var tocAnchors = document.querySelectorAll('[data-toc-id]');
  if (tocAnchors.length && 'IntersectionObserver' in window) {
    var headings = [];
    tocAnchors.forEach(function (a) {
      var h = document.getElementById(a.dataset.tocId);
      if (h) headings.push(h);
    });
    var active = null;
    function setActive(id) {
      if (active === id) return;
      active = id;
      tocAnchors.forEach(function (a) {
        a.classList.toggle('is-active', a.dataset.tocId === id);
      });
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-80px 0px -60% 0px', threshold: 0 });
    headings.forEach(function (h) { io.observe(h); });
  }

  /* Compteurs de checklist */
  document.querySelectorAll('.br-ckwrap').forEach(function (cl) {
    var total = parseInt(cl.dataset.total, 10) || 0;
    var counter = cl.querySelector('[data-counter]');
    function upd() {
      var n = cl.querySelectorAll('input:checked').length;
      if (counter) counter.textContent = n + '\u00a0/\u00a0' + total;
    }
    cl.querySelectorAll('input').forEach(function (cb) {
      cb.addEventListener('change', upd);
    });
  });

  /* Carrousel fixé en bas : mobile uniquement.
     Apparaît quand le hero n'est plus visible ; disparaît quand la FAQ
     ou la section « À lire aussi » entre dans le viewport. */
  var fixbar = document.querySelector('.br-fixbar');
  var heroEl = document.querySelector('.br-art-hero');
  var spacer = document.querySelector('.br-fixbar-spacer');

  if (fixbar && heroEl && 'IntersectionObserver' in window) {
    var heroVisible = true;
    var endStates = [];

    function updateBar() {
      var anyEnd = endStates.some(function (s) { return s.visible; });
      var show = !heroVisible && !anyEnd;
      fixbar.classList.toggle('is-on', show);
      fixbar.setAttribute('aria-hidden', show ? 'false' : 'true');
      if (show) {
        fixbar.removeAttribute('inert');
      } else {
        fixbar.setAttribute('inert', '');
      }
      if (spacer) spacer.style.display = show ? '' : 'none';
    }

    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      updateBar();
    }, { threshold: 0 }).observe(heroEl);

    var endEls = [
      document.querySelector('.br-sec.br-ivory'),
      document.querySelector('.br-also')
    ].filter(Boolean);

    endEls.forEach(function (el) {
      var state = { visible: false };
      endStates.push(state);
      new IntersectionObserver(function (entries) {
        state.visible = entries[0].isIntersecting;
        updateBar();
      }, { threshold: 0 }).observe(el);
    });
  }
})();
