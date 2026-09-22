// Features page motion: reveal sections as they arrive, draw the curve once it is seen, let the
// product frame breathe and tilt under the pointer, and let each card's glow follow the mouse.
// Everything here is decorative; the page reads the same with scripting off or reduced motion.
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveals = [...document.querySelectorAll('.fx-reveal')];
  if (reduce || !('IntersectionObserver' in window)) reveals.forEach(el => el.classList.add('is-in'));
  else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });
    reveals.forEach((el, i) => { el.style.transitionDelay = (i % 3) * 90 + 'ms'; io.observe(el); });
  }
  if (reduce) return;

  // The frame tilts a few degrees toward the pointer and settles back when it leaves.
  const frame = document.getElementById('fx-frame');
  const win = frame && frame.querySelector('.fx-window');
  if (win && matchMedia('(hover: hover)').matches) {
    let raf = 0, rx = 0, ry = 0;
    const paint = () => { raf = 0; win.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) scale(1.01)'; };
    frame.addEventListener('pointermove', e => {
      const r = win.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      rx = -py * 5; ry = px * 6;
      if (!raf) raf = requestAnimationFrame(paint);
    });
    frame.addEventListener('pointerleave', () => { if (raf) cancelAnimationFrame(raf); raf = 0; win.style.transform = ''; });
  }

  // Each card's warm glow follows the pointer.
  document.querySelectorAll('.fx-card').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  });
})();
