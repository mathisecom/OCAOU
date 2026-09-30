/**
 * Suggestions complémentaires panier O'CAOU
 * Utilise la Recommendations API Shopify (app Search & Discovery)
 * Section de rendu serveur : sections/iso-cart-suggestions.liquid
 *
 * Sécurité innerHTML : HTML injecté provenant uniquement de
 * /recommendations/products (même origin, rendu par Liquid Shopify côté serveur).
 * Pas d'entrée utilisateur dans ce flux.
 *
 * Protection double-chargement : IIFE avec guard customElements.
 */
(() => {
  if (customElements.get('iso-cart-suggestions')) return;

  const SECTION = 'iso-cart-suggestions';

  class IsoCartSuggestions extends HTMLElement {
    connectedCallback () {
      this._ctrl = new AbortController();
      if (window.requestIdleCallback) {
        requestIdleCallback(() => this._init(), { timeout: 2000 });
      } else {
        setTimeout(() => this._init(), 200);
      }
    }

    disconnectedCallback () {
      this._ctrl?.abort();
    }

    async _init () {
      try {
        const items = await this._getCart();
        if (!items.length) { this.hidden = true; return; }

        const inCart = new Set(items.map(i => i.product_id));
        const ids    = items.slice(0, 3).map(i => i.product_id);

        let cards = await this._fetchCards(ids, inCart, 'complementary');
        if (!cards.length) {
          cards = await this._fetchCards([ids[0]], inCart, 'related');
        }

        if (!cards.length) { this.hidden = true; return; }
        this._render(cards);
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('[iso-cart]', e);
        this.hidden = true;
      }
    }

    async _getCart () {
      const r = await fetch('/cart.js', { signal: this._ctrl.signal });
      return (await r.json()).items || [];
    }

    /**
     * Interroge la Recommendations API pour chaque productId.
     * HTML retourné = même origin, rendu Liquid Shopify côté serveur.
     */
    async _fetchCards (ids, inCart, intent) {
      const seen = new Set();
      const out  = [];

      await Promise.all(ids.map(async (pid) => {
        try {
          const url = `/recommendations/products?product_id=${pid}&limit=6&intent=${intent}&section_id=${SECTION}`;
          const r = await fetch(url, { signal: this._ctrl.signal });
          if (!r.ok) return;
          const html = await r.text();

          const tmp = document.createElement('div');
          tmp.innerHTML = html; /* safe: same-origin server-rendered Liquid */

          tmp.querySelectorAll('[data-product-id]').forEach(card => {
            const id = parseInt(card.dataset.productId, 10);
            if (!inCart.has(id) && !seen.has(id)) {
              seen.add(id);
              out.push(card.outerHTML);
            }
          });
        } catch (e) {
          if (e.name !== 'AbortError') console.warn('[iso-cart]', pid, e);
        }
      }));

      return out;
    }

    _render (cards) {
      const track = this.querySelector('.iso-cart-suggestions__track');
      if (!track) return;
      track.innerHTML = cards.join(''); /* safe: same-origin server-rendered */
      this._uniqueIds(track);
      this._bindSwatches(track);
      this.hidden = false;
      this.removeAttribute('aria-busy');
      this._nav(track);
    }

    /* Volet et page panier affichent les mêmes cartes : préfixer les id pour que chaque pastille pointe sur son propre bouton radio */
    _uniqueIds (track) {
      this._uid = this._uid || 'ic' + Math.random().toString(36).slice(2, 7);
      track.querySelectorAll('input[id]').forEach(input => {
        const label = track.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        input.id = `${this._uid}-${input.id}`;
        if (input.name.startsWith('swatch-')) input.name = `${this._uid}-${input.name}`;
        if (label) label.htmlFor = input.id;
      });
    }

    /* Choix d'une couleur : variante envoyée au panier, photo de la carte, bouton inactif si épuisée */
    _bindSwatches (track) {
      if (this._swatchBound) return;
      this._swatchBound = true;
      track.addEventListener('change', (e) => {
        const input = e.target;
        if (!input.matches('input[data-variant-id]')) return;
        const card = input.closest('.iso-cart-suggestions__card');
        const idField = card?.querySelector('form input[name="id"]');
        const button = card?.querySelector('form [type="submit"]');
        if (!idField) return;
        idField.value = input.dataset.variantId;
        const label = card.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        card.querySelectorAll('.color-swatch.is-selected').forEach(l => l.classList.remove('is-selected'));
        label?.classList.add('is-selected');
        if (button) button.disabled = !!label?.classList.contains('is-disabled');
        const img = card.querySelector('.iso-cart-suggestions__media img');
        if (img && input.dataset.variantMedia) {
          try {
            const src = JSON.parse(input.dataset.variantMedia)?.preview_image?.src;
            if (src) {
              const u = new URL(src, location.href);
              u.searchParams.set('width', '256');
              img.removeAttribute('srcset');
              img.removeAttribute('sizes');
              img.src = u.toString();
            }
          } catch (_) { /* photo inchangée */ }
        }
      });
    }

    _nav (track) {
      const nav  = this.querySelector('.iso-cart-suggestions__nav');
      const prev = this.querySelector('.iso-cart-suggestions__prev');
      const next = this.querySelector('.iso-cart-suggestions__next');
      if (!nav) return;

      const step = (dir) => {
        const c = track.querySelector('.iso-cart-suggestions__card');
        if (c) track.scrollBy({ left: dir * (c.offsetWidth + 12), behavior: 'smooth' });
      };
      /* Flèches affichées seulement quand les cartes dépassent la largeur disponible */
      const upd = () => {
        const overflow = track.scrollWidth > track.clientWidth + 2;
        nav.hidden = !overflow;
        if (!overflow) return;
        if (prev) prev.disabled = track.scrollLeft <= 2;
        if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
      };

      /* Écouteurs posés une seule fois : la liste est rechargée à chaque changement du panier */
      if (!this._navBound) {
        this._navBound = true;
        prev?.addEventListener('click', () => step(-1));
        next?.addEventListener('click', () => step(1));
        track.addEventListener('scroll', upd, { passive: true });
        if ('ResizeObserver' in window) new ResizeObserver(upd).observe(track);
      }
      upd();
    }
  }

  customElements.define('iso-cart-suggestions', IsoCartSuggestions);
})();
