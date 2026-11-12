import { World } from './world.js';

const ROOMS = [
  { name: 'Lakshmi', desc: 'A hand-built room named for the goddess of abundance and prosperity.' },
  { name: 'Sarasvati', desc: 'Named for the goddess of wisdom and creativity.' },
  { name: 'Shiva', desc: 'Named for the god of transformation.' },
  { name: 'Parvati', desc: 'Named for the goddess of love and devotion.' },
  { name: 'Ganesha', desc: 'Named for the remover of obstacles.' },
  { name: 'Vishnu', desc: 'Named for the preserver of the universe.' },
  { name: 'Buddha House', desc: 'The main villa on the left cliff, named for the awakened one.' }
];

const PRELOAD = [
  'img/poster.jpg', 'img/space-pool.jpg', 'img/yoga.jpg', 'img/yoga-class.jpg',
  'img/breakfast-spread.jpg', 'img/space-sauna.jpg', 'img/space-ice-bath.jpg',
  'img/space-massage.jpg', 'img/space-river.jpg', 'img/space-jungle.jpg',
  'img/lakshmi-room.jpg', 'img/saraswati-room.jpg', 'img/shiva-room.jpg',
  'img/parvati-room.jpg', 'img/ganesha-room.jpg', 'img/vishnu-room.jpg',
  'img/buddha-house.jpg', 'img/morning.jpg', 'img/daytime.jpg',
  'img/evening.jpg', 'img/night.jpg'
];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

const bar = $('#loaderBar');
const pct = $('#loaderPct');
let loaded = 0;

function bump() {
  loaded++;
  const p = Math.round((loaded / (PRELOAD.length + 1)) * 100);
  if (bar) bar.style.width = p + '%';
  if (pct) pct.textContent = p;
}

function preload() {
  return Promise.all(PRELOAD.map((src) => new Promise((res) => {
    const im = new Image();
    im.onload = im.onerror = () => { bump(); res(); };
    im.src = src;
  })));
}

let world = null;

function startWorld() {
  const canvas = $('#scene');
  if (!canvas) return;
  try {
    world = new World(canvas);
  } catch (e) {
    console.warn('3D unavailable', e);
    return;
  }
  const sections = $$('[data-sec]');
  world.setStops(sections.map((el) => ({
    top: el.offsetTop / window.innerHeight,
    height: el.offsetHeight / window.innerHeight
  })));
  window.__world = world;
  world.start(() => window.scrollY);
  tick();
}

async function boot() {
  const started = performance.now();
  await preload();
  try { await document.fonts.ready; } catch (e) { /* noop */ }
  bump();
  const wait = Math.max(0, 1200 - (performance.now() - started));
  await new Promise((r) => setTimeout(r, wait));
  const loader = $('#loader');
  if (loader) loader.remove();
  document.body.classList.remove('is-loading');
  document.body.classList.add('ready');
  startWorld();
}

const railFill = $('#railFill');
const railNow = $('#railNow');
const head = $('.site-head');
let lastScroll = 0;

function onScroll() {
  const y = window.scrollY;
  const doc0 = document.documentElement;
  doc0.style.setProperty('--sy', String(y));
  doc0.style.setProperty('--sp', String(Math.min(1, y / 760)));
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const p = clamp(y / Math.max(1, max));
  if (railFill) railFill.style.height = (p * 100).toFixed(1) + '%';
  const secs = $$('[data-sec]');
  let idx = 0;
  secs.forEach((s, i) => { if (y + window.innerHeight * 0.45 >= s.offsetTop) idx = i; });
  if (railNow) railNow.textContent = String(Math.min(idx + 1, 6)).padStart(2, '0');
  // safety net: anything inside the viewport is revealed even if the observer missed it
  $$('.reveal:not(.in)').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight - 40 && r.bottom > 0) el.classList.add('in');
  });

  if (head) {
    head.classList.toggle('solid', y > 40);
    if (y > lastScroll + 8 && y > 320) head.classList.add('hide');
    else if (y < lastScroll - 8 || y <= 320) head.classList.remove('hide');
  }
  lastScroll = y;
}

let shownRoom = -1;
function tick() {
  if (world && world.roomIndex !== shownRoom) {
    shownRoom = world.roomIndex;
    const r = ROOMS[shownRoom];
    const nameEl = $('#roomName');
    const descEl = $('#roomDesc');
    if (r && nameEl) {
      nameEl.textContent = r.name;
      descEl.textContent = r.desc;
      nameEl.style.opacity = '1';
      descEl.style.opacity = '1';
      nameEl.animate([{ transform: 'translateY(8px)' }, { transform: 'none' }],
        { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' });
      $$('#roomDots button').forEach((b, i) => b.classList.toggle('on', i === shownRoom));
    }
  }
  requestAnimationFrame(tick);
}

function reveals() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach((el) => io.observe(el));
}

function menu() {
  const burger = $('#burger');
  const panel = $('#menu');
  if (!burger || !panel) return;
  const set = (open) => {
    panel.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    $$('.menu__col a', panel).forEach((a, i) => {
      a.style.transitionDelay = open ? (0.12 + i * 0.06) + 's' : '0s';
    });
  };
  burger.addEventListener('click', () => set(!panel.classList.contains('open')));
  $$('[data-menu]', panel).forEach((a) => a.addEventListener('click', () => set(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}

function spaces() {
  $$('#spaces li').forEach((li) => {
    const i = Number(li.dataset.idx);
    li.addEventListener('pointerenter', () => { if (world) world.highlight(i); });
    li.addEventListener('pointerleave', () => { if (world) world.highlight(-1); });
  });
}

function dots() {
  const wrap = $('#roomDots');
  const stay = $('#stay');
  if (!wrap || !stay) return;
  ROOMS.forEach((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', r.name);
    b.addEventListener('click', () => {
      const target = stay.offsetTop + (stay.offsetHeight * (i + 0.5)) / ROOMS.length;
      window.scrollTo({ top: target, behavior: 'smooth' });
    });
    wrap.appendChild(b);
  });
  if (wrap.firstChild) wrap.firstChild.classList.add('on');
}

function drag() {
  let down = false, lastX = 0;
  window.addEventListener('pointerdown', (e) => { down = true; lastX = e.clientX; });
  window.addEventListener('pointerup', () => { down = false; });
  window.addEventListener('pointermove', (e) => {
    if (world) {
      world.onPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    }
    if (!down || !world) return;
    const stay = $('#stay');
    const centre = window.scrollY + window.innerHeight * 0.5;
    const inStay = stay && centre > stay.offsetTop && centre < stay.offsetTop + stay.offsetHeight;
    if (inStay) world.onDrag(e.clientX - lastX);
    lastX = e.clientX;
  });
}

function anchors() {
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const el = $(id);
      if (!el) return;
      e.preventDefault();
      const top = id === '#top' || id === '#hero' ? 0 : el.offsetTop;
      window.scrollTo({ top, behavior: 'auto' });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const y = $('#year');
  if (y) y.textContent = new Date().getFullYear();
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  reveals();
  menu();
  spaces();
  dots();
  drag();
  anchors();
  boot();
});

window.addEventListener('resize', () => {
  if (!world) return;
  const sections = $$('[data-sec]');
  world.setStops(sections.map((el) => ({
    top: el.offsetTop / window.innerHeight,
    height: el.offsetHeight / window.innerHeight
  })));
});
