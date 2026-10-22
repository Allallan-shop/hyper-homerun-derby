# R6 Realistic Distance & Fence-Synchronized Landing

Date: 2026-10-22 JST  
Status: **R6_SOURCE_IMPLEMENTED / HUMAN_REVIEW_REQUIRED / DRAFT_PR_OPEN**

## Why

Human feedback after R5: the camera and look have improved; however the ball distance still appears exaggerated, a large number of nominal HR shots land *inside* the visual field, and the HR lacks clear graphics. Previously the engine decided HR from a separate score threshold and then placed an animation at a hard-coded point based on the result. This produced contradictions.

## What R6 changed

1. **Temporary realistic distances**: `swingContact` returns a rounded **40–160m** range (quality × 82 + base 55 + purchased power bonus + small variation, clamped), rather than the old 200–350m arcade distances. This is the user's *current visual-review* preference; the earlier long-distance fantasy concept is not permanently deleted.
2. **One stadium**: the three stages' `fenceDistance` values are now **122m at center field**. The left/right foul-line direction approaches **100m**. Stage difficulty still uses pitch speed, repertoire, quota, and player upgrades; it no longer invents different outfield wall distances for each pitcher.
3. **One wall curve**: `projectFieldLanding(distance,direction,centerFenceDistance)` reads the same approximate quadratic fence profile as `public/assets/flight-field.svg` (`M0 590 Q1100 180 2200 590`, centered at x1100/y385). It returns the visual landing point and whether a **fair** ball passed the fence in real-scale metres. Exactly at the wall is **not** a home run. HR/HIT and visual location now share the same calculation.
4. **Guaranteed visible crossing**: a home run beyond the wall is projected **well behind** the painted ~70px-thick fence, even if it passed by 1m. A fair hit before the wall lands on the field side. All results are restricted to the existing field artwork; no third-party art imported.
5. **HR reaction**: `DerbyScene` displays a large golden **HOME RUN!**, white numeric distance, and a short fence-crossing burst only after the simulated airborne ball visually passes that same wall. Result stays for ~1.25 seconds before the camera returns. No preliminary HR banner on balls still approaching the fence.
6. **Human confirmation cue**: header reads **R6 フェンス連動判定版**. The branch remains Draft and unmerged. Main and public deployment are untouched.

## Intentionally unchanged

- Stage flow, pitches/HR quotas, earned points, start/end wall-clock timer, five-axis radar, image export, X sharing, default left batting, strike range, base pitch durations, offspeed ratio, mouse follow, and the R5 original-video-inspired scrolling field.
- All changes target **distance, landing semantics, and HR graphic** only. No additional ball physics, pitching, character-animation system or UI redesign.

## Static verification / tests

Added/updated tests for:
- Mode and stage center-field wall consistency (122m); side-direction wall approximates 100m.
- Moderate/ideal swings yield HIT or HR; displayed distance constrained to 40–160m even at very high Power.
- Multiple fair directions, HR landing always **beyond the same visual wall curve**, HIT landing before; exactly fence distance is not HR.
- Foul trajectory does not count as HR.
- Field flyover and result scorer use the same canonical projection rather than per-outcome arbitrary target positions.

Simple independent numeric sweep (17,017 direction × distance combinations) showed two only machine-precision round-off comparisons at exact fence equality; no actual inside-fence home run. The new scene and TypeScript tests are **not yet executed in this cloud tool environment**.

## Narrow Human Review

1. Run from `C:\GameDev\hyperHD` on `feat/p0-first-playable`. Check `git status --short` first; protect local changes. `git pull --ff-only origin feat/p0-first-playable`, `npm run test`, `npm run build`, restart Vite.
2. Confirm title header **R6 フェンス連動判定版**. A shorter fair hit should land in the grass/warning-track region **before** the visual wall; a home run should cross the yellow-topped outer wall and visibly land **beyond** it.
3. For HR, check dedicated on-fence flash + large **HOME RUN!** and distance text. For HIT, verify no HR graphic.
4. Confirm the final result's maximum distance uses the same metre value, and the stage still can be completed.
5. If one serious mismatch appears, report the shot with a screenshot or 5–10 seconds of game recording. Do not restart a large multi-iteration polish cycle.

**Gate:** Human R6 visual PASS pending. No merge, no deployment.
