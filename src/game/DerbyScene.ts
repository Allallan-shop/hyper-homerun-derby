import Phaser from 'phaser';
import {
  clamp, followBat, pitchDuration, pitchHorizontalX, requiredHomeRuns,
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
const MAX_FLIGHT_HOLD_MS = 820;

export class DerbyScene extends Phaser.Scene {
  private options: MatchOptions;
  private gfx!: Phaser.GameObjects.Graphics;
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
  }

  create(): void {
    if (this.textures.exists('background')) {
      this.backgroundSprite = this.add.image(PLATE_X, HEIGHT / 2, 'background')
        .setDisplaySize(WIDTH, HEIGHT).setDepth(-2);
    }
    this.gfx = this.add.graphics();
    this.hud = this.add.text(27, 20, '', {
      color: '#ffffff', fontSize: '24px', fontFamily: 'sans-serif',
      stroke: '#0d1c26', strokeThickness: 4
    }).setDepth(4);
    this.prompt = this.add.text(WIDTH / 2, 154, '', {
      color: '#dcfff1', fontSize: '23px', fontFamily: 'sans-serif',
      stroke: '#0d1c26', strokeThickness: 5, align: 'center'
    }).setOrigin(0.5).setDepth(4);

    if (this.textures.exists(this.options.pitcher.imageId)) {
      this.pitcherSprite = this.add.image(WIDTH / 2, 190, this.options.pitcher.imageId)
        .setDisplaySize(110, 145).setDepth(2);
    }
    if (this.textures.exists('batter')) {
      this.batterSprite = this.add.image(this.batterBodyX(), 477, 'batter')
        .setDisplaySize(165, 190).setFlipX(this.options.battingSide === 'right').setDepth(2);
    }

    if (this.textures.exists('ball')) {
      this.ballSprite = this.add.image(0, 0, 'ball')
        .setDepth(4).setVisible(false);
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
    this.batX = followBat(this.batX, this.aimX, dt, this.options.upgrades.speed);

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
        this.resolvePitch(record, contact.direction);
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

  private resolvePitch(record: PitchRecord, direction: number): void {
    this.records.push(record);
    this.pitch = null;
    this.swingAt = null;
    this.holding = false;
    this.nextPitchDelay = 650;
    if (['HR', 'HIT', 'FOUL'].includes(record.result)) {
      this.flight = {
        elapsed: 0, result: record.result, direction,
        distanceM: record.distanceM,
        duration: clamp(1150 + record.distanceM * 3.1, 1600, 2850)
      };
      this.playIfAvailable(record.result === 'HR' ? 'homerun' : record.result === 'FOUL' ? 'foul' : 'bat_hit');
    }
    const word = record.result === 'HR' ? 'HOME RUN!!'
      : record.result === 'HIT' ? 'HIT!'
      : record.result === 'FOUL' ? 'FOUL!' : record.result === 'TAKE' ? '見逃し！' : '空振り！';
    this.latestMessage = record.distanceM ? `${word}  ${record.distanceM.toLocaleString('ja-JP')}m` : word;
  }

  // Review-friendly ball trail camera: the world moves under the tracked
  // ball; every contacted ball is followed until the exact landing marker.
  // This is intentionally arcade geometry, not a new 3D physics engine.
  private renderFlight(g: Phaser.GameObjects.Graphics): void {
    const flight = this.flight;
    if (!flight) return;
    const t = clamp(flight.elapsed / flight.duration, 0, 1);
    const worldDistance = Math.min(flight.distanceM, 1500) * 2.15;
    const shotDirection = clamp(flight.direction, -1, 1);
    const currentWorldX = PLATE_X + shotDirection * worldDistance * 0.63 * t;
    const currentWorldY = -worldDistance * t;
    const cameraX = currentWorldX - PLATE_X;
    const cameraY = currentWorldY - 355;

    // Tracking-camera field background with moving stripe/fence references.
    g.fillStyle(0x173349, 1).fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0x347958, 1).fillRect(0, 170, WIDTH, HEIGHT - 170);
    for (let k = -20; k < 24; k++) {
      const y = -k * 96 - cameraY;
      if (y > 175 && y < HEIGHT + 25) {
        g.lineStyle(2, k % 2 === 0 ? 0x4a9667 : 0x286a4d, 0.75);
        g.lineBetween(0, y, WIDTH, y);
      }
    }
    const fenceY = -320 - cameraY;
    if (fenceY > 150 && fenceY < HEIGHT + 80) {
      g.lineStyle(16, 0x164d49, 1).lineBetween(0, fenceY, WIDTH, fenceY);
      g.lineStyle(4, 0xe9d565, 0.95).lineBetween(0, fenceY - 9, WIDTH, fenceY - 9);
    }
    // References on the field slide in the opposite direction of the ball,
    // making the camera's follow movement immediately visible.
    const moundX = PLATE_X - cameraX;
    const moundY = -125 - cameraY;
    if (moundY > 130 && moundY < HEIGHT + 30) {
      g.fillStyle(0xba926c, 0.88).fillEllipse(moundX, moundY, 88, 36);
    }

    const targetWorldX = PLATE_X + shotDirection * worldDistance * 0.63;
    const targetWorldY = -worldDistance;
    const targetX = targetWorldX - cameraX;
    const targetY = targetWorldY - cameraY;
    if (t > 0.45) {
      const alpha = t < 1 ? 0.35 : 1;
      g.lineStyle(4, flight.result === 'HR' ? 0xff6772 : 0xf3e393, alpha)
        .strokeCircle(targetX, targetY, 19);
      g.lineStyle(2, 0xffffff, alpha).lineBetween(targetX - 9, targetY, targetX + 9, targetY);
      g.lineStyle(2, 0xffffff, alpha).lineBetween(targetX, targetY - 9, targetX, targetY + 9);
    }

    const height = Math.sin(Math.PI * t) * Math.min(210, 90 + flight.distanceM * 0.26);
    const ballX = PLATE_X;
    const ballY = 355 - height;
    const radius = 14 - t * 4;
    if (this.ballSprite) {
      this.ballSprite.setVisible(true).setPosition(ballX, ballY)
        .setDisplaySize(radius * 2, radius * 2);
    } else {
      g.fillStyle(0xffffff, 1).fillCircle(ballX, ballY, radius);
      g.lineStyle(2, 0xdf4547, 0.95).strokeCircle(ballX, ballY, radius * 0.64);
    }
    g.fillStyle(0x13293c, .87).fillRoundedRect(245, 451, 470, 112, 18);
    const status = t >= 1 ? '着弾点を確認' : '打球をカメラ追跡中…';
    this.prompt.setText(status);
    this.hud.setText(`打球結果: ${flight.result}    ${flight.distanceM.toLocaleString('ja-JP')}m`);
    if (t >= 1) {
      g.lineStyle(6, 0xffd86d, 1).strokeCircle(targetX, targetY, 27);
      g.fillStyle(0xffedab, 0.92).fillCircle(targetX, targetY, 5);
    }
    // Reuse the existing result text for final impact and distance.
    // No new menu, animation system or expensive camera physics is needed.
    this.prompt.setY(154);
    this.prompt.setText(t >= 1
      ? `着弾！ ${flight.result} / ${flight.distanceM.toLocaleString('ja-JP')}m`
      : `打球追跡中… ${flight.distanceM.toLocaleString('ja-JP')}m`);
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
    if (this.backgroundSprite) this.backgroundSprite.setVisible(!this.flight);
    if (this.pitcherSprite) this.pitcherSprite.setVisible(!this.flight);
    if (this.batterSprite) this.batterSprite.setVisible(!this.flight);
    if (this.ballSprite) this.ballSprite.setVisible(false);
    if (this.flight) {
      this.renderFlight(g);
      return;
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
      g.fillStyle(0xf1ce97, 1).fillCircle(PLATE_X, 171, 22);
      g.fillStyle(0xe7e8e9, 1).fillRoundedRect(PLATE_X - 25, 192, 50, 72, 9);
      g.fillStyle(0x203f62, 1).fillRect(PLATE_X - 30, 151, 60, 12);
    }
    if (!this.batterSprite) {
      g.fillStyle(0xf2d19b, 1).fillCircle(bodyX, 438, 27);
      g.fillStyle(0xf5f7f8, 1).fillRoundedRect(bodyX - 30, 467, 60, 96, 12);
      g.fillStyle(0x273d6b, 1).fillRect(bodyX - 28, 407, 56, 12);
    }
    if (this.batterSprite) this.batterSprite.setX(bodyX);

    const age = this.swingAt === null ? -1 : this.clock - this.swingAt;
    const activeSwing = this.holding && age < 300;
    const rotation = activeSwing ? (Math.min(age / 300, 1) - .5) * .7 : 0;
    const batY = CONTACT_Y - (activeSwing ? Math.sin(Math.PI * clamp(age / 300, 0, 1)) * 10 : 0);
    // The green sweet spot is centered on batX — the SAME x used for collision.
    // Mirror the handle toward the batter; neither hitbox nor timing is mirrored.
    g.lineStyle(21, 0x80552d, 1);
    g.lineBetween(this.batX + side * 93, batY + 21,
      this.batX - side * 64, batY - 7 + rotation * 31);
    g.lineStyle(16, 0x70e9bb, 1);
    g.lineBetween(this.batX - 20, batY, this.batX + 20, batY);
    g.lineStyle(2, 0xeafff5, 1).strokeCircle(this.batX, batY, 16);

    if (this.pitch) {
      const p = clamp(this.pitch.elapsed / this.pitch.duration, 0, 1);
      const x = pitchHorizontalX(this.pitch.plan.type, PLATE_X, this.pitch.endX, p);
      const effect = this.pitch.plan.effect;
      // No vertical strike coordinate: the bounce is presentation only.
      const wobbleY = effect === 'bounce' ? Math.sin(p * Math.PI * 7) * 32 : 0;
      const y = 258 + p * (CONTACT_Y - 258) + wobbleY;
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
    this.renderPitchHistory(g);
    const hrs = this.records.filter(x => x.result === 'HR').length;
    const required = requiredHomeRuns(this.options.stage, this.options.mode);
    const remaining = this.options.stage.totalPitches - this.records.length;
    this.hud.setText(`HR ${hrs} / ${required}   残り ${remaining}球   ${this.options.battingSide === 'left' ? '左打ち' : '右打ち'}`);
    this.prompt.setText(this.latestMessage || (this.pitch ? `${this.pitch.plan.id.toUpperCase()}` : '次の投球…'));
  }
}
