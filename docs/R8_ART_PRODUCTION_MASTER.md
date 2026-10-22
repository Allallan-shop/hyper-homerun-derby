# R8 Art Production Master — replace-all strategy, one vertical slice first

Date: 2026-10-23 JST  
Authority: **USER DIRECTION (replace all temporary visuals)**  
Status: **R8_ART_PRODUCTION_BRIEF_READY / ART_DIRECTION_PROPOSED / HUMAN_LOOK_APPROVAL_PENDING**  
Game implementation: [Draft PR #2](https://github.com/Allallan-shop/hyper-homerun-derby/pull/2), OPEN / DRAFT / UNMERGED. Design authority: [P0 Design Baseline](P0_DESIGN_BASELINE.md).

## 0. Scope

User wants the *entire look* raised substantially. **Everything visually temporary is replaceable**, including title, menu, in-game field, two athlete animations, ball, effects, fixed HUD, result/radar, share card, and stage-specific art. But do **NOT** draw three complete stages before the visual grammar is approved.

**Phase R8-V0:** Make ONE playable stage (generic pitcher, default left-handed batter) look and move like a recognizable indoor baseball game. Once approved, reuse a consistent asset contract to fill the rest. No new online/backend/Steam systems. Preserve R3 mouse lag and pitch pace, R6 same-fence HR/landing semantics, R7 trajectory variants and hang time, single-run timer, stage flow and SNS data.

### Practical art target (proposed, not final approved)

- Direction: **broadcast-game-like 2.5D baseball, clean cel-shaded cutouts, controlled painterly background**. Moderate realism in playing field proportions, moderate stylization in faces and effects. Do *not* merely zoom one picture to suggest camera travel.
- Identity: stylized *original*, Tokyo-Dome-inspired unbranded indoor venue: pale membrane dome, seat tiers, display boards, stadium lights, natural field green, warm clay. No actual Tokyo Dome trademarks, brands, advertisements, captured photos or league logos.
- Coherence: all elements share one camera perspective and one light direction (upper-left cool arena lights, warm turf bounce), compatible navy / cream / warm clay / field green. Character scale and frame anchors must remain consistent.
- Recommended palette: navy `#14293E`, teal `#315A69`, turf `#368656`, clay `#BE8B67`, white `#F1F5F3`, HR gold `#FFD66D`. These colors are guidance; not final approvals.
- Character animation should read as a motion, **not just scaling/rotating an entire full-body portrait**. The bat and strike sweet spot need a shared positional anchor. Keep an accessible high-contrast HUD over any field.

## 1. Existing engine/asset constraints to respect

These are actual implementation facts as of R7, not speculative file dimensions:

| Component | Current runtime placement / format | Art contract for first handoff |
|---|---|---|
| Main gameplay canvas | Phaser logical `960×600` | Compose on a 960×600 reference frame; allow source art at 2× resolution if the aspect/geometry matches |
| Batter | center near `(620,465)`, on screen-right for default **left-handed** stance, display `194×270` | Transparent cutout; feet near displayed ground (roughly y590), no baked UI; 8 posed states with consistent feet/sweet-spot alignment |
| Pitcher | `(480,306)`, display `94×126` | Transparent character; feet near mound (roughly y345); 8 posed delivery states |
| Pitch visual | release roughly `(480,292)` → contact y`456` | Pitcher's actual release hand/ball art must look plausible near this start, *not* a different invented position |
| Contact target | continuous x, centered around home plate x`480` | Final barrel/sweet-spot illustration follows the same hitbox x; no visible duplicate, detached bat |
| Current sprite loader | `batter_frames` and `pitcher_frames`: 8 horizontal `480×640` RGBA cells, overall `3840×640` each | **R8 compatibility export** this exact sheet structure; preserve per-frame anchor/foot position |
| Far-field flyover | separate stadium map `2200×2400`, `flight_field` asset fallback | Perspective composition must align home (`1100,2182`), center wall (around `1100,385`), visible wall arc with R6 geometry; never move fence pixels without updating/checking projection math |
| R6 HR field geometry | center 122m, foul-line 100m, quadratic wall used by same projection/score | HIT lands in front of wall, HR beyond; leave logical scoring untouched |
| Share image | PNG `1200×1200` (1:1 first candidate) | Safe area 6–8% (~72–96px); large readable time/HR/record and radar; separately authored from gameplay result UI, shared statistics |
| Local asset override | optional `public/config/asset-overrides.json` loaded in `src/main.ts` | Put provisional art here and in `public/assets/`. **Do not overwrite tracked `public/config/assets.json`** and never check in uncertain imagery to public repository |

**Integration gap:** current `DerbyScene` has a one-image batting background and a separate one-image flyover. Multi-layer parallax, independently animated bats, foreground masks and advanced layout are **not automatic** just because a PNG is made; Codex must add the smallest renderer changes to support them, if approved for the first sample. Do not claim those features already work.

## 2. Full replacement asset inventory

Status columns mean planned; no item below is being claimed as already produced at production quality.

| ID | Priority | Deliverable | Count for FIRST representative slice | Output / notes |
|---|---|---|---|---|
| ART-00 | **P0 gate** | 4-shot look contact sheet / one art direction key visual | 1 sheet | batting, pre-pitch, flight, HR using same designs, not a random unconnected moodboard |
| BG-01 | **P0** | close batting view | 1 composite + optional background/foreground masks | 960×600 reference, optional 1920×1200 master; players/UI excluded |
| BG-02 | **P0** | long flyover view | 1 field map | 2200×2400 SVG/PNG, same R6 landmarks and wall geometry |
| ACT-01 | **P0** | generic default LEFT batter | 1 original design + 8 anchored poses | Transparent 3840×640 horizontal sheet, cells 480×640 |
| ACT-02 | **P0** | generic pitcher | 1 original design + 8 anchored poses | Same sheet format and pose family |
| PROP-01 | **P0** | ball, separate bat (preferred), shadow/contact anchors | 1 set | Transparency; different in-play scale as needed |
| FX-01 | **P0** | impact + trail + landing + home run | 1 effect family | Transparent asset(s)/code; HR must fire only on R6 crossing |
| HUD-01 | **P0** | always-on score/balls HUD | 1 skin + 3 ball states | Empty white / HR red / failure grey; legible over stadium |
| MENU-01 | P1 | title/logo/mode background | 1 coherent art set | Title screen, not a new menu framework |
| MENU-02 | P1 | stage selection + 3 upgrade indicators | 1 skin, reused | Stage order/number remain config-driven |
| RESULT-01 | P1 | gameplay results + five-axis radar skin | 1 shared system | Actual performance remains basis of chart |
| SHARE-01 | P1 | X post result image template | 1 | Client-generated 1200×1200 PNG candidate; no tiny illegible text |
| STAGE-01 | P2 | individual opponent illustrations / special ball FX | only after visual slice PASS | One generic pose engine, many replaceable art IDs |
| MODE-01 | P2 | Hard mode skin and special scenery | 0 for P0 | Optional mode, not required for first release |
| ATM-01 | P2 | crowds, light flicker, extra props and banners | optional | Must not be mistaken for core baseball legibility |
| SFX-01 | separate audio lane | bat / impact / crowd / HR / pitching sounds | not in R8 art gate | Needed for eventual game polish; do not block visual slice |

**Full replacement does not imply "fully hand-paint every stage".** First choose art grammar using ART-00 and BG/ACT/FX/HUD P0. Adapt common UI/field into other screens; produce individual rival appearances only after a successful complete demonstration.

## 3. Deliver in this order: short vertical slice

**Gate A — Look direction (reversible).** Deliver a single **960×600 composite** showing all primary assets in one scene, plus a small 4-frame progression of batting → contact → flying → HR. At this point approve only art direction, perspective and scale. Avoid producing 3 stages or full eight-frame sheets before Gate A.

**Gate B — Motion + foreground (partly expensive to reverse).** Once Gate A is approved, build ONE left-batter 8-pose sheet, ONE pitcher 8-pose sheet, ball and bat anchors, and base HUD, in the fixed 480×640-per-cell export. Codex imports as a local overlay without changing HR scoring. Inspect real in-game *motion*, not just poses on a blank page.

**Gate C — Camera + HUD complete (expensive to rework).** Align close view and scrolling outfield to the identical stadium composition. Test quick dissolve, 4s moonshot, contact point, in/out-of-park landing. Add production-like HR message and the simple score. Final checks happen in an actual 960×600 running Phaser screenshot or short clip.

**Gate D — Menu/results and later expansion (reversible).** Reuse approved palette, typography, shapes for title, stage/upgrades hub, results and social image, then populate further opponents and effect colors. No stage-count rearchitecture.

### Review acceptance for the FIRST representative stage

- One screenshot looks obviously like baseball in a Tokyo-Dome-inspired indoor stadium: player in correct left box, pitcher on mound, field not a squash arena.
- One 5–12-second real gameplay capture demonstrates windup → release → swing → one arc → wall and landing → HR reaction → next pitch, without floating players or obvious sprite jumps. A perfect HR hangs ~4s where hit quality permits.
- Bat sweet spot and hit-test indicator match. Score/ball history is readable. Field depth is richer than raw scale/zoom.
- HUD and art do not conceal the ball. Same local visual composition survives Chrome at 960×600, normal resizing, and current fixed X result.
- R6 fair HR remains **beyond** wall and R6 HIT **inside**. R3 gameplay and current progression stay intact.
- No regression in `npm run test`, `npm run build`; a real machine playthrough is evidence, not GitHub's mere source readback.
- No unlicensed/third-party game assets or recognized brand/trademark material is silently copied to the Public repo.

## 4. Production responsibilities and cost containment

- **GPT Image**: fast *initial art direction*, indoor venue reference illustrations, generic actor designs, first ball/HR FX mockups. Not trusted to output usable sprite animation solely from one prompt.
- **Human/art editing**: approve style, inspect actual frame-to-frame consistency, extract character/bat/arm layers, remove artifacts, normalize pivots and transparent edges, control any recognizable streamer/community member likeness and artwork/music rights. This is the visual accept/reject authority.
- **Codex/engine**: preserve code/branch, wire manifest paths, align camera anchors, sprite sheets, optional foreground layers and independently moving bat, typography skin and result UI. Test build, short Chrome run, check R6 scoring, screenshots and local artifacts. Codex **must not silently mutate pitch/HR/difficulty rules**.
- **Defer**: all other opponents and their elaborate pitches, multilevel backgrounds, crowds, stage-specific poster art, Hard mode, costly rig/framework, new business logic, audio recording. Cancel or scale back if this one-stage vertical slice cannot visually justify the workload.

## 5. Correctness and workflow controls

- GitHub `Allallan-shop/hyper-homerun-derby`; work only through Draft PR #2's development branch unless explicitly changing lane ownership. Never merge or deploy without user acceptance.
- Local expected root `C:\GameDev\hyperHD`. **Remote GitHub is not the user's local filesystem**; local staging, engine execution and screenshots still need execution in that Windows directory.
- Keep rough exported work and generated art in ignored `public/assets/` and `public/config/asset-overrides.json`; after rights + Human acceptance decide which reusable files should enter public GitHub. Keep production editable source files out of Public by default.
- Do not claim this document is a finished image, animation, design approval, working game, or PASS.
