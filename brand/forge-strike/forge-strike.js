/* <forge-strike> — the Forge mark assembling, for any page, no framework.

     <link rel="stylesheet" href="forge-strike.css">
     <script type="module" src="forge-strike.js"></script>

     <forge-strike></forge-strike>                              entrance, plays once
     <forge-strike mode="loop" label="Loading"></forge-strike>   loading screen
     <forge-strike mode="cycle" size="160" wordmark="below"></forge-strike>

   Attributes: mode (once | loop | cycle), size (px number or CSS length),
   wordmark (none | below | right), label (what a screen reader hears).
   Call element.replay() to play it again. Changing an attribute redraws it. */

const TRACE = 'translate(-289,-339) translate(0,1254) scale(0.1,-0.1)';

const FACETS = [
  ['base', 'M5770 5109c-256-26-564-152-770-315-133-107-832-804-1165-1164-59-63-135-144-169-180-64-66-233-277-254-317-7-12-12-27-12-33l0-10 818 2 817 3 59 30c33 16 92 60 132 97l72 68 145 208c494 708 654 939 881 1272 184 270 194 283 261 315 30 15 55 28 55 30 0 5-810-1-870-6z'],
  ['wedge', 'M3052 6408c-19-19-14-53 9-74 42-37 434-479 522-588 56-69 67-88 98-176l24-65 5-675 5-675 10 1c14 1 397 521 964 1309 476 661 641 897 641 915 0 9-5 21-12 28l-12 12-1121 0-1121 0-12-12z'],
  ['arm2', 'M6250 6746c-26-6-63-22-83-35l-37-22-135-177c-74-97-180-235-235-307-55-71-269-353-476-625-207-272-407-533-444-580-37-47-188-245-336-440-148-195-291-385-319-421-27-36-122-160-209-275-88-115-195-254-239-309-110-137-113-144-21-45 153 165 815 847 951 981 195 191 355 331 449 391 125 80 331 163 507 205l112 26 825 6 825 6 65 23c36 13 97 42 135 64l70 41 96 96 95 96 66 105c35 58 176 283 313 500 384 613 405 647 405 667 0 10-5 24-12 31l-12 12-1155-1-1156 0-45-13z'],
  ['arm1', 'M4599 8986c-101-29-204-92-281-170l-63-64-125-193c-323-504-502-780-725-1119-82-124-195-296-252-382-56-87-103-166-103-177 0-11 7-27 16-35l15-16 1063 0 1064 0 33 14c40 17 80 57 104 105 30 59 114 168 162 211 52 46 140 90 229 117l59 18 1505 5 1505 5 63 26c149 63 266 163 365 313 371 558 829 1273 835 1303l4 21-21 21-21 21-2677-1-2678 0-76-23z'],
];

const MARK = `<span class="fs-tile" aria-hidden="true">`
  + `<svg class="fs-shadow" viewBox="0 0 732 620"><g transform="${TRACE}">${FACETS.map(([, d]) => `<path d="${d}"/>`).join('')}</g></svg>`
  + `<svg viewBox="0 0 732 620">${FACETS.map(([part, d]) => `<g class="fs-${part}"><g transform="${TRACE}"><path d="${d}"/></g></g>`).join('')}</svg>`
  + `<i class="fs-glint"></i></span>`
  + `<span class="fs-word" aria-hidden="true"><span>F</span><span>O</span><span>R</span><span>G</span><span>E</span></span>`;

class ForgeStrikeElement extends HTMLElement {
  static observedAttributes = ['mode', 'size', 'wordmark', 'label'];

  connectedCallback() { this.render(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }

  /* Rebuilding the markup restarts every animation from the top. */
  replay() { this.render(); }

  render() {
    const mode = ['loop', 'cycle'].includes(this.getAttribute('mode')) ? this.getAttribute('mode') : 'once';
    const size = this.getAttribute('size') ?? '96';
    const loading = mode !== 'once';
    const label = this.getAttribute('label') ?? (loading ? 'Loading' : 'Forge');

    const root = document.createElement('div');
    root.className = 'fs';
    root.dataset.mode = mode;
    root.dataset.wordmark = this.getAttribute('wordmark') ?? 'none';
    root.style.setProperty('--fs-size', /^\d+(\.\d+)?$/.test(size) ? `${size}px` : size);
    root.innerHTML = MARK;
    if (loading) {
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      const text = document.createElement('span');
      text.className = 'fs-label';
      text.textContent = label;
      root.append(text);
    } else {
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', label);
    }
    this.replaceChildren(root);
  }
}

if (!customElements.get('forge-strike')) customElements.define('forge-strike', ForgeStrikeElement);

export { ForgeStrikeElement };
