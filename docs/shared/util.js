/* Shared DOM, storage and formatting helpers used by the Rocket Crown pages. */
const RCUtil = {
  byId(id) {
    return document.getElementById(id);
  },

  setText(id, text) {
    const element = RCUtil.byId(id);
    if (element) element.textContent = text;
    return element;
  },

  on(id, eventName, handler) {
    const element = RCUtil.byId(id);
    if (element) element.addEventListener(eventName, handler);
    return element;
  },

  onSubmit(id, handler) {
    return RCUtil.on(id, 'submit', (event) => {
      event.preventDefault();
      handler(event);
    });
  },

  formValues(id) {
    const form = RCUtil.byId(id);
    return form ? Object.fromEntries(new FormData(form).entries()) : {};
  },

  renderInto(id, markup) {
    const container = RCUtil.byId(id);
    if (container) container.innerHTML = markup;
    return container;
  },

  renderList(id, items, template, emptyMarkup = '') {
    const container = RCUtil.byId(id);
    if (!container) return null;
    container.innerHTML = items.length ? items.map(template).join('') : emptyMarkup;
    return container;
  },

  bindEach(container, selector, eventName, handler) {
    if (!container) return;
    container.querySelectorAll(selector).forEach((element) => {
      element.addEventListener(eventName, () => handler(element));
    });
  },

  readJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (error) {
      console.warn('State restore failed', error);
      return null;
    }
  },

  writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  formatMoney(value) {
    return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  createId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  },

  randomInt(min, max) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return min + (array[0] % (max - min + 1));
  },

  pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
  },

  showToast(message) {
    const notice = document.createElement('div');
    notice.className = 'toast';
    notice.textContent = message;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 2600);
  },

  showPage(pageIds, activeId) {
    pageIds.forEach((id) => {
      const page = RCUtil.byId(id);
      if (page) page.style.display = id === activeId ? 'block' : 'none';
    });
  }
};
