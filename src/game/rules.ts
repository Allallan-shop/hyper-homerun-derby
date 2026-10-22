// Independent game rules. No Phaser, browser APIs, account state or I/O.
export type PitchMotion = 'straight' | 'slider' | 'changeup' | 'zigzag' | 'accelerate';
export type PitchEffect = 'none' | 'bounce' | 'vanish' | 'clone' | 'shrink';
export type Outcome = 'HR' | 'HIT' | 'FOUL' | 'MISS' | 'TAKE';
export type UpgradeId = 'power' | 'meet' | 'speed';
export type BattingSide = 'left' | 'right';
// Left-handed batter stands on the first-base side of the plate in the
// batter-facing-pitcher view. Mirror *visuals*, not pitch physics.
export function battingSideSign(side: BattingSide): 1 | -1 {
  return side === 'left' ? 1 : -1;
}
export interface GameplaySettings {
  defaultBattingSide: BattingSide;
  strikeHalfWidth: number;
  batAimHalfWidth: number;
}

export interface WeightedPitch {
  id: string;
  type: PitchMotion;
  effect: PitchEffect;
  weight: number;
}
export interface Stage {
  id: string;
  name: string;
  pitcherId: string;
  totalPitches: number;
  requiredHomeruns: number;
  pitchDurationMs: number;
  horizontalSpread: number;
  fenceDistance: number;
  pool: WeightedPitch[];
}
export interface Mode {
  id: string;
  name: string;
  enabled: boolean;
  unlockAfter?: string;
  stageIds: string[];
  speedMultiplier: number;
  spreadMultiplier: number;
  quotaMultiplier: number;
}
export interface Pitcher {
  id: string;
  name: string;
  tagline: string;
  imageId: string;
  voiceId: string;
}
export interface UpgradeDefinition {
  label: string;
  maxLevel: number;
  baseCost: number;
  stepCost: number;
}
export interface GameContent {
  title: string;
  gameplay?: GameplaySettings;
  stages: Stage[];
  pitchers: Pitcher[];
  modes: Mode[];
  upgrades: Record<UpgradeId, UpgradeDefinition>;
  share: { hashtag: string; gameUrl: string; headline: string };
}
export interface AssetManifest {
  images: Record<string, string>;
  sounds: Record<string, string>;
}
export interface PitchRecord {
  stageId: string;
  pitchId: string;
  motion: PitchMotion;
  effect: PitchEffect;
  result: Outcome;
  swung: boolean;
  contactOffset: number | null;
  timingErrorMs: number | null;
  distanceM: number;
}
export interface RunState {
  mode: Mode;
  startedAt: number | null;
  finishedAt: number | null;
  upgrades: Record<UpgradeId, number>;
  points: number;
  nextStageIndex: number;
  clearedStages: Set<string>;
  records: PitchRecord[];
  retries: number;
}
export interface Contact {
  result: 'HR' | 'HIT' | 'FOUL';
  distanceM: number;
  direction: number; // -1 left ... +1 right
  quality: number; // 0 ... 1
}
export interface RunReport {
  clearTimeMs: number;
  mode: string;
  pitches: number;
  homeruns: number;
  homeRunRate: number;
  swings: number;
  contacts: number;
  contactRate: number;
  bestDistance: number;
  longestStreak: number;
  retries: number;
  averageTimingErrorMs: number | null;
  radar: [number, number, number, number, number];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
export function requiredHomeRuns(stage: Stage, mode: Mode): number {
  return Math.min(stage.totalPitches, Math.max(1, Math.ceil(stage.requiredHomeruns * mode.quotaMultiplier)));
}
export function weightedPick<T extends { weight: number }>(values: T[], random = Math.random): T {
  if (!values.length) throw new Error('球種が設定されていません');
  const sum = values.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (sum <= 0) throw new Error('球種の抽選重みがすべて0です');
  let needle = clamp(random(), 0, 0.9999999) * sum;
  for (const value of values) {
    needle -= Math.max(0, value.weight);
    if (needle < 0) return value;
  }
  return values[values.length - 1];
}
export function makeRun(mode: Mode): RunState {
  return {
    mode,
    startedAt: null,
    finishedAt: null,
    upgrades: { power: 1, meet: 1, speed: 1 },
    points: 0,
    nextStageIndex: 0,
    clearedStages: new Set<string>(),
    records: [],
    retries: 0
  };
}
export function upgradeCost(level: number, rule: UpgradeDefinition): number {
  return Math.max(0, rule.baseCost + (level - 1) * rule.stepCost);
}
export function buyUpgrade(run: RunState, key: UpgradeId, defs: GameContent['upgrades']): boolean {
  const rule = defs[key];
  const level = run.upgrades[key];
  if (!rule || level >= rule.maxLevel) return false;
  const price = upgradeCost(level, rule);
  if (run.points < price) return false;
  run.points -= price;
  run.upgrades[key]++;
  return true;
}
export function stagePoints(records: PitchRecord[], cleared: boolean): number {
  const score = records.reduce((total, record) => {
    if (record.result === 'HR') return total + 90;
    if (record.result === 'HIT') return total + 20;
    if (record.result === 'FOUL') return total + 5;
    return total;
  }, 0);
  return score + (cleared ? 280 : 60);
}
// Cursor following is frame-time independent (exponential smoothing).
export function followBat(current: number, target: number, elapsedMs: number, level: number): number {
  // Deliberately slow at Lv.1; Speed upgrades still shorten cursor lag.
  const response = 0.00125 + (level - 1) * 0.00048;
  return current + (target - current) * (1 - Math.exp(-response * Math.max(0, elapsedMs)));
}
export interface FlightCameraView {
  ballX: number;
  ballY: number;
  zoom: number;
  cameraX: number;
  cameraY: number;
  landed: boolean;
}

// Ball and camera share one coordinate system with the batting view.
// At impact the camera is exactly the original view (zoom=1, translation=0).
// During the flight it eases toward the ball, then eases back before the next
// pitch. No scene/background swap or teleport of the ball at contact.
export function flightCameraView(input: {
  launchX: number;
  launchY: number;
  landingX: number;
  landingY: number;
  arcHeight: number;
  elapsedMs: number;
  flightMs: number;
  holdMs: number;
  viewWidth: number;
  viewHeight: number;
}): FlightCameraView {
  const { launchX, launchY, landingX, landingY, arcHeight,
    elapsedMs, flightMs, holdMs, viewWidth, viewHeight } = input;
  const smooth = (v: number): number => {
    const t = clamp(v, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const duration = Math.max(1, flightMs);
  const elapsed = Math.max(0, elapsedMs);
  const t = clamp(elapsed / duration, 0, 1);
  const ballX = launchX + (landingX - launchX) * t;
  const ballY = launchY + (landingY - launchY) * t - Math.sin(Math.PI * t) * arcHeight;
  const cameraIn = smooth((t - 0.04) / 0.54);
  const cameraOut = 1 - smooth((elapsed - (duration + holdMs - 470)) / 470);
  const strength = cameraIn * cameraOut;
  const zoom = 1 + strength * 0.25;
  // Clamp the tracked background within the viewport so zooming cannot reveal
  // empty edges. The moving ball and ground remain in the same stage.
  const cameraX = clamp(
    viewWidth * (1 - zoom) / 2 - (ballX - viewWidth / 2) * strength * 0.62,
    viewWidth * (1 - zoom), 0
  );
  const cameraY = clamp(
    viewHeight * (1 - zoom) / 2 - (ballY - viewHeight * 0.52) * strength * 0.45,
    viewHeight * (1 - zoom), 0
  );
  return { ballX, ballY, zoom, cameraX, cameraY, landed: t >= 1 };
}

// Single source of truth for the stadium and its fair-territory fence.
// The original user's latest R6 direction overrides the earlier surreal
// max-distance preference *for now*: keep ordinary hits around 50–160 m.
export const FAIR_DIRECTION_LIMIT = 0.89;
export const FOUL_LINE_FENCE_M = 100;
export const MAX_ARCADE_DISTANCE_M = 160;
const HOME_X = 1100;
const HOME_Y = 2182;
const FENCE_HALF_WIDTH = 955;
const CENTER_FENCE_Y = 385;
const EDGE_FENCE_Y = 590;

export function fenceDistanceAtDirection(centerDistanceM: number, direction: number): number {
  const side = clamp(Math.abs(direction) / FAIR_DIRECTION_LIMIT, 0, 1);
  return centerDistanceM - (centerDistanceM - FOUL_LINE_FENCE_M) * side * side;
}

export interface FieldLanding {
  worldX: number;
  worldY: number;
  fenceX: number;
  fenceY: number;
  fenceDistanceM: number;
  visualRatio: number;
  crossedFence: boolean;
  fair: boolean;
}

// The *same* wall curve decides HR/HIT and positions the ball on the visual
// field. A home run must visibly end beyond the outfield fence, never on turf.
export function projectFieldLanding(
  distanceM: number, direction: number, centerFenceDistanceM: number
): FieldLanding {
  const fair = Math.abs(direction) <= FAIR_DIRECTION_LIMIT;
  const sector = clamp(direction / FAIR_DIRECTION_LIMIT, -1, 1);
  const fenceX = HOME_X + sector * FENCE_HALF_WIDTH;
  // Match the SVG's quadratic fence exactly: M0,590 Q1100,180 2200,590.
  // A sector-only parabola would put HR landing points *inside* the painted
  // warning track near the foul lines.
  const fractionFromCenter = (fenceX - HOME_X) / 1100;
  const fenceY = CENTER_FENCE_Y +
    (EDGE_FENCE_Y - CENTER_FENCE_Y) * fractionFromCenter * fractionFromCenter;
  const fenceDistanceM = fenceDistanceAtDirection(centerFenceDistanceM, direction);
  const physicalRatio = Math.max(0, distanceM) / fenceDistanceM;
  // Beyond the fence, use a modest perspective compression so even a very
  // long HR remains visible in this deliberately simplified 2D field map.
  // Real home runs must land clearly *beyond* the painted 70px-wide wall,
  // even if they clear the nominal distance by only 1m.
  const visualRatio = physicalRatio <= 1 ? physicalRatio
    : 1.04 + Math.min(0.08, (physicalRatio - 1) * 0.36);
  let worldX = HOME_X + (fenceX - HOME_X) * visualRatio;
  const worldY = HOME_Y + (fenceY - HOME_Y) * visualRatio;
  if (!fair) {
    // Put fouls visibly outside the normal fair sector without altering the
    // fixed batting/strike mechanics.
    worldX += Math.sign(direction) * Math.min(35, (Math.abs(direction) - FAIR_DIRECTION_LIMIT) * 140);
  }
  return {
    worldX, worldY, fenceX, fenceY, fenceDistanceM, visualRatio,
    crossedFence: fair && distanceM > fenceDistanceM, fair
  };
}

export interface FieldFlyoverFrame {
  offsetX: number;
  offsetY: number;
  ballX: number;
  ballY: number;
  groundX: number;
  groundY: number;
  fenceX: number;
  fenceY: number;
  fenceCrossProgress: number;
  visiblyOverFence: boolean;
  alpha: number;
  landed: boolean;
}

// R5 original-video-inspired camera. The original has an immediate cut to a
// *different spatial field*, followed by multi-second travel over landmarks.
// For this game we ease the view in over 220ms to avoid a jarring hard cut,
// but move across a large, original stadium field map (not just a 1.25x zoom).
export function fieldFlyoverFrame(input: {
  launchX: number;
  launchY: number;
  direction: number;
  distanceM: number;
  centerFenceDistanceM?: number;
  outcome: 'HR' | 'HIT' | 'FOUL';
  elapsedMs: number;
  flightMs: number;
  holdMs: number;
  viewWidth: number;
  viewHeight: number;
}): FieldFlyoverFrame {
  const smooth = (value: number): number => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const fieldWidth = 2200, fieldHeight = 2400;
  const duration = Math.max(1, input.flightMs);
  const elapsed = Math.max(0, input.elapsedMs);
  const progress = clamp(elapsed / duration, 0, 1);
  const landing = projectFieldLanding(
    input.distanceM, input.direction, input.centerFenceDistanceM ?? 122
  );
  const worldBallX = HOME_X + (landing.worldX - HOME_X) * progress;
  const worldBallY = HOME_Y + (landing.worldY - HOME_Y) * progress;
  const initialX = input.launchX - HOME_X;
  const initialY = input.launchY - HOME_Y;
  const targetOffsetX = input.viewWidth * 0.5 - worldBallX;
  const targetOffsetY = input.viewHeight * 0.55 - worldBallY;
  const follow = smooth((elapsed - 50) / 500);
  const offsetX = clamp(
    initialX + (targetOffsetX - initialX) * follow,
    input.viewWidth - fieldWidth, 0
  );
  const offsetY = clamp(
    initialY + (targetOffsetY - initialY) * follow,
    input.viewHeight - fieldHeight, 0
  );
  const groundX = worldBallX + offsetX;
  const groundY = worldBallY + offsetY;
  const arc = Math.sin(progress * Math.PI) *
    clamp(65 + input.distanceM * 0.23, 85, 190);
  const fadeIn = smooth(elapsed / 220);
  const fadeOut = smooth((elapsed - (duration + input.holdMs - 340)) / 340);
  // Use the *projected* path crossing, not the raw metre fraction. Long
  // shots are compressed beyond the wall, so metres/distance would trigger
  // HOME RUN! before the graphic actually clears the yellow fence.
  const fenceCrossProgress = Math.min(1,
    1 / Math.max(0.00001, landing.visualRatio)
  );
  return {
    offsetX, offsetY, ballX: groundX, ballY: groundY - arc,
    groundX, groundY,
    fenceX: landing.fenceX + offsetX,
    fenceY: landing.fenceY + offsetY,
    fenceCrossProgress,
    visiblyOverFence: landing.crossedFence && progress >= fenceCrossProgress,
    alpha: fadeIn * (1 - fadeOut),
    landed: progress >= 1
  };
}

export function pitchHorizontalX(motion: PitchMotion, startX: number, endX: number, progress: number): number {
  const p = clamp(progress, 0, 1);
  if (p === 1) return endX;
  const travel = motion === 'accelerate'
    ? p < 0.62 ? (p / 0.62) * 0.31 : 0.31 + ((p - 0.62) / 0.38) * 0.69
    : p;
  const base = startX + (endX - startX) * travel;
  if (motion === 'slider') return base + 48 * Math.sin(Math.PI * p);
  if (motion === 'zigzag') return base + Math.sin(p * Math.PI * 6) * 68 * p;
  return base;
}
export function pitchDuration(stage: Stage, mode: Mode, motion: PitchMotion): number {
  const factor = motion === 'changeup' ? 1.65 : motion === 'accelerate' ? 0.97 : 1;
  return Math.max(500, stage.pitchDurationMs * mode.speedMultiplier * factor);
}
export function swingContact(input: {
  offset: number;
  width: number;
  timingErrorMs: number;
  powerLevel: number;
  fenceDistance: number;
  random?: () => number;
}): Contact | null {
  const { offset, width, timingErrorMs, powerLevel, fenceDistance } = input;
  if (Math.abs(offset) > width || Math.abs(timingErrorMs) > 150) return null;
  const normalizedOffset = offset / width;
  const normalizedTiming = timingErrorMs / 150;
  const quality = clamp(1 - Math.abs(normalizedOffset) * 0.34 - Math.abs(normalizedTiming) * 0.42, 0, 1);
  const direction = normalizedOffset * 0.46 + normalizedTiming * 0.8;
  const random = input.random ?? Math.random;
  // Temporary realistic range for the user's current visual review; future
  // fantasy long-distance mode can override this one calculation later.
  const distanceM = clamp(Math.round(
    55 + quality * 82 + (powerLevel - 1) * 3.2 + (random() - 0.5) * 16
  ), 40, MAX_ARCADE_DISTANCE_M);
  const landing = projectFieldLanding(distanceM, direction, fenceDistance);
  const result: Contact['result'] = !landing.fair ? 'FOUL'
    : landing.crossedFence ? 'HR' : 'HIT';
  return { result, distanceM, direction, quality };
}
export function addStageResult(run: RunState, stage: Stage, records: PitchRecord[], cleared: boolean): number {
  run.records.push(...records);
  const points = stagePoints(records, cleared);
  run.points += points;
  if (cleared) {
    run.clearedStages.add(stage.id);
    const stageIndex = run.mode.stageIds.indexOf(stage.id);
    if (stageIndex >= run.nextStageIndex) run.nextStageIndex = Math.min(run.mode.stageIds.length, stageIndex + 1);
  } else {
    run.retries++;
  }
  return points;
}
export function summarizeRun(run: RunState): RunReport {
  const rows = run.records;
  const pitches = rows.length;
  const homeruns = rows.filter(x => x.result === 'HR').length;
  const swings = rows.filter(x => x.swung).length;
  const contacts = rows.filter(x => ['HR', 'HIT', 'FOUL'].includes(x.result)).length;
  const bestDistance = rows.reduce((best, r) => Math.max(best, r.distanceM), 0);
  const timing = rows.map(x => x.timingErrorMs).filter((n): n is number => n !== null);
  const averageTimingErrorMs = timing.length ? timing.reduce((a,b) => a + Math.abs(b), 0) / timing.length : null;
  let streak = 0;
  let longestStreak = 0;
  for (const row of rows) {
    streak = row.result === 'HR' ? streak + 1 : 0;
    longestStreak = Math.max(longestStreak, streak);
  }
  const homeRunRate = pitches ? homeruns / pitches : 0;
  const contactRate = swings ? contacts / swings : 0;
  const radar: RunReport['radar'] = [
    Math.round(contactRate * 100),
    Math.round(homeRunRate * 100),
    averageTimingErrorMs === null ? 0 : Math.round(clamp(100 - averageTimingErrorMs / 1.6, 0, 100)),
    Math.round(clamp(longestStreak / 10 * 100, 0, 100)),
    Math.round(clamp(bestDistance / 550 * 100, 0, 100))
  ];
  return {
    clearTimeMs: Math.max(0, (run.finishedAt ?? Date.now()) - (run.startedAt ?? Date.now())),
    mode: run.mode.name,
    pitches, homeruns, homeRunRate, swings, contacts, contactRate,
    bestDistance, longestStreak, retries: run.retries, averageTimingErrorMs, radar
  };
}
export function formatTime(ms: number): string {
  const positive = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(positive / 60000);
  const seconds = Math.floor(positive / 1000) % 60;
  const centiseconds = Math.floor((positive % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}
export function validateContent(config: GameContent): void {
  if (!Array.isArray(config.stages) || !Array.isArray(config.modes) || !Array.isArray(config.pitchers)) {
    throw new Error('game-content.json の配列が不足しています');
  }
  if (config.gameplay && (
    !['left','right'].includes(config.gameplay.defaultBattingSide) ||
    !Number.isFinite(config.gameplay.strikeHalfWidth) ||
    config.gameplay.strikeHalfWidth <= 0 ||
    !Number.isFinite(config.gameplay.batAimHalfWidth) ||
    config.gameplay.batAimHalfWidth <= 0
  )) throw new Error('不正な打席設定です');
  const stageIds = new Set(config.stages.map(s => s.id));
  const pitcherIds = new Set(config.pitchers.map(p => p.id));
  if (stageIds.size !== config.stages.length) throw new Error('ステージIDが重複しています');
  if (config.modes.some(m => !m.stageIds.length || m.stageIds.some(id => !stageIds.has(id)))) {
    throw new Error('モードに不明なステージIDがあります');
  }
  for (const stage of config.stages) {
    if (!pitcherIds.has(stage.pitcherId) || stage.totalPitches <= 0 || stage.requiredHomeruns > stage.totalPitches ||
      stage.requiredHomeruns <= 0 || stage.pool.length === 0 || stage.pool.every(p => p.weight <= 0)) {
      throw new Error(`不正なステージ設定: ${stage.id}`);
    }
  }
}
