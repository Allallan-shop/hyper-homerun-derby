# R4 look integration — first in-game composition candidate

**State:** `R4_LOOK_ASSET_OVERLAY_READY / SOURCE_CHANGE_IN_DRAFT_PR / HUMAN_VIEW_PENDING` (2026-10-19 JST)

The user accepted the R3 **gameplay only** on a provisional basis, and requested a visual pass resembling an actual baseball game. **Do not re-tune pitch speed, follow lag, game progression, scoring, or timer at this phase.**

## What changed in Draft PR #2

- Image asset support already exists via `public/config/assets.json`; this pass aligns the previously generated **unbranded Tokyo-Dome-inspired background**, left-handed batter, pitcher and ball on the game's 960×600 viewport.
- Pitcher image now centers near `(480,306)` at `94×126`, placing its feet on the illustrated pitcher's mound.
- Batter image now centers at `(batterBodyX(),465)` at `194×270`. The left-handed stance remains on the screen-right batting box; the right-handed future config mirrors the same artwork.
- Pitch release now has a shared visual height constant of `292` rather than disparate values. The pitching image and approaching ball are positioned in the same spatial composition.
- The illustrated player already holds a bat. To prevent the duplicate bat visible in R3, the engine **does not draw a second permanent wooden bat** while this sprite is loaded. A brief contact/swing trail is shown only while the button is held. The green sweet-spot marker remains aligned to the logical contact position.
- The continuous R3 flight camera continues to move the same background/player/ball layer after contact; the point of impact and the landing marker are still part of the same view. No additional scene or separate background is introduced.

## Binary assets / how to try locally

The four GPTimage PNG binaries cannot be copied into the GitHub branch by the text-file connector used for this change. They are supplied separately in the accompanying **`hyperHD_R4_look_integration.zip`** attachment in the ChatGPT conversation, containing:

```
public/assets/background.png   # 960x600
public/assets/batter.png       # 480x640; transparent
public/assets/pitcher.png      # 480x640; transparent
public/assets/ball.png         # 256x256; transparent
public/config/assets.json      # maps all three prototype pitchers to the generic sprite
R4_LAYOUT_COMPOSITE_PREVIEW.jpg  # static composited mock, not actual gameplay
R4_LOOK_IMPORT.md
SHA256SUMS.txt
```

### Safe local import

1. In `C:\GameDev\hyperHD`, inspect `git status --short` and confirm `feat/p0-first-playable`. If local code is modified, protect it before updating.
2. Run `git pull --ff-only origin feat/p0-first-playable`.
3. Unzip the accompanying visual pack into the repo root, preserving `public/` paths. **This overwrites `public/config/assets.json`**, so preserve any custom edits to that file beforehand. Existing R2-generated names are unchanged.
4. Run `npm run test`, `npm run build`, `npm run dev`. No server account or upload required.
5. Local PNGs may be untracked. This is expected. **Don't publish or merge without an accepted integrated view.**

## Narrow Human Review

1. **Static composition:** interior stadium looks like an actual baseball ground; pitcher stands on mound, left batter is within the right-side batter box, baseball is scaled appropriately; no duplicate persistent bat.
2. **In motion:** from release at the mound through approach and contact, ball/pitcher/bat appear in one space, and the same stadium remains visible during follow camera to the landing marker and back.
3. **Readability:** green sweet-spot/cursor indicator and white/gray/red pitch history remain readable over the illustration.
4. **Stop condition:** if those three are acceptable, **R4 art/layout provisional PASS**. Do not edit main game physics or build a full animation system simply for polish. Critically misplaced assets, broken loader or disappearing ball are valid blockers.

## Known limitations

- Static AI-illustrated character sprites, not final likenesses or a frame-by-frame batting/throwing animation.
- The camera is a lightweight 2D approximation, not a geometrically correct 3D field reconstruction; changing background perspective to a true field simulation is out of current scope.
- The image pack is local and optional; the Draft PR remains code-only and shows fallback shapes until unpacked. **The static preview is not evidence of a successful running-game screenshot.**
- This document tracks visual integration only. User-confirmed R3 interaction remains accepted provisionally.

**Authority:** Draft PR #2 open, unmerged, no deployment. Runtime graphics and browser QA remain to be confirmed by Human Review.
