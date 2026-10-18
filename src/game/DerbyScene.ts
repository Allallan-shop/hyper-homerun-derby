import Phaser from 'phaser';
import {
  clamp, followBat, pitchDuration, pitchHorizontalX, requiredHomeRuns,
  swingContact, weightedPick,
  type AssetManifest, type Mode, type PitchRecord, type Pitcher,
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
}
export interface MatchOptions {
  stage: Stage;
  mode: Mode;
  pitcher: Pitcher;
  upgrades: Record<UpgradeId, number>;
  assets: AssetManifest;
  onReady: () => void;
  onFinished: (records: PitchRecord[]) => void;
}

const WIDTH = 960;
const HEIGHT = 600;

export class DerbyScene extends Phaser.Scene {
  private options: MatchOptions;
  private gfx!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private pitcherSprite: Phaser.GameObjects.Image | null = null;
  private batterSprite: Phaser.GameObjects.Image | null = null;
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
    this.gfx = this.add.graphics();
    this.hud = this.add.text(27, 20, '', {
      color: '#ffffff', fontSize: '24px', fontFamily: 'sans-serif',
      stroke: '#0d1c26', strokeThickness: 4
    }).setDepth(4);
    this.prompt = this.add.text(WIDTH / 2, 70, '', {
      color: '#dcfff1', fontSize: '23px', fontFamily: 'sans-serif',
      stroke: '#0d1c26', strokeThickness: 5, align: 'center'
    }).setOrigin(0.5).setDepth(4);

    if (this.textures.exists(this.options.pitcher.imageId)) {
      this.pitcherSprite = this.add.image(WIDTH / 2, 190, this.options.pitcher.imageId)
        .setDisplaySize(110, 145).setDepth(2);
    }
    if (this.textures.exists('batter')) {
      this.batterSprite = this.add.image(this.batX - 94, 478, 'batter')
        .setDisplaySize(160, 185).setDepth(2);
    }

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.aimX = clamp(pointer.x, 110, WIDTH - 110);
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0 || this.finished || !this.pitch) return;
      this.aimX = clamp(pointer.x, 110, WIDTH - 110);
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
    const spread = stage.horizontalSpread * mode.spreadMultiplier;
    // Uniform, continuous x location. Early stages use a narrower range.
    const landing = clamp(WIDTH / 2 + (Math.random() * 2 - 1) * spread, 110, WIDTH - 110);
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
      if (this.flight.elapsed > 960) this.flight = null;
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
    this.nextPitchDelay = record.result === 'HR' ? 1150 : 870;
    if (['HR', 'HIT', 'FOUL'].includes(record.result)) {
      this.flight = { elapsed: 0, result: record.result, direction, distanceM: record.distanceM };
      this.playIfAvailable(record.result === 'HR' ? 'homerun' : record.result === 'FOUL' ? 'foul' : 'bat_hit');
    }
    const word = record.result === 'HR' ? 'HOME RUN!!'
      : record.result === 'HIT' ? 'HIT!'
      : record.result === 'FOUL' ? 'FOUL!' : record.result === 'TAKE' ? '見逃し！' : '空振り！';
    this.latestMessage = record.distanceM ? `${word}  ${record.distanceM.toLocaleString('ja-JP')}m` : word;
  }

  private render(): void {
    const g = this.gfx;
    if (!g) return;
    g.clear();
    g.fillStyle(0x122536, 1).fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0x397a57).fillRect(0, 210, WIDTH, 390);
    for (let i = 0; i < 5; i++) {
      g.fillStyle(i % 2 === 0 ? 0x367353 : 0x33704f, 0.65);
      g.fillRect(i * 210, 226, 210, 374);
    }
    g.fillStyle(0xb0a076, 1).fillTriangle(WIDTH / 2, 280, 710, 525, 250, 525);
    g.lineStyle(4, 0xe9f5ee, 0.88);
    g.lineBetween(WIDTH / 2, 235, 32, 560);
    g.lineBetween(WIDTH / 2, 235, WIDTH - 32, 560);
    g.fillStyle(0x214e43).fillRect(0, 196, WIDTH, 19);

    // Default placeholder pitcher and batter are original geometric shapes.
    if (!this.pitcherSprite) {
      g.fillStyle(0xf2cf91).fillCircle(WIDTH / 2, 167, 24);
      g.fillStyle(0x4ba9ab).fillRoundedRect(WIDTH / 2 - 37, 187, 74, 72, 12);
      g.fillStyle(0x183748).fillRect(WIDTH / 2 - 35, 148, 70, 12);
    }
    if (!this.batterSprite) {
      g.fillStyle(0xf1d2a1).fillCircle(this.batX - 94, 455, 30);
      g.fillStyle(0xffd265).fillRoundedRect(this.batX - 125, 484, 66, 102, 17);
      g.fillStyle(0x25445f).fillRect(this.batX - 123, 424, 57, 12);
    }
    if (this.batterSprite) this.batterSprite.setX(this.batX - 94);

    const age = this.swingAt === null ? -1 : this.clock - this.swingAt;
    const activeSwing = this.holding && age < 300;
    const angle = activeSwing ? (Math.min(age / 300, 1) - 0.5) * 1.2 : 0;
    const batY = 449 + (activeSwing ? Math.sin(Math.PI * clamp(age / 300, 0, 1)) * 10 : 0);
    g.lineStyle(23, 0x805231, 1);
    g.lineBetween(this.batX - 55, batY + 12, this.batX + 63, batY + angle * 30);
    g.lineStyle(18, 0x75e8b2, 1);
    g.lineBetween(this.batX - 1, batY + 5, this.batX + 40, batY + angle * 15);
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokeCircle(this.aimX, 468, 18);

    if (this.pitch) {
      const p = clamp(this.pitch.elapsed / this.pitch.duration, 0, 1);
      const x = pitchHorizontalX(this.pitch.plan.type, WIDTH / 2, this.pitch.endX, p);
      const effect = this.pitch.plan.effect;
      const wobbleY = effect === 'bounce' ? Math.sin(p * Math.PI * 7) * 39 : 0;
      const y = 265 + p * 184 + wobbleY;
      const radius = (8 + p * 10) * (effect === 'shrink' && p > 0.5 ? 0.45 : 1);
      const showBall = !(effect === 'vanish' && p > 0.42 && p < 0.79);
      if (showBall) {
        if (effect === 'clone' && p > 0.36) {
          g.fillStyle(0xf2f4f6, 0.7).fillCircle(x - 48 * p, y - 24, radius);
          g.fillCircle(x + 51 * p, y + 16, radius);
        }
        g.fillStyle(0xffffff, 1).fillCircle(x, y, radius);
        g.lineStyle(2, 0xe95d60, 0.9).strokeCircle(x, y, radius * 0.65);
      }
    }
    if (this.flight) {
      const t = clamp(this.flight.elapsed / 960, 0, 1);
      const x = WIDTH / 2 + this.flight.direction * 360 * t;
      const y = 447 - 240 * 4 * t * (1 - t) - 125 * t;
      g.fillStyle(this.flight.result === 'HR' ? 0xffd666 : 0xffffff, 1).fillCircle(x, y, 13 * (1 - t * .6));
    }

    const hrs = this.records.filter(x => x.result === 'HR').length;
    const required = requiredHomeRuns(this.options.stage, this.options.mode);
    const nextNo = Math.min(this.options.stage.totalPitches, this.records.length + (this.pitch ? 1 : 0));
    this.hud.setText(`HR ${hrs} / ${required}     球数 ${nextNo} / ${this.options.stage.totalPitches}`);
    this.prompt.setText(this.latestMessage || (this.pitch ? `${this.pitch.plan.id.toUpperCase()}  ●` : '次の投球…'));
  }
}
