# Sacred Mandala — 3D Experience

A ground-up redesign of [sacred-mandala.com](https://www.sacred-mandala.com) as a fully
WebGL-animated site. Same brand, same photography, same typefaces — rebuilt as one
continuous 3D world you fly through as you scroll.

## Run it locally

```bash
cd sacred-mandala
python -m http.server 5173
# → http://127.0.0.1:5173
```

On Windows you can also double-click `start.cmd`.
(Do not open `index.html` directly from disk — ES modules and textures need a server.)

## What carried over from the original site

| Element | Kept |
| --- | --- |
| Photography | All 21 originals: hero aerial, 7 rooms, 6 spaces, day phases, features |
| Typefaces | Cormorant Garamond (display) + Montserrat (labels/body), self-hosted woff2 |
| Palette | Forest `#1E2A22` · ivory `#F7F3ED` · cream `#F1ECE3` · brass `#B08D57` |
| Logo | The original 6-circle mandala mark, inlined as SVG |
| Voice | All copy, room names, daily rhythm, stats (16 guests / 7 rooms / 7+ years) |
| Contact | WhatsApp +62 821 4534 1911, @sacredmandalahotel |

## What is new

* **One 3D scene, one camera.** A single Three.js world holds every chapter; scroll
  drives a camera path from the aerial hero, through the mandala, into the sanctuary,
  around the rooms and out to the closing mandala.
* **The mandala as geometry.** Four concentric rings, nine petals and eighteen beads
  built from real line geometry in 3D — it breathes, turns and parallaxes with the pointer.
* **Photography as objects.** Images are shader planes (rounded corners, gold hairline,
  fog, filmic grade) floating in depth, not flat `<img>` tags.
* **Atmospheric film backdrop.** The original aerial is mapped onto a camera-locked
  plane with a crossfade, drifting grain and vignette for continuous depth.
* **Room carousel.** Seven rooms orbit the camera; scroll or drag turns the ring and the
  room name/description sync to whichever frame is facing you.
* **Interactive space list.** Seven spaces — Yoga Shala, Pool, Sauna, Ice Bath, Massage,
  River, Jungle — hover a row and its frame in the 3D mosaic scales and lights.
* **Room focus.** The carousel fades every frame that is edge-on, so only the room facing
  you holds the light, and the name/description track it.
* **Custom loader, menu, scroll rail, grain, magnetic reveals.**

## Structure

```
index.html            markup + copy
css/style.css         all styling, typography, responsive rules
js/world.js           the Three.js world (scene, shaders, camera path, stages)
js/app.js             loader, scroll, menu, carousel sync, interactions
js/three.module.min.js
img/                  original photography (optimised)
fonts/                cormorant.woff2, montserrat.woff2
favicon.svg
_research/            scraped source (original.html, site.css, logo.svg) — reference only
```

## A-Eweb alignment pass

Built and checked against the team's `a-eweb` skill:

- **No small headings above section titles.** Every eyebrow ("01 — The Sanctuary", "02 — The Space",
  "Ubod, Bali" labels) removed site-wide; headings now lead each chapter.
- **No number labels.** The 01–07 space numbers and the "01 / 06" scroll counter are gone.
- **One gutter, one measure.** Side margin is 56px max (`--pad: clamp(16px, 4vw, 56px)`); every
  text column starts on the same left edge with a 520px measure.
- **Header and footer at the same size** (16px), sentence case, no letter-spaced uppercase menus.
- **Menu clicks land exactly one section** under the header; logo returns to the hero.
- **Last section + footer fit one screen** at the bottom.
- **No fixed overlays** (grain moved into the shader), no loader left over the page.
- Timeline reads title → time → line (no label sitting above a heading); middot lists became sentences.

QA gate: `node <a-eweb>/scripts/check-site.mjs http://127.0.0.1:5173 --profile a-eweb.profile.json`
— 0 FAIL at 1440×900, 1280×720 and 390×844. Report and screenshots live in `qa/`.

## Notes

* Performance: ~60fps at 1440×900, DPR capped at 2, ~900 motes, 20 texture planes.
* Mobile: the same world runs on a second camera path — clusters scale to 0.30 and centre
  so the photography reads as depth behind the type instead of falling outside the frame.
* `prefers-reduced-motion` is respected for text reveals and particles.
* Tuning knobs live at the top of `world.js` (camera keyframes, stage placement) and in
  `:root` of `style.css` (palette, type scale).
