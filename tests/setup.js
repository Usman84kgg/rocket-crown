// jsdom does not implement innerText; the shipped scripts rely on it for text
// matching, so map it onto textContent for the tests.
if (!Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'innerText')) {
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return this.textContent;
    },
    set(value) {
      this.textContent = value;
    }
  });
}
