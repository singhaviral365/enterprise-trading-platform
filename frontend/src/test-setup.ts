// Global test setup (angular.json -> test -> setupFiles). Runs before every spec file.

// jsdom does not implement the modal methods of <dialog>.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

// A session one spec leaves in localStorage would make the next spec's stores fire account lookups
// it never answers, which keeps fixtures from becoming stable.
beforeEach(() => {
  localStorage.clear();
});
