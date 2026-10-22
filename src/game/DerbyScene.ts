import Phaser from 'phaser';
import {
  batterFrameAt, clamp, fieldFlyoverFrame, followBat, pitcherFrameAt,
  planBallFlight, pitchDuration, pitchHorizontalX, requiredHomeRuns,
  swingContact, weightedPick, battingSideSign,
  type FlightProfile, type AssetManifest, type BattingSide, type Mode, type PitchRecord, type Pitcher,
  type Stage, type WeightedPitch, type UpgradeId
} from './rules';

interface ActivePitch {
  plan: WeightedPitch;
  duration: number;
  endX: number;
  elapsed: number;
  swung: boolean;
}
interface FlightAnimation {
  elapsed: number;
  result: string;
  direction: number;
  distanceM: number;
  duration: number;
  holdMs: number;
  launchX: number;
  launchY: number;
  landingX: number;
  landingY: number;
  launchRadius: number;
  arcHeight: number;
  profile: FlightProfile;
}
export interface MatchOptions {
  stage: Stage;
  mode: Mode;
  pitcher: Pitcher;
  upgrades: Record<UpgradeId, number>;
  assets: AssetManifest;
  battingSide: BattingSide;
  strikeHalfWidth: number;
  batAimHalfWidth: number;
  onReady: () => void;
  onFinished: (records: PitchRecord[]) => void;
}

const WIDTH = 960;
const HEIGHT = 600;
const PLATE_X = WIDTH / 2;
const CONTACT_Y = 456;
const PITCH_RELEASE_Y = 292;
const MAX_FLIGHT_HOLD_MS = 820;
const HR_FLIGHT_HOLD_MS = 1250;

export class DerbyScene extends Phaser.Scene {
  private options: MatchOptions;
  private gfx!: Phaser.GameObjects.Graphics;
  // All stage objects move as one camera layer; HUD is fixed on screen.
  private world!: Phaser.GameObjects.Container;
  private flightLayer!: Phaser.GameObjects.Container;
  private flightGraphics!: Phaser.GameObjects.Graphics;
  private homeRunEffects!: Phaser.GameObjects.Graphics;
  private homeRunTitle!: Phaser.GameObjects.Text;
  private homeRunDistance!: Phaser.GameObjects.Text;
  private flightBallSprite: Phaser.GameObjects.Image | null = null;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private pitcherSprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null = null;
  private batterSprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null = null;
  private backgroundSprite: Phaser.GameObjects.Image | null = null;
  private ballSprite: Phaser.GameObjects.Image | null = null;
  private pitch: ActivePitch | null = null;
  private flight: FlightAnimation | null = null;
  private batX = WIDTH / 2;
  private aimX = WIDTH / 2;
  private clock = 0;
  private swingAt: number | null = null;
  private lastVisualSwingAt: number | null = null;
  private holding = false;
  private nextPitchDelay = 750;
  private finished = false;
  private records: PitchRecord[] = [];
  private latestMessage = 'マウスを動かして打撃位置を調整';
  private readonly onBlur = () => {
    this.holding = false;
    this.swingAt = null;
  };

  constructor(options: MatchOptions) {
    super({ key: 'DerbyScene' });
    this.options = options;
  }

  preload(): void {
    for (const [key, path] of Object.entries(this.options.assets.images ?? {})) {
      if (key === 'flight_field' || !path) continue;
      const url = new URL(path, document.baseURI).href;
      if (key === 'batter_frames' || key === 'pitcher_frames') {
        // Both optional locally generated original-art strips contain 8 cells
        // of 480 x 640. Existing R4 single images remain a valid fallback.
        this.load.spritesheet(key, url, { frameWidth: 480, frameHeight: 640, endFrame: 7 });
      } else {
        this.load.image(key, url);
      }
    }
    for (const [key, path] of Object.entries(this.options.assets.sounds ?? {})) {
      if (path) this.load.audio(key, new URL(path, document.baseURI).href);
    }
    // The original wide field is replaceable in the same asset manifest as
    // the pitcher, batter and ball. Older R4 manifests still work.
    const flightPath = this.options.assets.images?.flight_field || 'assets/flight-field.svg';
    const flightUrl = new URL(flightPath, document.baseURI).href;
    if (flightPath.toLowerCase().endsWith('.svg')) {
      this.load.svg('flight_field', flightUrl);
    } else {
      this.load.image('flight_field', flightUrl);
    }
  }

  create(): void {
    if (this.textures.exists('background')) {
      this.backgroundSprite = this.add.image(PLATE_X, HEIGHT / 2, 'background')
        .setDisplaySize(WIDTH, HEIGHT).setDepth(-2);
    }
    this.gfx = this.add.graphics();
    this.world = this.add.container(0, 0);
    if (this.backgroundSprite) this.world.add(this.backgroundSprite);
    this.world.add(this.gfx);
    this.flightLayer = this.add.container(0, 0).setDepth(2).setAlpha(0);
    if (this.textures.exists('flight_field')) {
      this.flightLayer.add(this.add.image(1100, 1200, 'flight_field')
        .setDisplaySize(2200, 2400));
    } else {
      // Fallback if the flyover SVG could not be loaded.
      const field = this.add.graphics().fillStyle(0x3b8b57, 1)
        .fillRect(0, 0, 2200, 2400);
      this.flightLayer.add(field);
      // Make asset-loading failures obvious during R5 review. Avoid treating
      // this plain fallback as the intended scrolling-ballpark artwork.
      this.flightLayer.add(this.add.text(1100, 1450,
        'R5 飛行背景の読込失敗\npublic/assets/flight-field.svg を確認', {
          fontFamily: 'sans-serif', fontSize: '66px',
          color: '#ffffff', backgroundColor: '#8a2424',
          align: 'center', padding: { x: 35, y: 22 }
        }).setOrigin(0.5));
    }
    this.flightGraphics = this.add.graphics().setDepth(3);
    this.hudGraphics = this.add.graphics().setDepth(5);
    this.homeRunEffects = this.add.graphics().setDepth(6);
    this.homeRunTitle = this.add.text(WIDTH / 2, 214, 'HOME RUN!', {
      fontSize: '72px', fontFamily: 'Impact, Arial Black, sans-serif',
      color: '#ffe487', fontStyle: 'bold', stroke: '#a52e33',
      strokeThickness: 12, align: 'center'
    }).setOrigin(0.5).setDepth(7).setVisible(false);
    this.homeRunTitle.setShadow(3, 5, '#2d1b22', 7, true, true);
    this.homeRunDistance = this.add.text(WIDTH / 2, 288, '', {
      fontSize: '37px', fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold', color: '#fff7dc', stroke: '#713238',
      strokeThickness: 7, align: 'center'
    }).setOrigin(0.5).setDepth(7).setVisible(false);
    this.hud = this.add.text(27, 20, '', {
      color: '#ffffff', fontSize: '24px', fontFamily: 'sans-serif',
      stroke: '#0d1c26', strokeThickness: 4
    }).setDepth(4);
    this.prompt = this.add.text(WIDTH / 2, 154, '', {
      color: '#dcfff1', fontSize: '23px', fontFamily: 'sans-serif',
      stroke: '#0d1c26', strokeThickness: 5, align: 'center'
    }).setOrigin(0.5).setDepth(4);

    if (this.textures.exists('pitcher_frames')) {
      this.pitcherSprite = this.add.sprite(WIDTH / 2, 306, 'pitcher_frames', 0)
        .setDisplaySize(94, 126);
    } else if (this.textures.exists(this.options.pitcher.imageId)) {
      this.pitcherSprite = this.add.image(WIDTH / 2, 306, this.options.pitcher.imageId)
        .setDisplaySize(94, 126);
    }
    if (this.pitcherSprite) this.world.add(this.pitcherSprite);

    if (this.textures.exists('batter_frames')) {
      this.batterSprite = this.add.sprite(this.batterBodyX(), 465, 'batter_frames', 0)
        .setDisplaySize(194, 270).setFlipX(this.options.battingSide === 'right');
    } else if (this.textures.exists('batter')) {
      this.batterSprite = this.add.image(this.batterBodyX(), 465, 'batter')
        .setDisplaySize(194, 270).setFlipX(this.options.battingSide === 'right');
    }
    if (this.batterSprite) this.world.add(this.batterSprite);

    if (this.textures.exists('ball')) {
      this.ballSprite = this.add.image(0, 0, 'ball').setVisible(false);
      this.world.add(this.ballSprite);
      // Separate screen-space sprite for the tracked ball during flyover.
      this.flightBallSprite = this.add.image(0, 0, 'ball')
        .setDepth(3).setVisible(false);
    }
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.aimX = this.limitAim(pointer.x);
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0 || this.finished || !this.pitch) return;
      this.aimX = this.limitAim(pointer.x);
      this.swingAt = this.clock;
      this.lastVisualSwingAt = this.clock;
      this.holding = true;
      this.pitch.swung = true;
      this.playIfAvailable(this.options.pitcher.voiceId, 0.18);
    });
    this.input.on('pointerup', this.releaseSwing, this);
    this.input.on('pointerupoutside', this.releaseSwing, this);
    window.addEventListener('blur', this.onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('blur', this.onBlur));
    this.render();
    this.options.onReady();
  }

  // Bat graphic + contact center share batX. The player's body stays inside
  // its batting box; switching sides only mirrors visuals.
  private batterBodyX(): number {
    const sign = battingSideSign(this.options.battingSide);
    return PLATE_X + sign * 140 + (this.batX - PLATE_X) * 0.15;
  }

  private limitAim(x: number): number {
    return clamp(x, PLATE_X - this.options.batAimHalfWidth, PLATE_X + this.options.batAimHalfWidth);
  }

  private releaseSwing(): void {
    this.holding = false;
    this.swingAt = null;
  }

  private playIfAvailable(key: string, volume = 0.5): void {
    if (key && this.cache.audio.exists(key)) {
      try { this.sound.play(key, { volume }); } catch { /* optional audio */ }
    }
  }

  private startPitch(): void {
    const { stage, mode } = this.options;
    const plan = weightedPick(stage.pool);
    const spread = Math.min(this.options.strikeHalfWidth,
      stage.horizontalSpread * mode.spreadMultiplier);
    // Continuous horizontal landing, never a full-screen "strike zone".
    const landing = PLATE_X + (Math.random() * 2 - 1) * spread;
    this.pitch = {
      plan,
      duration: pitchDuration(stage, mode, plan.type),
      endX: landing,
      elapsed: 0,
      swung: false
    };
    this.swingAt = null;
    this.holding = false;
    this.latestMessage = '';
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;
    // Cap large frame jumps so a minimized page doesn't silently eat all pitches.
    const dt = clamp(delta, 0, 55);
    this.clock += dt;
    if (!this.flight) {
      this.batX = followBat(this.batX, this.aimX, dt, this.options.upgrades.speed);
    }

    if (this.flight) {
      this.flight.elapsed += dt;
      if (this.flight.elapsed >= this.flight.duration + this.flight.holdMs) {
        this.flight = null;
      }
      // Never throw the next pitch while a contacted ball is airborne or
      // before the landing marker has been shown.
      this.render();
      return;
    }

    if (!this.pitch) {
      this.nextPitchDelay -= dt;
      if (this.nextPitchDelay <= 0) {
        if (this.records.length >= this.options.stage.totalPitches) {
          this.finished = true;
          this.options.onFinished([...this.records]);
        } else {
          this.startPitch();
        }
      }
      this.render();
      return;
    }

    const pitch = this.pitch;
    pitch.elapsed += dt;
    const progress = pitch.elapsed / pitch.duration;
    const ballX = pitchHorizontalX(pitch.plan.type, WIDTH / 2, pitch.endX, progress);
    const swingAge = this.swingAt === null ? -1 : this.clock - this.swingAt;
    const isActive = this.holding && swingAge >= 65 && swingAge <= 260;
    const hitZone = progress >= 0.90 && progress <= 1.055;
    const width = 69 + this.options.upgrades.meet * 9;

    if (hitZone && isActive) {
      const contact = swingContact({
        offset: ballX - this.batX,
        width,
        timingErrorMs: swingAge - 152,
        powerLevel: this.options.upgrades.power,
        fenceDistance: this.options.stage.fenceDistance
      });
      if (contact) {
        const record: PitchRecord = {
          stageId: this.options.stage.id, pitchId: pitch.plan.id,
          motion: pitch.plan.type, effect: pitch.plan.effect,
          result: contact.result, swung: true,
          contactOffset: ballX - this.batX,
          timingErrorMs: swingAge - 152,
          distanceM: contact.distanceM
        };
        const visualProgress = clamp(progress, 0, 1);
        const bounce = pitch.plan.effect === 'bounce'
          ? Math.sin(visualProgress * Math.PI * 7) * 32 : 0;
        const visualY = PITCH_RELEASE_Y + visualProgress * (CONTACT_Y - PITCH_RELEASE_Y) + bounce;
        const visualRadius = (7 + visualProgress * 10) *
          (pitch.plan.effect === 'shrink' && visualProgress > 0.5 ? 0.45 : 1);
        const profile = planBallFlight({
          outcome: contact.result, distanceM: contact.distanceM,
          quality: contact.quality, timingErrorMs: swingAge - 152,
          direction: contact.direction
        });
        this.resolvePitch(record, contact.direction, ballX, visualY, visualRadius, profile);
      }
    }
    if (this.pitch && progress > 1.11) {
      this.resolvePitch({
        stageId: this.options.stage.id, pitchId: pitch.plan.id,
        motion: pitch.plan.type, effect: pitch.plan.effect,
        result: pitch.swung ? 'MISS' : 'TAKE',
        swung: pitch.swung, contactOffset: null, timingErrorMs: null, distanceM: 0
      }, 0);
    }
    this.render();
  }

  private resolvePitch(
    record: PitchRecord, direction: number,
    launchX = this.batX, launchY = CONTACT_Y, launchRadius = 16,
    plannedFlight?: FlightProfile
  ): void {
    this.records.push(record);
    this.pitch = null;
    this.swingAt = null;
    this.holding = false;
    this.nextPitchDelay = 650;
    if (record.result === 'HR' || record.result === 'HIT' || record.result === 'FOUL') {
      const profile = plannedFlight ?? planBallFlight({
        outcome: record.result, distanceM: record.distanceM, quality: 0.5,
        timingErrorMs: record.timingErrorMs ?? 0, direction
      });
      record.airTimeMs = profile.airTimeMs;
      record.flightStyle = profile.style;
      const horizontalTravel = Math.min(record.distanceM * 0.85, 340);
      this.flight = {
        elapsed: 0, result: record.result, direction,
        distanceM: record.distanceM,
        duration: profile.airTimeMs,
        holdMs: record.result === 'HR' ? HR_FLIGHT_HOLD_MS : MAX_FLIGHT_HOLD_MS,
        profile,
        launchX, launchY, launchRadius,
        landingX: clamp(PLATE_X + direction * horizontalTravel, 85, WIDTH - 85),
        landingY: record.result === 'HR' ? 209 : record.result === 'FOUL' ? 315 : 343,
        arcHeight: clamp(90 + record.distanceM * 0.32, 110, 225)
      };
      this.playIfAvailable(record.result === 'HR' ? 'homerun' : record.result === 'FOUL' ? 'foul' : 'bat_hit');
    }
    const word = record.result === 'HR' ? 'HOME RUN!!'
      : record.result === 'HIT' ? 'HIT!'
      : record.result === 'FOUL' ? 'FOUL!' : record.result === 'TAKE' ? '見逃し！' : '空振り！';
    this.latestMessage = record.distanceM ? `${word}  ${record.distanceM.toLocaleString('ja-JP')}m` : word;
  }

  // Video-grounded R5: the original cuts in one 60fps frame to a wide field
  // and follows the ball across landmarks. Our game preserves the user's
  // smoother feel with a 220ms dissolve while using a real 2200x2400 field
  // flyover and its changing scenery instead of zooming one static picture.
  private renderFlight(_g: Phaser.GameObjects.Graphics): void {
    const flight = this.flight;
    if (!flight) return;
    const view = fieldFlyoverFrame({
      launchX: flight.launchX,
      launchY: flight.launchY,
      direction: flight.direction,
      distanceM: flight.distanceM,
      centerFenceDistanceM: this.options.stage.fenceDistance,
      profile: flight.profile,
      outcome: flight.result as 'HR' | 'HIT' | 'FOUL',
      elapsedMs: flight.elapsed,
      flightMs: flight.duration,
      holdMs: flight.holdMs,
      viewWidth: WIDTH,
      viewHeight: HEIGHT
    });
    this.world.setAlpha(1 - view.alpha);
    this.flightLayer.setAlpha(view.alpha);
    this.flightLayer.setPosition(view.offsetX, view.offsetY);
    const trail = this.flightGraphics;
    trail.clear();
    const t = clamp(flight.elapsed / flight.duration, 0, 1);
    const radius = Math.max(5, flight.launchRadius * (1 - t * 0.48));
    // Keep the ball visible from the exact impact location throughout the
    // initial background dissolve. Fade it out with the field on return.
    const exitT = clamp(
      (flight.elapsed - (flight.duration + flight.holdMs - 340)) / 340,
      0, 1
    );
    const ballAlpha = 1 - exitT * exitT * (3 - 2 * exitT);
    if (this.flightBallSprite) {
      this.flightBallSprite.setVisible(true).setAlpha(ballAlpha)
        .setPosition(view.ballX, view.ballY)
        .setDisplaySize(radius * 2, radius * 2);
    } else {
      trail.fillStyle(0xffffff, ballAlpha).fillCircle(view.ballX, view.ballY, radius);
      trail.lineStyle(2, 0xdf4547, 0.95 * ballAlpha)
        .strokeCircle(view.ballX, view.ballY, radius * 0.64);
    }
    if (t > 0.23 && t < 0.96) {
      // Shadow on the scrolling field gives an immediate sense of altitude.
      trail.fillStyle(0x0d2d23, 0.25 * view.alpha)
        .fillEllipse(view.groundX, view.groundY, 22, 9);
    }
    if (t >= 0.72) {
      const markerAlpha = clamp((t - 0.72) / 0.24, 0, 1) * view.alpha;
      trail.lineStyle(view.landed ? 5 : 3,
        flight.result === 'HR' ? 0xff6571 : 0xffe09d, markerAlpha)
        .strokeCircle(view.groundX, view.groundY, view.landed ? 27 : 17);
      trail.lineStyle(2, 0xfbfdfd, markerAlpha)
        .lineBetween(view.groundX - 9, view.groundY,
          view.groundX + 9, view.groundY);
    }
    // The celebratory graphic appears only once the projected ball has
    // actually crossed the SAME fence curve used for the HR decision.
    if (flight.result === 'HR' && view.visiblyOverFence) {
      const crossedFor = Math.max(0,
        flight.elapsed - flight.duration * view.fenceCrossProgress);
      const reveal = clamp(crossedFor / 150, 0, 1);
      const strength = reveal * ballAlpha;
      const pulse = Math.max(0, 1 - crossedFor / 450);
      this.homeRunTitle.setVisible(true).setAlpha(strength)
        .setScale(0.88 + reveal * 0.12 + pulse * 0.06);
      this.homeRunDistance.setVisible(true).setAlpha(strength)
        .setText(`${flight.distanceM.toLocaleString('ja-JP')} m`);
      if (pulse > 0) {
        this.homeRunEffects.lineStyle(6 + pulse * 6, 0xffe385, pulse * 0.9)
          .strokeCircle(view.fenceX, view.fenceY, 24 + (1 - pulse) * 70);
        for (let angleIndex = 0; angleIndex < 10; angleIndex++) {
          const angle = angleIndex * Math.PI * 2 / 10;
          const start = 42 + (1 - pulse) * 22;
          const finish = start + 28 * pulse;
          this.homeRunEffects.lineStyle(3, 0xffeaae, pulse)
            .lineBetween(
              view.fenceX + Math.cos(angle) * start,
              view.fenceY + Math.sin(angle) * start,
              view.fenceX + Math.cos(angle) * finish,
              view.fenceY + Math.sin(angle) * finish
            );
        }
      }
    }
    const outcomeShown = view.landed || view.visiblyOverFence;
    const flightNames: Record<FlightProfile['style'], string> = {
      grounder: 'ゴロ', liner: 'ライナー', fly: 'フライ',
      moonshot: '特大の高弾道', slice: '切れた打球'
    };
    this.hud.setText(outcomeShown
      ? `打球結果 ${flight.result}    ${flight.distanceM.toLocaleString('ja-JP')}m`
      : `${flightNames[flight.profile.style]}を追跡中…`);
    this.prompt.setY(154).setText(view.landed
      ? `着弾！ ${flight.result} / ${flight.distanceM.toLocaleString('ja-JP')}m`
      : '打球を追跡中…');
  }

  private renderPitchHistory(g: Phaser.GameObjects.Graphics): void {
    const total = this.options.stage.totalPitches;
    const maxCols = 16;
    for (let index = 0; index < total; index++) {
      const row = Math.floor(index / maxCols);
      const col = index % maxCols;
      const count = Math.min(maxCols, total - row * maxCols);
      const x = PLATE_X - (count - 1) * 17 + col * 34;
      const y = 85 + row * 25;
      const record = this.records[index];
      const color = !record ? 0xf4f6f7
        : record.result === 'HR' ? 0xe84a53 : 0x778492;
      g.fillStyle(color, record ? 1 : .94).fillCircle(x, y, 9);
      g.lineStyle(1.6, 0x233445, 0.85).strokeCircle(x, y, 9);
    }
  }

  private render(): void {
    const g = this.gfx;
    if (!g) return;
    g.clear();
    this.hudGraphics.clear();
    this.flightGraphics.clear();
    this.homeRunEffects.clear();
    this.homeRunTitle.setVisible(false);
    this.homeRunDistance.setVisible(false);
    if (this.ballSprite) this.ballSprite.setVisible(false);
    if (this.flightBallSprite) this.flightBallSprite.setVisible(false);
    if (!this.flight) {
      this.world.setScale(1).setPosition(0, 0).setAlpha(1);
      this.flightLayer.setAlpha(0);
    }
    if (!this.backgroundSprite) {
      g.fillStyle(0x1d3748, 1).fillRect(0, 0, WIDTH, HEIGHT);
      // Fallback indoor ballpark until approved Tokyo-Dome-inspired artwork
      // is placed in public/assets and mapped via assets.json.
      g.fillStyle(0xd9e2e7, .9).fillRect(0, 0, WIDTH, 105);
      for (let i = 0; i < 8; i++) {
        g.lineStyle(2, 0x5c7a91, .55)
          .lineBetween(i * 135, 0, PLATE_X, 110);
      }
      g.fillStyle(0x3c617f, 1).fillRect(0, 113, WIDTH, 125);
      g.fillStyle(0x174b4a, 1).fillRect(0, 230, WIDTH, 48);
      g.fillStyle(0x42865c, 1).fillRect(0, 278, WIDTH, 322);
      g.fillStyle(0xc19c79, 1).fillTriangle(PLATE_X, 268, 650, 535, 310, 535);
      g.lineStyle(3, 0xf2f5ef, .82).lineBetween(PLATE_X, 240, 90, 560);
      g.lineStyle(3, 0xf2f5ef, .82).lineBetween(PLATE_X, 240, 870, 560);
    }

    const side = battingSideSign(this.options.battingSide);
    const bodyX = this.batterBodyX();
    const pFrame = pitcherFrameAt(this.nextPitchDelay, this.pitch?.elapsed ?? null);
    const poseOffsets = [0,-2,-5,-2,8,10,5,0];
    const poseRise = [0,1,-5,-8,-6,-3,0,0];
    // Both frame strips and still-image fallbacks animate in time with the
    // ACTUAL throw. This lives in presentation only, no pitching-time changes.
    if (this.pitcherSprite) {
      if (this.pitcherSprite.texture.key === 'pitcher_frames') {
        this.pitcherSprite.setFrame(pFrame).setRotation(0);
      } else {
        const angles = [0,-.06,-.10,-.035,.10,.16,.07,0];
        this.pitcherSprite.setRotation(angles[pFrame]);
      }
      this.pitcherSprite.setPosition(
        PLATE_X + poseOffsets[pFrame], 306 + poseRise[pFrame]
      );
    }
    // Depth and projected shadows stop animated cutouts looking as though they
    // hover over the mound and the batter's box.
    g.fillStyle(0x0a2830, 0.30).fillEllipse(PLATE_X, 361, 112, 17);
    g.fillStyle(0x132c28, 0.30).fillEllipse(bodyX, 585, 163, 24);
    if (pFrame >= 3 && pFrame <= 5) {
      const trail = pFrame === 3 ? .45 : pFrame === 4 ? .95 : .46;
      g.lineStyle(5, 0xffebbc, trail);
      g.lineBetween(PLATE_X - 56, 273, PLATE_X + 12, 245);
      g.lineStyle(3, 0xc7eaff, trail * 0.8);
      g.lineBetween(PLATE_X - 62, 288, PLATE_X + 4, 256);
    }
    if (!this.pitcherSprite) {
      g.fillStyle(0xf1ce97, 1).fillCircle(PLATE_X, 268, 17);
      g.fillStyle(0xe7e8e9, 1).fillRoundedRect(PLATE_X - 20, 283, 40, 62, 8);
      g.fillStyle(0x203f62, 1).fillRect(PLATE_X - 21, 254, 42, 9);
    }
    if (!this.batterSprite) {
      g.fillStyle(0xf2d19b, 1).fillCircle(bodyX, 398, 26);
      g.fillStyle(0xf5f7f8, 1).fillRoundedRect(bodyX - 31, 433, 62, 155, 12);
      g.fillStyle(0x273d6b, 1).fillRect(bodyX - 30, 380, 60, 12);
    }
    const visualAge = this.lastVisualSwingAt === null
      ? null : Math.max(0, this.clock - this.lastVisualSwingAt);
    const visualActive = visualAge !== null && visualAge < 480 &&
      (this.holding || this.flight !== null);
    const bFrame = batterFrameAt(visualAge, visualActive);
    if (this.batterSprite) {
      if (this.batterSprite.texture.key === 'batter_frames') {
        this.batterSprite.setFrame(bFrame).setRotation(0);
      } else {
        const tilts = [0,-.03,-.09,-.02,.15,.23,.08,0];
        this.batterSprite.setRotation(tilts[bFrame] * side);
      }
      const advance = [0,-1,-4,-3,6,9,3,0][bFrame] * side;
      const lift = [0,0,-2,-4,-6,-4,-1,0][bFrame];
      this.batterSprite.setPosition(bodyX + advance, 465 + lift +
        (bFrame === 0 ? Math.sin(this.clock / 360) * 1.3 : 0));
    }

    const age = visualAge ?? -1;
    const activeSwing = visualActive && age < 400;
    const rotation = activeSwing ? (Math.min(age / 300, 1) - .5) * .7 : 0;
    const batY = CONTACT_Y - (activeSwing ? Math.sin(Math.PI * clamp(age / 300, 0, 1)) * 10 : 0);
    // Never draw a second full wooden bat on top of the illustrated batter
    // (the art already holds one). Show only a transient swing trail, with
    // the green sweet spot still exactly aligned to the collision center.
    if (!this.batterSprite) {
      g.lineStyle(19, 0x80552d, 1);
      g.lineBetween(this.batX + side * 94, batY + 21,
        this.batX - side * 64, batY - 7 + rotation * 31);
    } else if (activeSwing) {
      // An arcing bat trail is synchronized to the articulated torso frames.
      // It is deliberately independent of the hit-test sweet spot.
      const t = clamp(age / 360, 0, 1);
      const trailAlpha = (0.24 + 0.56 * Math.sin(Math.PI * t)) *
        clamp((420 - age) / 130, 0, 1);
      const trailX = bodyX - side * (15 + 45 * t);
      const trailY = 407 + Math.sin(Math.PI * t) * 57;
      g.lineStyle(17, 0xfceac3, trailAlpha * .40);
      g.lineBetween(bodyX + side * 45, 395, trailX, trailY);
      g.lineStyle(6, 0xffd77b, trailAlpha);
      g.lineBetween(bodyX + side * 50, 410, trailX - side * 28, trailY + 10);
      g.lineStyle(3, 0xffffff, trailAlpha * 0.9);
      g.lineBetween(trailX - side * 12, trailY - 12, trailX - side * 45, trailY + 25);
    }
    g.lineStyle(13, 0x70e9bb, this.batterSprite ? 0.58 : 1);
    g.lineBetween(this.batX - 18, batY, this.batX + 18, batY);
    g.lineStyle(2, 0xeafff5, 0.9).strokeCircle(this.batX, batY, 16);

    // Continue drawing the batting stadium through contact. The camera is
    // animated on the shared world layer, never replaced by a different field.
    if (this.flight) {
      this.renderFlight(g);
      this.renderPitchHistory(this.hudGraphics);
      return;
    }
    if (this.pitch) {
      const p = clamp(this.pitch.elapsed / this.pitch.duration, 0, 1);
      const x = pitchHorizontalX(this.pitch.plan.type, PLATE_X, this.pitch.endX, p);
      const effect = this.pitch.plan.effect;
      // No vertical strike coordinate: the bounce is presentation only.
      const wobbleY = effect === 'bounce' ? Math.sin(p * Math.PI * 7) * 32 : 0;
      const y = PITCH_RELEASE_Y + p * (CONTACT_Y - PITCH_RELEASE_Y) + wobbleY;
      const radius = (7 + p * 10) * (effect === 'shrink' && p > 0.5 ? .45 : 1);
      const visible = !(effect === 'vanish' && p > .42 && p < .79);
      if (visible) {
        if (effect === 'clone' && p > .36) {
          g.fillStyle(0xf1f1f3, .65).fillCircle(x - 39 * p, y - 16, radius);
          g.fillCircle(x + 39 * p, y + 16, radius);
        }
        if (this.ballSprite) {
          this.ballSprite.setVisible(true).setPosition(x, y).setDisplaySize(radius * 2, radius * 2);
        } else {
          g.fillStyle(0xffffff, 1).fillCircle(x, y, radius);
          g.lineStyle(2, 0xe75858, .95).strokeCircle(x, y, radius * .64);
        }
      }
    }
    this.renderPitchHistory(this.hudGraphics);
    const hrs = this.records.filter(x => x.result === 'HR').length;
    const required = requiredHomeRuns(this.options.stage, this.options.mode);
    const remaining = this.options.stage.totalPitches - this.records.length;
    this.hud.setText(`HR ${hrs} / ${required}   残り ${remaining}球   ${this.options.battingSide === 'left' ? '左打ち' : '右打ち'}`);
    this.prompt.setText(this.latestMessage || (this.pitch ? `${this.pitch.plan.id.toUpperCase()}` : '次の投球…'));
  }
}
