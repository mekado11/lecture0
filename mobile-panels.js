// Mobile panel behavior — additive, does not conflict with app.js
(function () {
  var MOBILE = 700;

  function isMobile() { return window.innerWidth <= MOBILE; }

  function addPanelToggles() {
    if (!isMobile()) return;
    var panels = document.querySelectorAll('.left-panel, .right-panel');
    panels.forEach(function (panel) {
      // The real header classes are .lp-head / .rp-head (the old selectors
      // .lp-header/.rp-header matched nothing, so collapse never worked)
      var header = panel.querySelector('.lp-head, .rp-head');
      if (!header || header.dataset.mobileToggle) return;
      header.dataset.mobileToggle = '1';
      header.style.cursor = 'pointer';
      panel.classList.add('mob-collapsed');
      header.addEventListener('click', function () {
        panel.classList.toggle('mob-collapsed');
      });
    });
  }

  // Inject collapse style once — hide everything in the panel except its header
  // (there are no .lp-body/.rp-body wrappers in the markup)
  var style = document.createElement('style');
  style.textContent =
    '@media(max-width:700px){' +
    '.left-panel.mob-collapsed > :not(.lp-head){display:none}' +
    '.right-panel.mob-collapsed > :not(.rp-head){display:none}' +
    '}';
  document.head.appendChild(style);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addPanelToggles);
  } else {
    addPanelToggles();
  }
  // Panels render after analysis, not at DOMContentLoaded — retry when entering the editor
  window.addEventListener('resize', addPanelToggles);
  document.addEventListener('click', function () { addPanelToggles(); }, true);
}());
