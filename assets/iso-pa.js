/* Piste A « Continuité » : comportements de la fiche produit (portage de mount() de build/piste-a.js).
   Arbitrages :
   - RGAA : états portés par les attributs (aria-pressed, aria-expanded, disabled), annonce de l'ajout au
     panier dans une zone role="status", défilement doux coupé si prefers-reduced-motion.
   - Éco / perf : aucune bibliothèque, écouteurs de défilement passifs regroupés par requestAnimationFrame
     (dont la barre d'achat mobile et la carte d'ajout rapide ordinateur), aucun appel réseau hors ajout
     au panier.
   - Sécu : aucun HTML injecté (textContent uniquement) ; données lues dans le JSON de la section, produit
     par Liquid ; le panier passe par window.OCAOUCart (snippets/ocaou-cart-add). */
(function () {
  "use strict";
  var NB = "\u00a0";
  var BEHAVIOR = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  var LABEL = "Ajouter au panier";

  /* Anneau de focus des pastilles et des formules : au clavier seulement (RGAA 10.7). Certains
     navigateurs l'affichent aussi après un clic souris (retour du 15/09) ; la classe pa-mouse le coupe
     jusqu'à la prochaine touche. Sans script, l'anneau reste : l'accessibilité ne dépend pas du JS. */
  var html = document.documentElement;
  document.addEventListener("pointerdown", function () { html.classList.add("pa-mouse"); }, true);
  document.addEventListener("keydown", function (e) {
    if (!e.metaKey && !e.ctrlKey && !e.altKey) html.classList.remove("pa-mouse");
  }, true);

  function all(scope, sel) { return Array.prototype.slice.call(scope.querySelectorAll(sel)); }

  /* Montant en centimes au format de la boutique (shop.money_format), insécable avant l'euro. */
  function amount(cents, dec, th, ds) {
    var p = (cents / 100).toFixed(dec).split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, th);
    return p.join(ds);
  }
  function money(cents, fmt) {
    return String(fmt || "{{amount_with_comma_separator}} €").replace(/\{\{\s*(\w+)\s*\}\}/, function (_, k) {
      switch (k) {
        case "amount_with_comma_separator": return amount(cents, 2, ".", ",");
        case "amount_no_decimals_with_comma_separator": return amount(cents, 0, ".", ",");
        case "amount_with_space_separator": return amount(cents, 2, " ", ",");
        case "amount_with_period_and_space_separator": return amount(cents, 2, " ", ".");
        case "amount_with_apostrophe_separator": return amount(cents, 2, "'", ".");
        case "amount_no_decimals": return amount(cents, 0, ",", ".");
        default: return amount(cents, 2, ",", ".");
      }
    }).replace(/<[^>]*>/g, "").replace(/ €/g, NB + "€");
  }

  /* Ajout au panier : helper du thème (ouvre le tiroir), sinon envoi direct puis page panier. */
  function addToCart(items) {
    if (window.OCAOUCart && typeof window.OCAOUCart.add === "function") return window.OCAOUCart.add(items);
    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
    return fetch(root + "cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ items: items })
    }).then(function (r) {
      return r.json().then(function (p) {
        if (!r.ok) throw new Error(p.description || p.message || "Erreur panier");
        window.location.href = root + "cart";
        return p;
      });
    });
  }

  /* Carrousels : boutons Précédent / Suivant (désactivés aux extrémités). */
  function carousels(scope) {
    all(scope, ".iso-pa .pa-carnav").forEach(function (nav) {
      if (nav.dataset.paOn) return;
      nav.dataset.paOn = "1";
      var tr = document.getElementById(nav.dataset.for);
      var btns = nav.querySelectorAll(".pa-arr");
      if (!tr || btns.length < 2) return;
      var prev = btns[0], next = btns[1];
      function step() {
        var f = tr.children[0];
        return f ? f.offsetWidth + (parseFloat(getComputedStyle(tr).columnGap) || 0) : tr.clientWidth;
      }
      function upd() {
        /* Rien a faire defiler : les fleches n'ont plus d'objet, on les retire de la page. */
        nav.hidden = tr.scrollWidth <= tr.clientWidth + 2;
        prev.disabled = tr.scrollLeft <= 2;
        next.disabled = tr.scrollLeft >= tr.scrollWidth - tr.clientWidth - 2;
        /* RGAA : une zone qui défile se parcourt aussi au clavier, seulement quand elle défile. */
        if (tr.scrollWidth > tr.clientWidth + 2) tr.setAttribute("tabindex", "0");
        else if (!tr.matches(".pa-mtrack")) tr.removeAttribute("tabindex");
      }
      prev.addEventListener("click", function () { tr.scrollBy({ left: -step(), behavior: BEHAVIOR }); });
      next.addEventListener("click", function () { tr.scrollBy({ left: step(), behavior: BEHAVIOR }); });
      tr.addEventListener("scroll", function () { requestAnimationFrame(upd); }, { passive: true });
      window.addEventListener("resize", function () { requestAnimationFrame(upd); }, { passive: true });
      upd();
    });
  }

  /* Composant à points : point sur la photo et ligne de la liste synchronisés. */
  function hotspots(scope) {
    all(scope, ".iso-pa .pa-hs").forEach(function (hs) {
      if (hs.dataset.paOn) return;
      hs.dataset.paOn = "1";
      var ctl = all(hs, ".pa-hs-pt, .pa-hs-btn"), dets = all(hs, ".pa-hs-d");
      function act(i) {
        ctl.forEach(function (b) { b.setAttribute("aria-expanded", String(+b.dataset.i === i)); });
        dets.forEach(function (d, j) { d.hidden = j !== i; });
      }
      ctl.forEach(function (b) {
        b.addEventListener("click", function () {
          act(+b.dataset.i);
          if (b.classList.contains("pa-hs-pt")) {
            var li = dets[+b.dataset.i] && dets[+b.dataset.i].closest(".pa-hs-li");
            if (li) li.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        });
      });
    });
  }

  /* Produits associés : ajout direct au panier (variante unique), points du défilement des photos sur mobile. */
  function related(scope) {
    all(scope, ".iso-pa [data-pa-add]").forEach(function (b) {
      if (b.dataset.paOn) return;
      b.dataset.paOn = "1";
      b.addEventListener("click", function () {
        if (b.disabled) return;
        b.disabled = true;
        addToCart([{ id: +b.dataset.paAdd, quantity: 1 }]).catch(function () {}).then(function () { b.disabled = false; });
      });
    });
    all(scope, ".iso-pa [data-pa-sl]").forEach(function (sl) {
      if (sl.dataset.paOn) return;
      sl.dataset.paOn = "1";
      var dots = sl.parentNode.querySelectorAll(".pa-pc-dots i");
      sl.addEventListener("scroll", function () {
        var i = Math.round(sl.scrollLeft / (sl.clientWidth || 1));
        for (var j = 0; j < dots.length; j++) dots[j].classList.toggle("is-on", j === i);
      }, { passive: true });
    });
  }

  /* Date d'expédition : même calcul que le bloc d'expédition du site (jours ouvrés, hors week-end). */
  function shipDates(scope) {
    all(scope, ".iso-pa [data-pa-ship]").forEach(function (el) {
      var n = parseInt(el.dataset.paShip, 10) || 2, d = new Date();
      while (n > 0) {
        d.setDate(d.getDate() + 1);
        var j = d.getDay();
        if (j !== 0 && j !== 6) n--;
      }
      el.textContent = "Expédié " + d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" });
    });
  }

  /* La photo n'est remplacée qu'une fois prête : la précédente reste affichée pendant le téléchargement,
     jamais un cadre vide (attente signalée le 17/09). Au-delà de 150 ms, la photo s'estompe le temps
     d'arriver. Un clic plus récent annule le remplacement en attente. */
  var largeSeq = 0;
  function setLarge(img, src, srcset, alt, done) {
    if (!img || !src) return;
    var seq = ++largeSeq;
    var apply = function () {
      if (seq !== largeSeq) return;
      if (srcset) img.srcset = srcset; else img.removeAttribute("srcset");
      img.src = src;
      if (alt != null) img.alt = alt;
      img.classList.remove("pa-wait");
      if (done) done(img);
    };
    var pre = new Image();
    if (srcset) {
      pre.sizes = img.getAttribute("sizes") || "";
      pre.srcset = srcset;
    }
    pre.decoding = "async";
    pre.src = src;
    if (pre.complete) { apply(); return; }
    var wait = setTimeout(function () { if (seq === largeSeq) img.classList.add("pa-wait"); }, 150);
    var end = function () { clearTimeout(wait); clearTimeout(safety); apply(); };
    /* decode() ne se termine pas sur une image hors de la page dans Chrome : on suit le chargement, et
       un filet remet la photo en place si l'événement n'arrive jamais. */
    var safety = setTimeout(end, 2500);
    pre.onload = end;
    pre.onerror = end;
  }
  function setSmall(img, src) {
    if (!img || !src) return;
    img.removeAttribute("srcset");
    img.src = src;
  }
  /* Transition haut -> bas quand la photo change de couleur (Tâche 2). */
  function pulseImg(img) {
    if (!img) return;
    img.classList.remove("pa-anim");
    void img.offsetWidth;
    img.classList.add("pa-anim");
  }

  /* Zone d'achat. */
  function product(root) {
    if (root.dataset.paOn) return;
    var dataEl = root.querySelector("script[data-pa-data]");
    if (!dataEl) return;
    var D;
    try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }
    root.dataset.paOn = "1";
    var $ = function (s) { return root.querySelector(s); }, $$ = function (s) { return all(root, s); };
    var fmt = D.money, variants = D.variants || [], offers = D.offers || [];
    var byId = function (id) { for (var i = 0; i < variants.length; i++) if (variants[i].id === id) return variants[i]; return null; };
    var checked = $(".pa-colors input:checked");
    var variant = (checked && byId(+checked.value)) || variants[0];
    if (!variant) return;

    /* Galerie ordinateur : vignettes + loupe. Les photos de toutes les couleurs sont dans la page
       (attribut data-c) ; seules celles de la couleur choisie sont visibles. */
    var main = $(".pa-main-img"), box = $(".pa-main"), zoom = $(".pa-zoom");
    var grouped = D.grouped === true;
    var allThumbs = $$(".pa-th"), allSlides = $$(".pa-slide");
    var visible = function (l) { return l.filter(function (e) { return !e.hidden; }); };
    var thumbs = visible(allThumbs);
    function unzoom() {
      if (!box || !zoom) return;
      box.classList.remove("is-zoom");
      zoom.setAttribute("aria-pressed", "false");
    }
    /* La photo agrandie garde sa grande version tant qu'on ne change pas de photo. */
    function resetSizes() { if (main && main.dataset.sizes) main.sizes = main.dataset.sizes; }
    if (main && main.getAttribute("sizes")) main.dataset.sizes = main.getAttribute("sizes");
    function show(i, anim) {
      var t = thumbs[i];
      if (!t || !main) return;
      resetSizes();
      setLarge(main, t.dataset.src, t.dataset.srcset, t.dataset.alt, anim ? pulseImg : null);
      thumbs.forEach(function (b, j) { b.setAttribute("aria-pressed", String(j === i)); });
      unzoom();
    }
    allThumbs.forEach(function (b) { b.addEventListener("click", function () { show(+b.dataset.i); }); });
    if (zoom && box && main) {
      var baseSizes = main.getAttribute("sizes");
      zoom.addEventListener("click", function () {
        var on = !box.classList.contains("is-zoom");
        box.classList.toggle("is-zoom", on);
        zoom.setAttribute("aria-pressed", String(on));
        /* Perf : la version grande n'est demandée qu'à l'agrandissement. */
        if (on && baseSizes) main.sizes = "1100px";
      });
      box.addEventListener("pointermove", function (e) {
        if (!box.classList.contains("is-zoom")) return;
        var r = box.getBoundingClientRect();
        main.style.transformOrigin = ((e.clientX - r.left) / r.width) * 100 + "% " + ((e.clientY - r.top) / r.height) * 100 + "%";
      });
    }
    /* Photo précédente ou suivante au clic, souris seulement : un rond suit le pointeur, chevron
       retourné sur la moitié gauche, comme la galerie du thème (qui boucle aussi). */
    var cur = $(".pa-cur"), rail = $(".pa-rail");
    var fine = window.matchMedia ? matchMedia("(hover: hover) and (pointer: fine)") : null;
    function current() {
      for (var i = 0; i < thumbs.length; i++) if (thumbs[i].getAttribute("aria-pressed") === "true") return i;
      return 0;
    }
    /* La vignette active reste visible dans la colonne quand elle défile. */
    function reveal(t) {
      if (!rail || !t) return;
      var r = rail.getBoundingClientRect(), b = t.getBoundingClientRect();
      if (b.top < r.top) rail.scrollTop -= r.top - b.top;
      else if (b.bottom > r.bottom) rail.scrollTop += b.bottom - r.bottom;
    }
    if (box && main) {
      if (cur && thumbs.length > 1) {
        box.classList.add("has-cur");
        box.addEventListener("pointermove", function (e) {
          if (e.pointerType === "touch" || box.classList.contains("is-zoom") || e.target.closest("button, a[href]")) { cur.classList.remove("is-on"); return; }
          var r = box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
          cur.classList.toggle("is-prev", x < r.width / 2);
          cur.classList.add("is-on");
          cur.style.transform = "translate(" + (x - cur.offsetWidth / 2).toFixed(1) + "px," + (y - cur.offsetHeight / 2).toFixed(1) + "px)";
        }, { passive: true });
        box.addEventListener("pointerleave", function () { cur.classList.remove("is-on"); });
      }
      main.addEventListener("click", function (e) {
        if (box.classList.contains("is-zoom")) { unzoom(); return; }
        if (thumbs.length < 2 || !(fine && fine.matches)) return;
        var r = box.getBoundingClientRect(), n = thumbs.length;
        var i = (current() + (e.clientX - r.left < r.width / 2 ? n - 1 : 1)) % n;
        show(i);
        reveal(thumbs[i]);
      });
    }

    /* Galerie mobile : compteur + barre de progression, sur les photos de la couleur affichée. */
    var track = $(".pa-mtrack"), countI = $(".pa-count-i"), countN = $(".pa-count-n"), prog = $(".pa-prog span");
    var slides = visible(allSlides), raf = 0;
    function syncGal() {
      if (!track || !countI || !prog) return;
      var n = slides.length, s = slides[0];
      if (!n || !s || !track.clientWidth) return;
      var step = s.offsetWidth + (parseFloat(getComputedStyle(track).columnGap) || 0);
      var i = Math.round(track.scrollLeft / step);
      if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 2) i = n - 1;
      i = Math.max(0, Math.min(n - 1, i));
      countI.textContent = i + 1;
      prog.style.width = ((i + 1) / n) * 100 + "%";
    }
    if (track) track.addEventListener("scroll", function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(syncGal); }, { passive: true });

    /* Couleur choisie : son groupe de photos prend la place, sans rien télécharger de nouveau quand la
       photo a déjà été demandée. La photo de tête passe en priorité haute, c'est celle qu'on regarde. */
    function setGroup(ci) {
      var c = String(ci);
      allThumbs.forEach(function (t) { t.hidden = t.dataset.c !== c; });
      allSlides.forEach(function (sl) { sl.hidden = sl.dataset.c !== c; });
      thumbs = visible(allThumbs);
      slides = visible(allSlides);
      /* Toutes les photos du coloris sont demandees des le changement : la premiere en priorite haute,
         les suivantes en priorite basse. Sans cela, faire defiler juste apres le changement laissait un
         cadre blanc le temps du telechargement (retour du 21/09). */
      slides.concat(thumbs).forEach(function (el, i) {
        var im = el.querySelector("img");
        if (!im || im.loading !== "lazy") return;
        im.loading = "eager";
        if ("fetchPriority" in im) im.fetchPriority = i === 0 ? "high" : "low";
      });
      if (countN) countN.textContent = slides.length;
      if (countI) countI.textContent = "1";
      if (prog) prog.style.width = (slides.length ? 100 / slides.length : 100) + "%";
      if (track) track.scrollLeft = 0;
      show(0, true);
    }

    /* La photo d'une couleur est demandée dès que sa pastille est survolée, touchée ou atteinte au
       clavier : au clic, elle est déjà là. */
    var asked = {};
    function preload(v, bas) {
      if (!v || !v.src || asked[v.id]) return;
      asked[v.id] = 1;
      var im = new Image();
      if (v.srcset) {
        im.sizes = main ? main.getAttribute("sizes") || "" : "";
        im.srcset = v.srcset;
      }
      if (bas && "fetchPriority" in im) im.fetchPriority = "low";
      im.src = v.src;
    }

    /* Formules : prix, prix barré, économie et disponibilité recalculés à partir des variantes choisies. */
    var offerInputs = $$(".pa-offer .pa-opt-in");
    var cta = $(".pa-cta"), ctaL = $(".pa-cta-l"), ctaP = $(".pa-cta-p");
    var sbar = $(".pa-sbar"), sbarP = $(".pa-sbar-p"), sbarB = $(".pa-sbar-b"), sbarCn = $(".pa-sbar-cn"), sbarSw = $$(".pa-sbar-sw");
    var priceV = $(".pa-price-v"), cname = $(".pa-colors .pa-cname"), status = $("[data-pa-status]");
    var priceC = $(".pa-price-c"), priceCV = $(".pa-price-cv");
    var busy = false;

    /* Carte cadeau : les champs du destinataire n'apparaissent qu'une fois la case cochee. */
    var gc = $("[data-pa-gc]"), gcOn = gc && gc.querySelector("[data-pa-gc-on]"), gcF = gc && gc.querySelector("[data-pa-gc-f]");
    var gcEr = gc && gc.querySelector("[data-pa-gc-er]");
    if (gc) {
      var gcM = gc.querySelector("[data-pa-gc-mail]");
      if (gcM) gcM.addEventListener("input", function () {
        gcM.removeAttribute("aria-invalid");
        if (gcEr) gcEr.hidden = true;
      });
    }
    if (gcOn && gcF) {
      gcOn.addEventListener("change", function () {
        gcF.hidden = !gcOn.checked;
        if (gcOn.checked) { var m = gcF.querySelector("[data-pa-gc-mail]"); if (m) m.focus(); }
      });
    }

    /* Aucune formule cochée : -1, le produit seul. */
    function offIdx() {
      for (var i = 0; i < offerInputs.length; i++) if (offerInputs[i].checked) return +offerInputs[i].value;
      return -1;
    }
    function partVariant(oi, k) {
      var part = offers[oi].parts[k];
      var sel = root.querySelector('.pa-opt-parts[data-opt="' + oi + '"] input[data-part="' + k + '"]:checked');
      var id = sel ? sel.value : String(part.def);
      return { id: +id, info: part.v[id] || part.v[String(part.def)] };
    }
    function totals(oi) {
      var o = offers[oi];
      if (!o) return { pack: variant.price, cmp: 0, ok: variant.available };
      var sum = variant.price, ok = variant.available;
      o.parts.forEach(function (p, k) {
        var pv = partVariant(oi, k);
        sum += pv.info ? pv.info.p : 0;
        if (!pv.info || !pv.info.a) ok = false;
      });
      var pack = o.price == null ? sum : o.price;
      var cmp = o.price != null && sum > pack ? sum : 0;
      /* Avantage : economie sur le prix plus la valeur des cadeaux. */
      var adv = (cmp ? cmp - pack : 0) + (o.gifts || []).reduce(function (t, g) { return t + (g.p || 0); }, 0);
      return { pack: pack, cmp: cmp, adv: adv, ok: ok };
    }
    /* Ouverture d'une formule : la carte grandit en douceur, les vignettes glissent de la rangée vers la
       liste, puis noms et pastilles apparaissent ; la carte qui se referme fait le chemin inverse.
       Aucune animation si prefers-reduced-motion. */
    var MOTION = BEHAVIOR === "smooth" && typeof root.animate === "function";
    var EASE = "cubic-bezier(.4,0,.2,1)", DUR = 380;
    var openCard = $(".pa-opt.is-open"), animReady = false;
    function cardOf(oi) {
      for (var i = 0; i < offerInputs.length; i++) if (+offerInputs[i].value === oi) return offerInputs[i].closest(".pa-opt");
      return null;
    }
    /* Ce qui change de place d'une disposition à l'autre, repéré par la même clé des deux côtés. */
    function movers(card) {
      var open = card.classList.contains("is-open"), m = {};
      all(card, open ? ".pa-opt-part-img img" : ".pa-opt-th img").forEach(function (im) {
        var k = im.hasAttribute("data-pa-hero") ? "h" : im.hasAttribute("data-part") ? "p" + im.dataset.part : "";
        if (k) m[k] = open ? im.parentNode : im;
      });
      var g = card.querySelector(open ? ".pa-opt-list .pa-gifts" : ".pa-opt-more .pa-gifts");
      if (g) m.g = g;
      return m;
    }
    /* Positions relatives à la carte : elle peut se déplacer pendant que sa voisine change de taille. */
    function snap(card) {
      var r = card.getBoundingClientRect(), m = movers(card), pos = {};
      Object.keys(m).forEach(function (k) {
        var b = m[k].getBoundingClientRect();
        if (b.width) pos[k] = { x: b.left - r.left, y: b.top - r.top };
      });
      var lone = card.classList.contains("is-open") ? [] : all(card, ".pa-opt-th img:not([data-pa-hero]):not([data-part])").map(function (im) {
        var b = im.getBoundingClientRect();
        return { im: im, x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height };
      });
      return { h: r.height, pos: pos, lone: lone };
    }
    /* Les fondus des lignes sont suivis à part : une carte refermée en cours d'ouverture les laisse finir,
       sinon son texte réapparaîtrait avant de s'effacer. */
    function play(card, el, frames, opts, rowFade) {
      var a = el.animate(frames, opts);
      (rowFade ? card._paFades : card._paAnims).push(a);
      return a;
    }
    function stopAnims(card, keepFades) {
      (card._paAnims || []).concat(keepFades ? [] : card._paFades || []).forEach(function (a) { a.cancel(); });
      card._paAnims = [];
      if (!keepFades || !card._paFades) card._paFades = [];
      all(card, ".pa-ghost").forEach(function (g) { g.remove(); });
      card.style.overflow = "";
    }
    function animateCard(card, before, opening) {
      var after = snap(card), m = movers(card), parts = card.querySelector(".pa-opt-parts"), fade = null;
      card.style.overflow = "hidden";
      play(card, card, [{ height: before.h + "px" }, { height: after.h + "px" }], { duration: DUR, easing: EASE }).onfinish = function () {
        card.style.overflow = "";
        if (opening) return;
        card.classList.remove("is-closing");
        if (parts) parts.style.top = "";
        if (fade) fade.cancel();
      };
      Object.keys(after.pos).forEach(function (k) {
        var b = before.pos[k], e = after.pos[k];
        if (!b) {
          play(card, m[k], [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 120, easing: EASE, fill: "backwards" });
          return;
        }
        var dx = b.x - e.x, dy = b.y - e.y;
        if (Math.abs(dx) + Math.abs(dy) < 1) return;
        play(card, m[k], [{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }], { duration: DUR, easing: EASE });
      });
      if (opening) {
        var list = card.querySelector(".pa-opt-list");
        if (list) play(card, list, [{ borderTopColor: "transparent" }, { borderTopColor: getComputedStyle(list).borderTopColor }], { duration: 220, delay: 160, easing: EASE, fill: "backwards" }, true);
        all(card, ".pa-opt-part").forEach(function (row, i) {
          all(row, ".pa-opt-part-n, .pa-sws").forEach(function (el) {
            play(card, el, [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: 110 + i * 40, easing: EASE, fill: "backwards" }, true);
          });
        });
        /* Vignettes des cadeaux : sans ligne dans la liste, elles s'effacent sur place. */
        before.lone.forEach(function (o) {
          var g = o.im.cloneNode(false);
          g.className = "pa-ghost";
          g.removeAttribute("loading");
          g.style.cssText = "left:" + (o.x - card.clientLeft) + "px;top:" + (o.y - card.clientTop) + "px;width:" + o.w + "px;height:" + o.h + "px";
          card.appendChild(g);
          play(card, g, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: "ease-out", fill: "forwards" }).onfinish = function () { g.remove(); };
        });
      } else {
        if (parts) fade = play(card, parts, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: "ease-out", fill: "forwards" });
        all(card, ".pa-opt-th img:not([data-pa-hero]):not([data-part])").forEach(function (im) {
          play(card, im, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 140, easing: EASE, fill: "backwards" });
        });
      }
    }
    function swapOpen(next) {
      var prev = openCard;
      if (next === prev) return;
      openCard = next;
      var cards = [prev, next].filter(Boolean), go = MOTION && animReady;
      var before = go ? cards.map(snap) : [];
      var pp = prev && prev.querySelector(".pa-opt-parts");
      var ptop = go && pp ? pp.getBoundingClientRect().top - prev.getBoundingClientRect().top - prev.clientTop : 0;
      if (prev) stopAnims(prev, true);
      if (next) stopAnims(next, false);
      if (prev) {
        prev.classList.remove("is-open");
        prev.classList.toggle("is-closing", go);
        if (pp) pp.style.top = go ? ptop + "px" : "";
      }
      if (next) {
        var np = next.querySelector(".pa-opt-parts");
        next.classList.remove("is-closing");
        if (np) np.style.top = "";
        next.classList.add("is-open");
      }
      if (go) cards.forEach(function (c, i) { animateCard(c, before[i], c === next); });
    }
    /* La liste des articles d'une formule non choisie est repliée : hors d'atteinte du clavier. */
    function syncOpenParts(oi) {
      $$(".pa-opt-parts").forEach(function (g) { g.toggleAttribute("inert", +g.dataset.opt !== oi); });
      swapOpen(cardOf(oi));
    }
    function refresh(keepLabel) {
      offerInputs.forEach(function (inp) {
        var t = totals(+inp.value), lab = inp.closest(".pa-opt");
        if (!lab) return;
        var b = lab.querySelector(".pa-opt-p b"), s = lab.querySelector(".pa-opt-p s"), c = lab.querySelector(".pa-cmp"), sv = lab.querySelector(".pa-save");
        if (b) b.textContent = money(t.pack, fmt);
        if (s && c && sv) {
          s.hidden = !t.cmp;
          sv.hidden = !t.adv;
          c.textContent = t.cmp ? money(t.cmp, fmt) : "";
          sv.textContent = t.adv ? money(t.adv, fmt) + " d'avantages" : "";
        }
      });
      var oi = offIdx(), cur = totals(oi);
      if (ctaP) ctaP.textContent = money(cur.pack, fmt);
      if (sbarP) sbarP.textContent = money(cur.pack, fmt);
      if (priceV) priceV.textContent = money(variant.price, fmt);
      /* Prix barré du produit : propre à la variante, il suit le coloris choisi. */
      if (priceC && priceCV) {
        var pcmp = variant.cmp || 0;
        priceC.hidden = !pcmp;
        priceCV.textContent = pcmp ? money(pcmp, fmt) : "";
      }
      if (cta && !busy) {
        cta.disabled = !cur.ok;
        if (!keepLabel && ctaL) ctaL.textContent = cur.ok ? LABEL : (variant.available ? "Indisponible" : "Épuisé");
      }
      if (sbarB) sbarB.disabled = !cur.ok;
      syncOpenParts(oi);
    }
    /* Formules en cases à cocher : une seule à la fois, un second clic la décoche (produit seul). */
    offerInputs.forEach(function (inp) {
      inp.addEventListener("change", function () {
        if (inp.checked) offerInputs.forEach(function (o) { if (o !== inp) o.checked = false; });
        refresh();
      });
    });

    /* Coloris des articles ajoutés par une formule (pastilles) : vignette et prix suivent le choix. */
    $$(".pa-opt-parts input[data-part]").forEach(function (r) {
      r.addEventListener("change", function () {
        if (!r.checked) return;
        var g = r.closest(".pa-opt-parts"), oi = +g.dataset.opt, k = +r.dataset.part;
        var pv = partVariant(oi, k), card = r.closest(".pa-opt");
        if (pv.info && pv.info.sm) {
          all(card, 'img[data-part="' + k + '"]').forEach(function (im) { setSmall(im, pv.info.sm); });
        }
        var nameEl = r.closest(".pa-opt-part").querySelector(".pa-cname");
        if (nameEl) nameEl.textContent = r.dataset.title;
        refresh();
      });
    });

    /* Couleurs : la photo principale et la variante ajoutée au panier suivent la couleur choisie. */
    function applyColor(v, t) {
      if (!v) return;
      variant = v;
      t = t || v.title;
      if (cname) cname.textContent = t;
      if (sbarCn) sbarCn.textContent = t;
      sbarSw.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === String(v.id))); });
      $$(".pa-opt-part[data-master] .pa-cname").forEach(function (el) { el.textContent = t; });
      $$("[data-pa-hero]").forEach(function (im) { setSmall(im, v.sm); });
      if (grouped && v.c >= 0) {
        setGroup(v.c);
      } else {
        /* Photos non rangées par couleur dans Shopify : seule la photo de tête change. */
        if (v.src) {
          if (thumbs[0]) {
            thumbs[0].dataset.src = v.src;
            thumbs[0].dataset.srcset = v.srcset || "";
            thumbs[0].dataset.alt = v.alt;
          }
          $$("[data-pa-first]").forEach(function (im) {
            if (im.dataset.paFirst === "s") setSmall(im, v.sm);
            else if (im !== main) setLarge(im, v.src, v.srcset, im.getAttribute("alt") ? v.alt : null, pulseImg);
          });
        }
        show(0, true);
        if (track) track.scrollTo({ left: 0, behavior: BEHAVIOR });
      }
      refresh();
      try {
        var u = new URL(window.location.href);
        u.searchParams.set("variant", v.id);
        history.replaceState(history.state, "", u.toString());
      } catch (e) { /* adresse inchangée */ }
    }
    ["pointerenter", "touchstart", "focusin"].forEach(function (ev) {
      $$(".pa-colors .pa-sw").forEach(function (lb) {
        var inp = lb.querySelector("input");
        if (inp) lb.addEventListener(ev, function () { preload(byId(+inp.value)); }, { passive: true });
      });
      sbarSw.forEach(function (b) {
        b.addEventListener(ev, function () { preload(byId(+b.dataset.v)); }, { passive: true });
      });
    });
    /* Approcher les pastilles suffit à demander toutes les couleurs, en priorité basse : rien n'est
       téléchargé pour qui ne regarde pas les coloris, et le changement est immédiat pour qui les essaie. */
    if (variants.length > 1) {
      var lot = function () {
        var c = navigator.connection;
        if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return;
        variants.forEach(function (v) { preload(v, true); });
      };
      $$(".pa-colors .pa-sws, .pa-sbar-sws").forEach(function (zone) {
        ["pointerenter", "touchstart", "focusin"].forEach(function (ev) {
          zone.addEventListener(ev, lot, { passive: true, once: true });
        });
      });
    }

    /* Couleur du produit courant : le choix du haut et celui de chaque formule restent synchronisés, sans boucle. */
    var colorSyncing = false;
    /* Coffrets : la variante est celle qui réunit les couleurs choisies pour chaque article. */
    var xGroups = $$(".pa-colors-x");
    function byOpts() {
      var m = $(".pa-colors input:checked"), t = [m ? m.dataset.title : ""];
      xGroups.forEach(function (g) {
        var c = g.querySelector("input:checked");
        t[+g.dataset.pos] = c ? c.value : "";
      });
      for (var i = 0; i < variants.length; i++) {
        var parts = String(variants[i].title).split(" / ");
        if (parts.length === t.length && parts.every(function (x, j) { return x === t[j]; })) return variants[i];
      }
      return null;
    }
    xGroups.forEach(function (g) {
      all(g, "input").forEach(function (inp) {
        inp.addEventListener("change", function () {
          if (!inp.checked) return;
          var n = g.querySelector(".pa-cname-x");
          if (n) n.textContent = inp.value;
          var m = $(".pa-colors input:checked"), v = byOpts();
          if (v) applyColor(v, m ? m.dataset.title : null);
        });
      });
    });
    $$(".pa-colors input").forEach(function (inp) {
      inp.addEventListener("change", function () {
        if (!inp.checked) return;
        applyColor((xGroups.length && byOpts()) || byId(+inp.value), inp.dataset.title);
        if (!colorSyncing) {
          colorSyncing = true;
          $$(".pa-opt-parts input[data-master]").forEach(function (ci) { ci.checked = ci.value === inp.value; });
          colorSyncing = false;
        }
      });
    });
    $$(".pa-opt-parts input[data-master]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        if (colorSyncing || !inp.checked) return;
        colorSyncing = true;
        var master = root.querySelector('.pa-colors input[value="' + inp.value + '"]');
        if (master && !master.checked) {
          master.checked = true;
          master.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          applyColor(byId(+inp.value), inp.dataset.title);
        }
        $$(".pa-opt-parts input[data-master]").forEach(function (ci) { ci.checked = ci.value === inp.value; });
        colorSyncing = false;
      });
    });

    /* Formule : le vrai coffret Shopify part au panier, une seule ligne au prix du coffret, cadeaux
       compris. Retirer cette ligne retire tout le coffret. Un pochon ou une poignée déjà au panier
       devient le cadeau du coffret : sa ligne payante perd un exemplaire. Coffret introuvable dans la
       table (assets/ocaou-coffrets.json) : les articles partent seuls, sans cadeau. */
    var tableP = null;
    function table() {
      if (!tableP) tableP = D.coffrets ? fetch(D.coffrets).then(function (r) { return r.json(); }).catch(function () { return null; }) : Promise.resolve(null);
      return tableP;
    }
    if (offers.length) table();
    function coffretDe(t, ids) {
      if (!t || !t.coffrets) return null;
      var prod = {};
      t.coffrets.forEach(function (c) {
        Object.keys(c.parVariante || {}).forEach(function (k) {
          c.parVariante[k].forEach(function (x) { prod[x.variante] = x.produit; });
        });
      });
      var pids = ids.map(function (i) { return prod[i]; });
      if (pids.some(function (x) { return !x; })) return null;
      var same = function (a, b) { return a.length === b.length && a.slice().sort().join() === b.slice().sort().join(); };
      for (var i = 0; i < t.coffrets.length; i++) {
        var c = t.coffrets[i];
        var need = c.articles.concat(c.inclus.filter(function (x) { return !x.offert; }).map(function (x) { return x.produit; }));
        if (!same(need, pids)) continue;
        var key = ids.filter(function (v) { return c.articles.indexOf(prod[v]) !== -1; }).sort(function (a, b) { return a - b; }).join("-");
        var combi = c.combinaisons[key];
        if (combi && combi.dispo) return { c: c, combi: combi };
      }
      return null;
    }
    function enCoffret(o, items) {
      return table().then(function (t) {
        var f = coffretDe(t, items.map(function (it) { return it.id; }));
        if (!f) return items;
        var cadeaux = f.c.inclus.filter(function (x) { return x.offert; }).map(function (x) { return x.produit; });
        var base = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
        return fetch(base + "cart.js", { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (cart) {
          var suite = Promise.resolve();
          cadeaux.forEach(function (pid) {
            var l = (cart.items || []).filter(function (it) { return it.product_id === pid; })[0];
            if (!l) return;
            suite = suite.then(function () {
              return fetch(base + "cart/change.js", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: l.key, quantity: l.quantity - 1 })
              });
            });
          });
          return suite;
        }).catch(function () {}).then(function () { return [{ id: f.combi.variante, quantity: 1 }]; });
      });
    }
    function say(msg) { if (status) status.textContent = msg; }
    if (cta) {
      cta.addEventListener("click", function () {
        if (busy || cta.disabled) return;
        var oi = offIdx(), o = offers[oi];
        var items = [{ id: variant.id, quantity: 1 }];
        if (gc && gcOn && gcOn.checked) {
          var mail = gc.querySelector("[data-pa-gc-mail]");
          if (!mail || !mail.value.trim() || !mail.checkValidity()) {
            if (mail) { mail.setAttribute("aria-invalid", "true"); mail.focus(); }
            if (gcEr) gcEr.hidden = false;
            say("Indiquez l'adresse e-mail du destinataire.");
            return;
          }
          mail.removeAttribute("aria-invalid");
          if (gcEr) gcEr.hidden = true;
          var props = { "__shopify_send_gift_card_to_recipient": "true", "Recipient email": mail.value.trim() };
          var nom = gc.querySelector("[data-pa-gc-nom]"), dat = gc.querySelector("[data-pa-gc-date]"), msg = gc.querySelector("[data-pa-gc-msg]");
          if (nom && nom.value.trim()) props["Recipient name"] = nom.value.trim();
          if (dat && dat.value) props["Send on"] = dat.value;
          if (msg && msg.value.trim()) props["Message"] = msg.value.trim();
          props["__shopify_offset"] = String(new Date().getTimezoneOffset());
          items[0].properties = props;
        }
        if (o) o.parts.forEach(function (p, k) { items.push({ id: partVariant(oi, k).id, quantity: 1 }); });
        busy = true;
        cta.disabled = true;
        if (sbarB) sbarB.disabled = true;
        if (ctaL) ctaL.textContent = "Ajout en cours…";
        say("");
        (o ? enCoffret(o, items) : Promise.resolve(items)).then(addToCart).then(function () {
          busy = false;
          say("Ajouté au panier");
          refresh();
        }, function (err) {
          busy = false;
          refresh(true);
          if (ctaL) ctaL.textContent = "Erreur, réessayez";
          say(err && err.message ? err.message : "Erreur, réessayez");
          setTimeout(function () { if (!busy) refresh(); }, 3000);
        });
      });
    }

    /* Barre d'achat (mobile) et carte d'ajout rapide (ordinateur) : visibles une fois le bouton principal
       passé sous la zone collante du thème, masquées devant le pied de page, comme la carte du thème ;
       la croix (ordinateur) la referme jusqu'au rechargement de la page. Positions relues à chaque image
       de défilement : un saut (ancre, position restaurée au rechargement) ne fait jamais croiser l'écran
       au bouton, un observateur d'intersection le raterait. */
    if (cta && sbar) {
      var probe = document.createElement("span");
      probe.className = "pa-probe";
      root.appendChild(probe);
      var top = Math.max(0, Math.round(probe.getBoundingClientRect().top)) || 0;
      probe.remove();
      var ft = document.querySelector(".pa-ft"), shut = false, barOn = false, ticking = false;
      var setBar = function () {
        ticking = false;
        var on = !shut && cta.getBoundingClientRect().bottom <= top + 1 && !(ft && ft.getBoundingClientRect().top < window.innerHeight);
        if (on === barOn) return;
        barOn = on;
        sbar.classList.toggle("is-on", on);
        sbar.toggleAttribute("inert", !on);
        sbar.setAttribute("aria-hidden", String(!on));
      };
      var onMove = function () { if (!ticking) { ticking = true; requestAnimationFrame(setBar); } };
      window.addEventListener("scroll", onMove, { passive: true });
      window.addEventListener("resize", onMove, { passive: true });
      setBar();
      if (sbarB) sbarB.addEventListener("click", function () { cta.click(); });
      /* Pastilles de la carte : elles choisissent la couleur du haut, qui garde seule la logique. */
      sbarSw.forEach(function (b) {
        b.addEventListener("click", function () {
          var m = root.querySelector('.pa-colors input[value="' + b.dataset.v + '"]');
          if (m && !m.checked) { m.checked = true; m.dispatchEvent(new Event("change", { bubbles: true })); }
        });
      });
      var sbarX = $(".pa-sbar-x");
      if (sbarX) sbarX.addEventListener("click", function () {
        shut = true;
        setBar();
        cta.focus({ preventScroll: true });
      });
    }

    refresh();
    animReady = true;
  }

  /* Vidéos du produit : lecture automatique muette, mais seulement quand la carte est à l'écran, et
     arrêt dès qu'elle en sort (rien ne se télécharge avant). Chaque vidéo a son bouton de pause et le
     choix est gardé (RGAA 13.8). Mouvement réduit demandé : aucune lecture automatique. */
  function videos(scope) {
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    all(scope, ".iso-pa [data-pa-vid]").forEach(function (v) {
      if (v.dataset.paBound) return;
      v.dataset.paBound = "1";
      var card = v.closest(".pa-vid-card") || v.parentNode;
      var btn = card.querySelector("[data-pa-vid-btn]");
      var lbl = btn ? btn.querySelector("[data-pa-vid-lbl]") : null;
      var wanted = !reduce, seen = false;
      function paint() {
        if (!btn) return;
        if (wanted) btn.removeAttribute("data-paused"); else btn.setAttribute("data-paused", "");
        if (lbl) lbl.textContent = wanted ? "Mettre la vidéo en pause" : "Lire la vidéo";
      }
      function sync() {
        if (wanted && seen) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        else v.pause();
      }
      if (btn) btn.addEventListener("click", function () {
        wanted = !wanted;
        if (wanted) seen = true;
        paint();
        sync();
      });
      paint();
      if (window.IntersectionObserver) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) { seen = e.isIntersecting; sync(); });
        }, { threshold: 0.35 }).observe(v);
      } else { seen = true; sync(); }
    });
  }

  /* Le navigateur ne telecharge une photo differee qu'au moment ou elle entre dans le cadre : la carte
     suivante d'un carrousel restait blanche le temps qu'elle arrive. Des qu'une section approche de
     l'ecran, ses photos sont demandees, en priorite basse pour ne pas retarder le reste de la page. Les
     photos d'un coloris masque sont laissees de cote : elles sont demandees au changement de coloris. */
  function photosPretes(scope) {
    var zones = all(scope, ".iso-pa");
    if (scope.matches && scope.matches(".iso-pa")) zones.push(scope);
    function servir(zone) {
      if (zone.dataset.paImgs) return;
      zone.dataset.paImgs = "1";
      all(zone, "img[loading='lazy']").forEach(function (im) {
        if (im.closest && im.closest("[hidden]")) return;
        if ("fetchPriority" in im) im.fetchPriority = "low";
        im.loading = "eager";
      });
    }
    zones.forEach(function (zone) {
      if (!window.IntersectionObserver) { servir(zone); return; }
      var obs = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { servir(e.target); obs.unobserve(e.target); }
        });
      }, { rootMargin: "600px" });
      obs.observe(zone);
    });
  }

  function init(scope) {
    all(scope, ".iso-pa[data-pa-product]").forEach(product);
    if (scope.matches && scope.matches(".iso-pa[data-pa-product]")) product(scope);
    carousels(scope);
    photosPretes(scope);
    hotspots(scope);
    related(scope);
    shipDates(scope);
    videos(scope);
  }

  /* Bouton d'une section éditoriale, ou note de la zone d'achat, qui vise une ancre de la page : le
     thème intercepte les clics sur les liens internes, d'où l'écoute en capture et le défilement pris
     en charge ici.
     RGAA : le focus suit le défilement, sinon le clavier resterait au point de départ. */
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest(".iso-pa a.pa-btn[href^='#'], .iso-pa a.pa-rate[href^='#']") : null;
    if (!a) return;
    var cible = document.getElementById(a.getAttribute("href").slice(1));
    /* Fiche qui affiche les avis du site (titre puis cartes) au lieu de la section de la piste :
       la note mène au titre de ce bloc, à défaut aux cartes. */
    if (!cible && a.className.indexOf("pa-rate") !== -1) {
      cible = document.querySelector("[id$='__avis_titre']");
      if (!cible) {
        var liste = document.querySelector(".testimonial-list");
        cible = liste && liste.closest ? liste.closest("[id^='shopify-section-']") : liste;
      }
    }
    if (!cible) return;
    e.preventDefault();
    e.stopPropagation();
    /* Sans animation : le défilement doux est neutralisé par le thème (relevé le 17/09). */
    cible.scrollIntoView({ block: "start" });
    cible.setAttribute("tabindex", "-1");
    cible.focus({ preventScroll: true });
  }, true);

  init(document);
  /* Éditeur de thème : une section rechargée repart de zéro. */
  document.addEventListener("shopify:section:load", function (e) { init(e.target); });
})();


