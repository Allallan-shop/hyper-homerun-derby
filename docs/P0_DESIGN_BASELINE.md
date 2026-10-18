# P0 Design Baseline — FROZEN

Date: 2026-10-18 (JST) · Repository: `Allallan-shop/hyper-homerun-derby` (public)
Control: [Issue #1](https://github.com/Allallan-shop/hyper-homerun-derby/issues/1)
**Authority: USER APPROVED R9 / Status: `DESIGN_FROZEN / IMPLEMENTATION_HOLD`**

This document consolidates the agreed system design. **Design freeze is not implementation authorization.** No game code, media creation, dependency installation, build, or deployment until the user separately and explicitly authorizes it.

## Goal

Complete a short, streamer-friendly joke game inspired by the play *structure* of Winnie the Pooh's Home Run Derby. **Approximately one week for the core system** is a scope target, not a delivery promise. Keep other priority projects unaffected; accept rough balance, imperfect animation, and absurd distances. Prioritize a finishable, amusing game and results people want to share. Avoid iterative polishing and framework-building.

## Game loop and modes

`Title → Stage Selection + Upgrade Hub → Match → Stage result overlay → Hub → Final Result + X share`

- A mode has a configurable ordered list of stable stage IDs. No code should assume a specific stage count.
- Each stage defines the pitcher, number of pitches, HR quota and pitch distribution. Play the allocated pitches through; only HRs satisfy the quota.
- Success unlocks the next stage. Failure allows retry and earns some upgrade points. Cleared stages may be replayed to earn points.
- The stage hub also contains **Power** (distance), **Meet** (bat contact tolerance), and **Speed** (mouse-follow) upgrades purchased with earned points.
- **Hard mode is optional** if time permits. Clear normal mode to unlock a selectable difficulty **from the title screen**; it is not a separate mandatory “hidden stage”. Reuse normal systems with greater variation, pitch mixing and difficulty. No promise to ship it in P0.
- Default is one session-only run: no full saves, accounts, past-record history or online ranking. Closing/reloading loses progress. If hard mode is added, a session-only unlock is acceptable; add a single persistent unlock flag only if genuinely needed.

## Input, pitching, batting and flight

- Mouse targets the batter's position; actual bat position follows with **lag**. Hold left mouse button to swing; releasing early may interrupt it (original-style control).
- Collision depends on **continuous horizontal x position plus timing**; no three-lane discretization. Vertical pitch movement is visual only and never adds a vertical strike/hit-test dimension.
- Three pitch families: baseball-normal (straight/slider/changeup), fictional/magic movement, and visual distractions (vanish, duplicate, shrink). Pitchers choose their repertoire with **weighted random selection**.
- Early stages: few readable pitches, mostly central x. Mid stages: distinct magic pitch. Late: combined movement/effects. Final/hard: wider x spread, more mixes and harder-to-read weights.
- Prefer separating motion and visual effect; duplicated visible balls can share **one actual hit-test ball** to avoid complexity.
- Horizontal contact offset, timing and Power produce a simple direction/quality/distance outcome. HR is a fair hit beyond a configured fence threshold. Display an **approximately parabolic** trajectory; no accurate 3D physics, gravity simulation or wind. Maximum reported distance is not constrained to plausible baseball distances.
- Tune contact widths, speeds and hit windows only enough that players can hit and clear. Small rough edges are allowed.

## Time, statistics, and result

- **One total clear timer: real elapsed (wall-clock) time**, from the moment stage 1 gameplay starts until the final stage is confirmed clear. Time on the hub, upgrades, losses, retries, extra point farming all counts; no automatic pause at screen transitions.
- Record pitch result, stage ID, swing/contact, rough timing error, distance, ball category, and retry count in memory. Aggregate once from the run.
- Key result figures: elapsed time, total pitches, total HR, HR/pitch, contacts/swings, maximum distance, longest HR streak, retry count.
- Five radar axes from **observed performance only**: contact, HR success, timing, streak, distance. Purchased upgrade levels may be displayed separately but are not directly graded. Chart values clamp to 0–100; actual record distance does not.
- Use the **same aggregated result** for in-game detailed result and shareable PNG. No leaderboard or result-history server.

## Share to X

- One attached result image plus **clickable game URL and hashtag in the post body**, optimized for full readable timeline display.
- **1:1 1200×1200 PNG is currently the first candidate, not a final frozen ratio.** Put critical numbers, game title, and radar within a ~6–8% inset safe area; keep tiny details in the game's result view. Inspect actual single-image X feed appearance after implementation permission, with 4:3/16:9 alternatives permitted.
- On supported mobile, try sharing generated PNG + text/URL via Web Share API. X may not accept all parts; do not promise guaranteed one-tap posting.
- On PC, user **accepts** “copy PNG to clipboard → open prefilled X composer → press Ctrl+V → confirm post”; no manual image save needed for the normal path. Download PNG + attach manually is fallback.
- Do not add X API/OAuth, backend image storage, or automatic posting at P0.

## Stack, data boundaries, and release flexibility

- **Accepted**: TypeScript + **Phaser 3** (3.90.0 candidate) + Vite. Phaser for in-game 2D visuals/input/audio; HTML/CSS for title/hub/result. Simple x-and-time hit test, not a full physics engine.
- Planned small configuration files (not created): `public/config/game-content.json` for ordered modes/stages, pitchers, weighted pitch sets, upgrades, share metadata; `public/config/assets.json` for replaceable picture/BGM/SFX/voice IDs and file paths; `public/assets/` for approved media.
- Planned code responsibilities (not created): `src/game/`, `src/ui/`, `src/results/`, `src/platform/`. Do not build a generalized plug-in system or in-game editor. Swapping assets or adding/removing a stage should only change configuration/media, followed by a rebuild.
- **Initial release candidate** is a backend-free static browser build using a CDN service. Steam/Windows distribution is a possible later exit through a desktop wrapper and extra validation, not included in P0. No user DB or always-on personal server.
- Public source repo: do not upload unlicensed original game assets, third-party likenesses, voice, music or code without an appropriate right to redistribute.

## Minimal implementation sequence — PLAN ONLY

| Slice | Goal |
|---|---|
| 1 | Vite/Phaser startup; read JSON; four screen transitions with placeholders |
| 2 | Mouse-follow, hold swing, horizontal/time collision, rough ball flight |
| 3 | Weighted normal/magic/effect pitches; stage results, retries and upgrades |
| 4 | One-run clock, pitch event log, summary and five-axis radar |
| 5 | Share-card PNG, PC copy + X composer fallback, mobile sharing if supported |
| 6 | Configurable minimal stage content and a full normal-mode playthrough |
| 7 | A limited PC end-to-end check and X paste/thumbnail check; fix only blockers |

These slices are **sequence/priority**, not a promised calendar schedule. If time is tight, reduce stages and special pitch effects before removing the basic game/result pipeline.

## P0 completion criteria — only after explicit implementation approval

1. A full normal run can start at stage 1 and end with the final clear/result, with playable hits/misses, quota, retry, and at least minimal point upgrades.
2. Vary stage count/order, pitch weights, or image/voice references without editing game-rule code.
3. Continuous horizontal aiming and timing, delayed mouse-follow, hold-to-swing, and visual-only vertical changes behave coherently.
4. Timer includes menu/upgrade/retry time; result and radar agree with recorded pitch events.
5. Result PNG is produced in the browser and can be shared/copied or downloaded through a documented fallback.
6. Static Web build requires no backend, account, or persistent save.

**Optional/not blockers:** hard mode, detailed real-world physics, wind, Steam release, mobile gameplay controls, account/leaderboard, perfect X one-tap upload, exhaustive cross-browser polish.

## Adjustable even though system is frozen

Exact stage count, character roster, assets/voice recordings, pitch speeds and weights, quota/point constants, timings, and final PNG ratio are **deliberately unfrozen content/parameter choices**. Decide with a small number of representative test runs, not repeated design loops.

**Status: `DESIGN_FROZEN / IMPLEMENTATION_HOLD`.**
