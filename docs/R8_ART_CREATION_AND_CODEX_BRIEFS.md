# R8 Ready-to-send art briefs & Codex integration order

Date: 2026-10-23 JST  
Status: **PROPOSALS READY / NO NEW R8 ASSETS GENERATED / R8 HUMAN LOOK REVIEW PENDING**  
Read [R8 Art Production Master](R8_ART_PRODUCTION_MASTER.md) first. This document is a *commission and engineering packet*, **not** an order to generate all art at once.

## 1. Shared design brief (apply to every illustration)

**Goal:** A small, streamer-friendly original 2D baseball home-run game that actually looks like baseball, with a Tokyo-Dome-inspired unbranded indoor ballpark. A readable, moderately stylized 2.5D game-production look — cleaner and more unified than the previous isolated AI pictures. Preserve familiar baseball perspective and clear contact, flight and HR staging. Ignore original Pooh game imagery/code and any copyrighted sports/streamer logos.

Use one consistent visual bible: relatively clean silhouette, moderate outlines, directional arena lighting from upper left, deep navy shadows, warm clay, green field, controlled stadium glow, restrained cel-shaded character treatment. The background may be more painterly but must share lighting and perspective with the characters. Do not produce text/logos/scoreboards with gibberish letters inside the images; programmatic game text is added later.

**Absolute production rule:** Generate a **composite reference FIRST**, receive Human look approval, then extract separate *layered, replaceable components*. Do not spend time generating three rival pitchers or complete UI art before the composite has passed.

## 2. GPT Image-ready prompts (copy and adapt only the intended input fields)

### PROMPT A — Four-shot art direction key visual

```text
Create an original game-art styleboard for a short 2D/2.5D baseball batting video game. Four separate frames in one coherent contact sheet, labelled outside the art area as 1 BATTER VIEW, 2 CONTACT, 3 BALL FLIGHT, 4 HOME RUN. All four depict the SAME original unbranded indoor dome baseball stadium inspired by Tokyo Dome, with the SAME coherent cel-shaded characters, lens/camera placement and lighting. Moderately stylized Japanese sports game look, not photorealistic, not chibi, not a generic mobile infographic.

Frame 1: behind home plate, left-handed batter on SCREEN RIGHT in the batting box, distant pitcher on the central mound, baseball-sized ball between pitcher and batter.
Frame 2: ball meets the sweet spot of the bat; readable impact and correct human body mechanics.
Frame 3: elevated outfield tracking view showing the whole field's geometrical depth, fence, bases, stands and moving-ball implied trajectory.
Frame 4: a home run ball visibly BEYOND the outfield wall with a clear celebratory composition (leave an empty clean area for programmable text); the field still reads as the SAME stadium.

Palette: navy, cream, emerald field grass, warm clay, stadium lights, gold used sparingly for HR. Clean linework, sophisticated lighting, believable baseball spacing. No logos, brand names, recognizable real people, Winnie-the-Pooh characters, text embedded in the imagery, watermarks, copyrighted photos or copied game screenshots.
Important: this is one consistent master LOOK reference, not four finished sprite sheets.
```

**Acceptance:** same baseball stadium and characters in all views; centerline, player scale, field depth, and colors consistent. If this is unconvincing, stop; do not commission final sheets.

### PROMPT B — Main playing-stadium background

```text
Produce ONLY the environment for the accepted R8 baseball game style: a Tokyo-Dome-inspired but original unbranded indoor baseball field from a batter's viewpoint, horizontally framed EXACTLY 8:5 like a 960x600 game camera (a 1920x1200 master is fine). View directly toward the pitcher's mound and center field, home plate and chalk batter boxes near the bottom, mound center near game-coordinate x480/y345, ball will release near x480/y292 and reach the bat near y456. Include plausible dome roof, broad seating, dark scoreboard (blank), outfield wall, natural dirt/grass, arena light direction from upper-left.

NO characters, baseballs, bat, UI, typography, brand ads, field numbers or visible watermarks. Keep the bottom/home-plate area open and readable; avoid elements that may obscure an approaching white baseball. Output high-resolution raster source suitable for layering and light parallax.
```

**Postprocessing:** separate sky/roof, stands/outfield, field/infield and optional home-plate foreground masks (opaque source + transparent RGBA overlays), all aligned to the same 960×600 reference; painter must not move the mound when extracting layers.

### PROMPT C — Overhead flyover map / flight field

```text
Draw the same original indoor dome baseball stadium as an extended 2.5D overhead flyover map, not a top-down flat board and not a close-up batter camera. Long vertical image proportion 11:12; intended display 2200x2400. Home plate at x1100/y2182; pitcher's mound near x1100/y1818; outfield center wall near x1100/y385, curving toward approx x0/y590 and x2200/y590 at the edges. Stadium stands, warning track and fence remain visible beyond the ball's landing area. Include base paths, grass mowing stripes, concourse/seat layers, floodlights and realistic perspective depth. Smooth spatial landmarks to scroll under a flying baseball for several seconds. The full map must retain these coordinates; don't put non-field decoration in the fair-territory landing zone.

No ball, people, text, trademarks or existing game logos. Original 2D/2.5D game production illustration with coherent lighting matching the approved batter-camera background.
```

**Critical geometry gate:** Final art can improve fence style, but the drawn wall must still match the R6 shared-distance projection; if pixels move, modify/tests first in one reviewed change. This is NOT a place to arbitrarily change HR logic.

### PROMPT D — Left-handed batter, master design and separation

```text
One generic original Japanese baseball batter in the approved R8 2.5D game art style, looking toward the pitcher and poised in a LEFT-HANDED batting stance suitable for placement on SCREEN RIGHT of a game rendered toward center field. Athletic baseball body mechanics, believable glove/helmet/belt/cleats, consistent uniform and full feet visible. White/cream jersey with navy trim, no team insignia, no recognizable face, no writing or brands. Cel-shaded cutout on true transparent background, complete arms and hands; visually strong, readable silhouette at approximately 194px wide x270px tall in a 960x600 game.

Do NOT permanently bake an incompatible detached wooden bat over the hands if avoidable: the engine should animate a separate bat anchored to the hands and align its sweet spot with the same cursor/hit center. Leave sufficient image margin for limb articulation. Intended result is a *single approved character design*, followed by consistent animation keyframe preparation in an editing pass; do not generate eight inconsistent persons independently.
```

**Animation production:** keep shared helmet/face/jersey design, separated upper/lower limbs + hands and bat layers where possible; manually pose 8 logical keys (idle, load, stride, swing-start, contact, follow-through, recover, idle), export transparent 480×640 cells in one 3840×640 PNG horizontal strip, stable feet/torso reference. If using a separately animated bat, Codex must update the renderer; current runtime expects `batter_frames` and currently illustrates a basic procedural swing trail.

### PROMPT E — Generic pitcher master design

```text
One original adult baseball pitcher in a generic white-and-navy uniform matching the approved batter and indoor dome, viewed from the batter's camera in front/three-quarter perspective. He will appear small (about 94px wide x126px tall) centered on the mound in a 960x600 scene, so choose a simple high-contrast silhouette, cap, one visible glove and anatomically plausible release-arm action. True transparent background, full body and both cleats visible, no text, team logo, celebrity likeness or copyrighted uniforms. Style and light source must match the approved batter.
```

**Animation production:** same eight time-ordered poses as existing `pitcherFrameAt`, use identical 480×640 frame cells, stable ground contact and plausible visible ball release hand aligned near scene x480/y292.

### PROMPT F — Ball, impact, HR and HUD

```text
Create an original modular 2D video-game FX/GUI asset proposal in the same approved baseball art style, on clean transparent backgrounds and separated objects: (1) small readable white baseball with red stitches, usable at 15–36px; (2) faint swing/contact flash that leaves the ball visible; (3) low grass/dirt landing dust; (4) high-power HR gold ring and short confetti/spark burst, ONLY shown after clearing the outfield fence; (5) three ball icons: unspent WHITE, home run RED, failure GREY; (6) dark translucent navy baseball score strip with very clear empty number slots. No baked-in statistics, gibberish text, logos or watermark. Functional readability at a 960x600 display takes precedence over intricate detail.
```

**R8 final art should have no text baked into its background/score panels.** Game and result values come from code, not AI letters.

## 3. File deliverables and handoff format

Suggested output names under **ignored** local `public/assets/r8/` (names are not live engine paths until Codex connects them):

```
r8-look-contact-sheet.jpg        # reference only; not runtime
stadium-close-base.png            # 960x600 reference / optional 2x
stadium-close-foreground.png      # same canvas, transparent
stadium-flyover.png               # 2200x2400; verify R6 fence projection
batter-master.png                 # original transparent master
batter-frames.png                 # exactly 3840x640 / 8 x 480x640
pitcher-master.png
pitcher-frames.png                # exactly 3840x640 / 8 x 480x640
bat.png                           # isolated, pivot metadata required
ball.png                          # transparent small-game ball
hit-fx.png
hr-fx.png
pitch-icons.png                   # white/red/grey, 3 separate logical sprites
hud-base.png
...
```

**Metadata required:** source composition resolution, used reference camera, pose-frame order, feet pivot and hand/bat pivot in each cell, transparent alpha and source provenance/license. Do not rename existing `public/config/assets.json` and overwrite custom art. Preview/export alongside an in-game 960×600 composite and a file manifest (SHA256 for accepted items only).

## 4. Codex integration task — ready to issue AFTER the first look is approved

Copy as one coding instruction once ART-00 is accepted:

```text
Repository: Allallan-shop/hyper-homerun-derby (Public).
Local worktree: C:\GameDev\hyperHD.
Existing branch: feat/p0-first-playable; Draft PR #2 is open/unmerged. Verify current branch, status and remote HEAD and protect all user local changes. Never force-push, merge or deploy. DO NOT change R3 pitch timing, lag/mouse hitbox, R6 fair-fence distance scoring, R7 flight class timings, stage progression, result/statistics or sharing without explicit Human direction.

Read docs/R8_ART_PRODUCTION_MASTER.md, docs/R8_ART_CREATION_AND_CODEX_BRIEFS.md, docs/R7_FLIGHT_ACTOR_ANIMATION.md and the existing public/config/assets.json and src/game/DerbyScene.ts before touching code.

Only integrate ONE approved visual slice, not other opponents. Use provisional art in ignored public/assets/r8/ and optional public/config/asset-overrides.json. Preserve the current no-art fallback and do not commit third-party/publicity-sensitive PNGs until Human and rights approval.

Integrate 960x600 stadium close-view background (optional foreground layer), a 2200x2400 flyover aligned to R6 wall geometry, approved left-handed batter and pitcher animated frame sheets, a separate bat (if art includes it separately) precisely anchored to the game hitbox, a visible baseball, and fixed pitch-HUD white/red/grey balls. Keep score/game facts code-generated. Add the smallest layering and asset-binding code necessary; no new game editor, engine, custom renderer or 3D physics.

Evidence before reporting pass: npm run test, npm run build; one screenshot of pitcher/batter/ball during the pitch, a short actual Phaser capture of windup → bat contact → HR flight ~4s → fence/landing → return, and a screenshot of HIT landing before wall. Confirm stage still advances, no double bat, no feet floating, no ball hidden behind HUD. When blocked, stop and report exact file/error rather than substituting guesses.

End with summary of exact changed files/commits, test output, any unverified items, concrete next step and review path. Keep PR in Draft, main unchanged. Do not stage unrelated user files.
```

## 5. Work allocation / outsource map

| Task | First owner | Human acceptance | Explicitly NOT now |
|---|---|---|---|
| 4-scene coherent look board | GPT Image | User checks same atmosphere & baseball proportions | Hundreds of standalone prompt samples |
| Stadium environment master | GPT Image + targeted retouch | User checks mound/plate/stadium proportions | Every stadium and season |
| Flyover map & wall | Art + Codex geometry check | User checks field-wall agreement in video | Independent untested fence redraw |
| Batter/pitcher masters | GPT Image | User chooses recognizable shape, consistency, likeness legality | Eight disconnected generated designs |
| 8 key poses/alpha cleanup | Human editing + optional Codex processing | User checks real motion and bat sweet spot | Physically realistic skeletal animation studio |
| HUD and pitch icon composition | Design + Codex | User checks legible balls/score | Fancy settings/menu architecture |
| Title/hub/result/share style | Art + Codex **after vertical slice** | User checks cross-screen consistency | Online features/rankings |
| More rival characters | Later | Individual Human approval | Preproduction of all stage assets |
| Sound/voice/IP likeness | Later separate lane | User checks licensing, performance | Third-party music/voice committed without rights |

## 6. Stop/restart criteria

- If ART-00 concept does not look like convincing baseball, reject the **master style**, not a dozen local sprite effects.
- If assets look good in isolation but break at 960×600, fix scale, anchor and style consistency before producing more images.
- If the R8 vertical slice fails to justify effort, ship the simplified R7 silhouette game instead of promising a full visual studio pipeline. Stop unbounded iteration.
- **Review gates: first look contact sheet; then one integrated in-game stage; then all-screen reskin.** These are intentionally separated, minimizing irreversible wasted animation and stage art.
