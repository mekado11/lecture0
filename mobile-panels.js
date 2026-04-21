// Mobile panel behavior — additive, does not conflict with app.js
(function () {
  var MOBILE = 700;

  function isMobile() { return window.innerWidth <= MOBILE; }

  function addPanelToggles() {
    if (!isMobile()) return;
    var panels = document.querySelectorAll('.left-panel, .right-panel');
    panels.forEach(function (panel) {
      var header = panel.querySelector('.lp-header, .rp-header, h3, h4');
      if (!header || header.dataset.mobileToggle) return;
      header.dataset.mobileToggle = '1';
      header.style.cursor = 'pointer';
      panel.classList.add('mob-collapsed');
      header.addEventListener('click', function () {
        panel.classList.toggle('mob-collapsed');
      });
    });
  }

  // Inject collapse style once
  var style = document.createElement('style');
  style.textContent =
    '@media(max-width:700px){.mob-collapsed .lp-body,.mob-collapsed .rp-body{display:none}}';
  document.head.appendChild(style);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addPanelToggles);
  } else {
    addPanelToggles();
  }
}());
