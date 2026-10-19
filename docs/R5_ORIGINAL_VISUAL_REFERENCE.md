# R5 Original Game Visual Reference — evidence before camera changes

Date: 2026-10-19 JST  
Status: **VIDEO_PRIMARY_OBSERVED / CAMERA_CHANGE_CANDIDATE / R3_SYSTEM_PROVISIONAL_PASS**

## Purpose and boundaries

The user provisionally accepted the R3 gameplay, but judged the R4 look cheap: static sprites, and a simple pan/zoom of a single stadium texture does not communicate a hit ball travelling through a baseball field. User authorized independent research of the **original Pooh Home Run Derby's camera and ball-flight presentation**. This document separates *observed original screen content* from *unverified temporal motion* and *implementation proposals*. Do not blindly rewrite camera code based on screenshots alone.

### Reference materials located

1. [Original batting view — Qgames screenshot](https://www.qgames.org/img/games/screen/18453.jpg) (read-only visual reference, third-party hosted). Batter in front left, pitcher on stump in upper center, green field/dirt and a **fixed top-left Target / Home Runs / Balls Left scoreboard**.
2. [Original HomeRun frame — MobyGames screenshot](https://cdn.mobygames.com/screenshots/16088763-winnie-the-pooh-home-run-derby-browser-knocked-it-out-of-the-par.png) (read-only visual reference). **Different framing**: close outdoor trees and outfield; batter/mound are no longer in frame, yet the target/HR/remaining pitches display stays in the top-left. Large `HomeRun!` plus distance across the center.
3. [Long field establishing screenshot — TechRaptor](https://techraptor.net/gaming/news/winnie-poohs-home-run-derby-shuts-down-next-month) (read-only visual reference). Shows batter/mound/far field scale relationship.
4. [2013 Robin 44-HR play video listing (via KnowYourMeme)](https://knowyourmeme.com/videos/56996-winnie-the-poohs-home-run-derby), originating from [YouTube video wAGk_NLToa4](https://www.youtube.com/watch?v=wAGk_NLToa4).
5. [2013 commentary gameplay video listing](https://knowyourmeme.com/videos/56988-winnie-the-poohs-home-run-derby), originating from [YouTube video maygjIePBoc](https://www.youtube.com/watch?v=maygjIePBoc).
6. [Public Ruffle game mirror — game-ac](https://game-ac.com/free/sports/pooh-home-run-derby/) (reference gameplay, not a code-asset source). [Japanese Ruffle mirror — Internet Archive](https://archive.org/details/homerun_20201126).

The third-party original screenshots and videos are for **review only**, not assets to be committed or republished. Screenshots cannot prove frame times, pans, camera speed, or easing.

## Evidence / confidence matrix

| Question | What can be confirmed now | What is still unknown |
|---|---|---|
| Is there a distinct outfield framing after contact? | **Yes (still frame).** The HomeRun screenshot shows nearby field trees with no batter, distinct from the batter view. | Whether the original transitions by a hard cut, pan, zoom, parallax animation, or a combination. |
| Does HUD remain anchored? | **Yes in the two example stills.** Top-left target/HR/balls counters appear in both different framings. | HUD details through the transition. |
| How does a ball travel? | No defensible temporal measurements from static images. | Ball speed vs apparent world speed, direction, scale, bounce/landing, whether ball remains near screen center. |
| How are hit, foul, HR separated visually? | HR frame shows large colored word plus printed distance. | Timings, hit/foul camera and return, impact/landing transitions, staging duration. |
| How quickly does the next pitch start? | No defensible temporal measurement from static images. | Number of frames after impact and after landing/HR title. |

## Current prototype difference and likely cause of cheapness

Current `src/game/DerbyScene.ts` uses **one** static 960×600 stadium/background layer and a camera transform (`world.setScale` / `setPosition`) with at most 1.25× zoom. The background image does not contain separate outfield detail, depth layers or an independently moving pitch-to-field camera representation. Players and scoreboard can be technically continuous, but a shallow enlargement of the same texture gives little sense of distance. This is a code-verified structural limitation, **not** proof of the exact original solution.

## Small, evidence-gated research request

Only 2–3 original events are needed; not the entire game:
- A standard straight-pitch **home run** (contact → ball flight → distance/landing → back to batter).
- One **HIT or FOUL** (contact → ball behaviour → result → return).
- If possible, one **long-distance HR** later in the game.

Capture a **10–20 second original video segment** or frames at e.g. ~100 ms intervals (10 fps is enough for scene transitions, a few frames at 30 fps around contact if necessary). Measure and annotate:
1. Contact frame/time and first ball-flight frame.
2. Original camera continuity or change (background landmarks, ball position and scale).
3. Separation of foreground/background layers and changes in visual depth.
4. HR/HIT/FOUL overlay timing and distance display.
5. Return-to-batter frame and delay before next pitch.

A playable Ruffle mirror was located, and the two archived YouTube listings were identified. **The present tool environment could read textual listings and source screenshots, but was unable to download/open full video bytes from YouTube or the hosting site; no time-coded video analysis has been performed.** Don't claim one.

## Provisional implementation direction — NOT APPROVED

Preserve R3 hit logic, stage flow and timers. Do *not* try to fix depth by further increasing a static background's zoom. If original motion confirms it, use a layered 2D field with a dedicated outfield visual plane and controlled camera/ball movement, stable HUD, and a short impact-to-outfield transition. Any exact cut/pan/easing, parallax amplitude, flight/landing time and asset plan must follow video frames. For now **no camera code changes**.

## Gate

`ORIGINAL_STILLS_REVIEWED / VIDEO_MOTION_NOT_VERIFIED / R3_SYSTEM_PROVISIONAL_PASS / R4_ART_INCOMPLETE`  
Draft PR #2 remains unmerged. No public deployment. Update this document with timecoded evidence before implementing a reference-driven R5 camera change.


## Original playable reference confirmation (user observation, 2026-10-19)

- The user personally opened the [Japanese Ruffle browser release](https://game-ac.com/swf/homerun.html), linked from [the public game-ac page](https://game-ac.com/free/sports/pooh-home-run-derby/), and reported **“本家そのもの” (it is the original itself)**. Treat this as a first-hand confirmation of a usable primary gameplay reference, not merely another descriptive article or still image.
- The site itself describes the page as a Ruffle revival of the Flash game. We can stop looking for unrelated interpretations of the rules or edited gameplay footage as our primary baseline.
- **Limitation unchanged:** the current chat's browser connection is read-only and cannot click/play/record the Ruffle canvas; public-web retrieval gives HTML/text but not the on-screen frame sequence. This confirmation does **not** grant us measured camera transitions or video-frame timing.
- Next research input, if direct playable browser control remains unavailable: **one short 10–20-second recording** of a successful hit including contact → flight → landing/result → return to next pitch (optionally another missed hit). Can be captured with Windows Xbox Game Bar; no game extraction or source copying required.
- Once video bytes are available, extract a handful of representative frames, record a contact/camera/ball/field/HUD timeline, and implement one restrained source change while keeping R3 gameplay and user-approved scope unchanged. Do not copy source images or software assets into the public repo.


## 2026-10-19 PRIMARY VIDEO MEASUREMENTS (overrides previous video-unavailable notes)

**Evidence:** The user provided the actual 122.15-second, 1920×1080, **60fps** Japanese Ruffle original-game MP4 (`2026-10-19 18-16-42.mp4`). We directly sampled its frames (1fps overview, ~5fps detailed, 60fps around transitions). The original gameplay panel occupies approximately x=209..1440 and y=0..925 in the recording. No original game executable, art, audio or copied frames are added to this public repository.

### Measured original-camera events

| Video time | Visual evidence |
| --- | --- |
| ~26.88–27.063s | Close batting view; Pooh, Eeyore and ball visible. Target/HR/balls-left HUD pinned top-left. |
| **27.080s** | Very wide/elevated field view appears **in about one recorded 60fps frame**. This is essentially a hard cut, **not** a slow seamless zoom. |
| ~27.1–29.5s | Continuous travel over a large mapped field; bases/mound/dirt/grass, fence and trees move across frame under the flying ball. Much more than enlargement of one background. |
| ~29.6s | “Home Run” and measured `114.0m` appear over the distant field. HR count increments, HUD stays pinned. |
| ~29.6–31.6s | Result is held over the outfield view for about two seconds. |
| ~31.6–31.97s | Short black fade and return to batter view, then next pitch. |
| ~34.30–34.45s | Second contact and fast switch to a wide field view. |
| ~34.5–36.7s | Camera scrolls through grass, dirt/hedge landmarks while following the ball. |
| ~36.8–37.1s | Orange “HIT” result appears against the mapped field and is held. |

### Interpretation and requested compromise

**Confirmed:** The original has **two distinct spatial views**: a close batting composition and a broad outfield **travel map**. It cuts between them almost instantly, then tracks the ball over several seconds as recognizable terrain moves. HUD remains fixed. The later result-to-batter transition uses a short dark fade. Therefore the previous claim “the original smoothly pans the same single batting background” was **incorrect**.

The user earlier rejected abrupt cut and cheap 1.25× static-background zoom, and asked for continuity. Thus a **brief 180–240ms dissolve to a purpose-made original baseball outfield flyover**, then a true horizontally/vertically scrolling map following the ball, is an **intentional adaptation** rather than a literal copy of the original's 1-frame cut. Keep an anchored baseball and fixed HUD, show the result after reaching its landing point, and blend back before next pitch.

Do not use the original's original art as a code asset; create original Tokyo-Dome-inspired graphics. Preserve accepted R3 pitch speed, delayed mouse-follow, contact rules and stage flow. Time values above are approximate, sourced from video frames, not source-code internals.

**Research gate now:** `VIDEO_PRIMARY_OBSERVED / TIMELINE_ESTIMATED / CAMERA_IMPLEMENTATION_CANDIDATE`. Any previous “VIDEO_MOTION_NOT_YET_OBSERVED” text below is retained as **historical, superseded** documentation.
