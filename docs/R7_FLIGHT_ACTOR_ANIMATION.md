# R7 — Bat-flight variety, 4s hang time and animated original-art actors

Date: 2026-10-23 JST  
**Status: R7_SOURCE_COMMITTED / OPTIONAL_LOCAL_SPRITE_PACK / HUMAN_REVIEW_REQUIRED**  
Branch: `feat/p0-first-playable` · Draft PR #2 · main unchanged

## Human feedback / scope

The user judged R6 to be moving in the right direction, but asked for:
1. About **4 seconds airborne for a perfect hit**, with some visual hang time.
2. **Distinct batting-ball trajectories**, not an identical arc and duration each time.
3. A less inexpensive-looking stadium / overall presentation.
4. **Actual batter and pitcher motion**, rather than two entirely frozen character images.

Keep the accepted mouse tracking, left batting, pitch speeds and distributions, HR/HIT/foul classification and shared R6 fence projection, stage progression, timing policy, reports and social share. This is a presentation pass with only additive per-ball flight metadata.

## Source change

### Ball flight model

`src/game/rules.ts` adds `FlightProfile`, `planBallFlight`, `ballFlightHeight` and a profile-aware `fieldFlyoverFrame`. The four core variables are hit quality, timing error, distance and outcome. Outcomes still come from the existing R6 real-distance / fair-fence calculation.

| Flight | Typical circumstances | Ball airborne |
|---|---|---|
| Grounder | poor contact / in-play hit | 0.84–1.39s; low hops, dust |
| Liner | medium or mistimed contact | 1.25–1.90s (HR line drives may be 1.85–2.48s) |
| Fly | good contact | ~2.25–3.40s |
| Moonshot | well-timed high-quality HR (quality≥0.87, distance≥123m) | **3.70–4.17s** |
| Slice | foul ball | 1.18–2.23s |

Shape uses a different exponent for low, line and long-hanging trajectories; grounders use small bounces. A small directional hook varies the route but returns to zero at both endpoints. **Actual landing point, true fence crossing and distance in metres remain exactly as in R6.** The longest airborne time is recorded and shown in the detailed result.

`src/game/DerbyScene.ts` adds style-aware ball trail/dust and height-dependent ground shadow; HR graphics still activate only when the ball physically crosses the projected field wall.

### Pitcher & batter animation

`pitcherFrameAt(readyInMs, elapsedMs)` gives 8 temporal poses: rest, step, windup, cock arm, release, follow-through, recovery and neutral. The windup uses the **existing interval before the next pitch** and does not delay or change pitch timing.

`batterFrameAt(age, engaged)` gives 8 poses: rest, load, stride, swing, contact, follow-through, recovery and neutral. A swing trail now connects the character with the sweet spot; both character sheets and simple fallback transforms run without altering the hit collision center.

Two **optional 8-frame 480×640 sprite strips** (`batter-frames.png`, `pitcher-frames.png`, 3840×640 each) have been prepared from the existing GPTimage R4 original character illustrations. They use a simple upper-body rig pivot around the waist to generate several key poses. **These are visibly moving interim frames, not hand-drawn full-body animation or production-level sprite sheets.** Loaded with Phaser `load.spritesheet` only when the optional `asset-overrides.json` names are supplied. Old R4 still images animate with smaller rotational fallback if the sheets are absent.

### Look upgrade

- Ball shadows change with height, powerful hit trails differ from grounder dust.
- Batter/pitcher both get pose-aware shadows and visible action accents.
- `public/assets/flight-field.svg` has additional concourse, floodlights and field-depth highlights, while its **R6 fence curve is not touched**.
- R7 leaves major layout, stadium geometry and the R6 UI structure intact. A production-quality full character animation will still require higher-fidelity keyframe art.

## Optional R7 art pack (not tracked in this GitHub PR)

The conversation contains **`hyperHD_R7_animated_assets.zip`** (4MB approx.). It bundles R4-original local PNGs, both 8-frame pose strips, `public/config/asset-overrides.json`, pose preview, SHA256 and instructions.

The **tracked** `public/config/assets.json` is *not modified*. `src/main.ts` optionally reads `config/asset-overrides.json` and merges its `images`/`sounds` keys in memory, so local review art does not block future `git pull`. The overlay file and provisional PNGs are ignored in `.gitignore`. The public PR holds only original text/SVG code.

### Local import

1. In `C:\GameDev\hyperHD`, inspect `git status --short` and ensure branch `feat/p0-first-playable`; protect any tracked local changes.
2. `git pull --ff-only origin feat/p0-first-playable`.
3. Unzip `hyperHD_R7_animated_assets.zip` into `C:\GameDev\hyperHD`, preserving directory names. It is self-contained: static R4 art plus both motion strips. It **does not overwrite tracked `assets.json`**.
4. `npm run test`, `npm run build`, `npm run dev`. Reload browser after stopping/restarting the old Vite server.
5. Confirm top header **`R7 弾道・選手アニメーション版`**. Before judging appearance, verify that real PNG strips loaded and that the game does not show fallback shapes.

## Narrow Human Review (no repeated polish loop)

- Compare one low hit/liner, one fly, and one excellent HR. Watch for visibly distinct trajectory/flight duration. An ideal HR should remain in the air roughly **4 seconds** (plus landing/result hold).
- Watch one pitcher windup → release → recovery and one batter preparation → swing → follow-through. They must show motion, not just full-frame zoom.
- The same Tokyo-Dome-inspired stadium picture and flight map should retain believable field perspective; R6 fair HR must land beyond the wall.
- Check that the switch between batter and flight views, mouse/fence scoring, run timer, stage-end/result, and the R6 HR graphics still function.
- Critical missing sprites, animation glitches, incorrect landings, a failed build or softlock are blockers. Minor cutout/rig imperfection is tolerated for this intermediate release.

**No npm/TypeScript/Phaser runtime test PASS has been established from GitHub source writes alone.** Until Human verifies, leave Draft PR unmerged and no public deploy.
