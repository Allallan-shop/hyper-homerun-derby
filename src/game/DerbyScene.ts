import Phaser from 'phaser';
import {
  clamp, fieldFlyoverFrame, followBat, pitchDuration, pitchHorizontalX, requiredHomeRuns,
  swingContact, weightedPick, battingSideSign,
  type AssetManifest, type BattingSide, type Mode, type PitchRecord, type Pitcher,
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
  launchX: number;
  launchY: number;
  landingX: number;
  landingY: number;
  launchRadius: number;
  arcHeight: number;
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

export class DerbyScene extends Phaser.Scene {
  private options: MatchOptions;
  private gfx!: Phaser.GameObjects.Graphics;
  // All stage objects move as one camera layer; HUD is fixed on screen.
  private world!: Phaser.GameObjects.Container;
  private flightLayer!: Phaser.GameObjects.Container;
  private flightGraphics!: Phaser.GameObjects.Graphics;
  private flightBallSprite: Phaser.GameObjects.Image | null = null;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private pitcherSprite: Phaser.GameObjects.Image | null = null;
  private batterSprite: Phaser.GameObjects.Image | null = null;
  private backgroundSprite: Phaser.GameObjects.Image | null = null;
  private ballSprite: Phaser.GameObjects.Image | null = null;
  private pitch: ActivePitch | null = null;
  private flight: FlightAnimation | null = null;
  private batX = WIDTH / 2;
  private aimX = WIDTH / 2;
  private clock = 0;
  private swingAt: number | null = null;
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
      if (path) this.load.image(key, new URL(path, document.baseURI).href);
    }
    for (const [key, path] of Object.entries(this.options.assets.sounds ?? {})) {
      if (path) this.load.audio(key, new URL(path, document.baseURI).href);
    }
    // Own original wide-field art, independent of the optional R4 bitmap pack.
    this.load.svg('flight_field', new URL('assets/flight-field.svg', document.baseURI).href);
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
    }
    this.flightGraphics = this.add.graphics().setDepth(3);
    this.hudGraphics = this.add.graphics().setDepth(5);
    this.hud = this.add.text(27, 20, '', {
      color: '#ffffff', fontSize: '24px', fontFamily: 'sans-serif',
      stroke: '#0d1c26', strokeThickness: 4
    }).setDepth(4);
    this.prompt = this.add.text(WIDTH / 2, 154, '', {
      color: '#dcfff1', fontSize: '23px', fontFamily: 'sans-serif',
      stroke: '#0d1c26', strokeThickness: 5, align: 'center'
    }).setOrigin(0.5).setDepth(4);

    if (this.textures.exists(this.options.pitcher.imageId)) {
      this.pitcherSprite = this.add.image(WIDTH / 2, 306, this.options.pitcher.imageId)
        // Mound in the Tokyo-Dome-inspired background is near y=345.
        .setDisplaySize(94, 126);
      this.world.add(this.pitcherSprite);
    }
    if (this.textures.exists('batter')) {
      this.batterSprite = this.add.image(this.batterBodyX(), 465, 'batter')
        // Feet near field bottom, while staying in the left batting box.
        .setDisplaySize(194, 270).setFlipX(this.options.battingSide === 'right');
      this.world.add(this.batterSprite);
    }

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
      if (this.flight.elapsed >= this.flight.duration + MAX_FLIGHT_HOLD_MS) {
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
        this.resolvePitch(record, contact.direction, ballX, visualY, visualRadius);
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
    launchX = this.batX, launchY = CONTACT_Y, launchRadius = 16
  ): void {
    this.records.push(record);
    this.pitch = null;
    this.swingAt = null;
    this.holding = false;
    this.nextPitchDelay = 650;
    if (['HR', 'HIT', 'FOUL'].includes(record.result)) {
      const horizontalTravel = Math.min(record.distanceM * 0.85, 340);
      this.flight = {
        elapsed: 0, result: record.result, direction,
        distanceM: record.distanceM,
        duration: clamp(1150 + record.distanceM * 3.1, 1600, 2850),
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
      outcome: flight.result as 'HR' | 'HIT' | 'FOUL',
      elapsedMs: flight.elapsed,
      flightMs: flight.duration,
      holdMs: MAX_FLIGHT_HOLD_MS,
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
    if (this.flightBallSprite) {
      this.flightBallSprite.setVisible(true)
        .setPosition(view.ballX, view.ballY)
        .setDisplaySize(radius * 2, radius * 2);
    } else {
      trail.fillStyle(0xffffff, 1).fillCircle(view.ballX, view.ballY, radius);
      trail.lineStyle(2, 0xdf4547, 0.95)
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
    this.hud.setText(
      `打球結果 ${flight.result}    ${flight.distanceM.toLocaleString('ja-JP')}m`
    );
    this.prompt.setY(154).setText(view.landed
      ? `着弾！ ${flight.result} / ${flight.distanceM.toLocaleString('ja-JP')}m`
      : `打球を追跡中… ${flight.distanceM.toLocaleString('ja-JP')}m`
    );
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
    if (this.batterSprite) this.batterSprite.setX(bodyX);

    const age = this.swingAt === null ? -1 : this.clock - this.swingAt;
    const activeSwing = this.holding && age < 300;
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
      const trailAlpha = 0.35 + 0.32 * Math.sin(Math.PI * clamp(age / 300, 0, 1));
      g.lineStyle(10, 0xf0d19b, trailAlpha);
      g.lineBetween(bodyX + side * 49, 416, this.batX, batY);
      g.lineStyle(3, 0xfff3d5, trailAlpha);
      g.lineBetween(bodyX + side * 49, 416, this.batX, batY);
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
