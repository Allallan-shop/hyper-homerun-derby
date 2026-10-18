import Phaser from 'phaser';
import './styles.css';
import { DerbyScene } from './game/DerbyScene';
import {
  addStageResult, buyUpgrade, formatTime, makeRun, requiredHomeRuns,
  summarizeRun, upgradeCost, validateContent,
  type AssetManifest, type GameContent, type Mode,
  type PitchRecord, type RunReport, type RunState, type Stage, type UpgradeId
} from './game/rules';
import { makeShareCard, radarMarkup, statsRows } from './results/report';
import { copyImage, downloadImage, nativeShare, openXComposer, shareText, supportsNativeShare } from './platform/share';

type ViewId = 'title' | 'hub' | 'game' | 'results' | 'error';

function get<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`画面部品がありません: ${id}`);
  return element as T;
}
function button(text: string, className = 'button'): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  return node;
}
function findOrThrow<T extends { id: string }>(values: T[], id: string): T {
  const value = values.find(x => x.id === id);
  if (!value) throw new Error(`不明な設定ID: ${id}`);
  return value;
}

class DerbyApp {
  private content!: GameContent;
  private assets!: AssetManifest;
  private run: RunState | null = null;
  private game: Phaser.Game | null = null;
  private card: Blob | null = null;
  private finalReport: RunReport | null = null;
  private unlockedModes = new Set<string>(['normal']);
  private currentStage: Stage | null = null;

  async boot(): Promise<void> {
    try {
      const [contentResult, assetsResult] = await Promise.all([
        fetch(new URL('config/game-content.json', document.baseURI)),
        fetch(new URL('config/assets.json', document.baseURI))
      ]);
      if (!contentResult.ok || !assetsResult.ok) throw new Error('設定ファイルを読み込めませんでした');
      this.content = await contentResult.json() as GameContent;
      this.assets = await assetsResult.json() as AssetManifest;
      validateContent(this.content);
      this.attachEvents();
      this.renderModes();
      this.switchTo('title');
      get('app-status').textContent = 'P0 試作版 / サーバー保存なし';
      window.setInterval(() => this.paintTimer(), 80);
    } catch (error) {
      get('error-message').textContent = error instanceof Error ? error.message : String(error);
      this.switchTo('error');
      get('app-status').textContent = '起動失敗';
    }
  }

  private switchTo(target: ViewId): void {
    for (const screen of document.querySelectorAll<HTMLElement>('.screen')) {
      screen.classList.toggle('is-hidden', screen.id !== `${target}-view`);
    }
    if (target !== 'game') this.destroyGame();
    this.paintTimer();
  }
  private destroyGame(): void {
    if (!this.game) return;
    this.game.destroy(true);
    this.game = null;
  }
  private paintTimer(): void {
    const run = this.run;
    const elapsed = run?.startedAt === null || !run
      ? 0 : Math.max(0, (run.finishedAt ?? Date.now()) - run.startedAt);
    document.querySelectorAll<HTMLElement>('.run-timer').forEach(node => node.textContent = formatTime(elapsed));
  }
  private renderModes(): void {
    const area = get('mode-list');
    area.replaceChildren();
    for (const mode of this.content.modes.filter(x => x.enabled)) {
      const btn = button(mode.name + (this.unlockedModes.has(mode.id) || !mode.unlockAfter ? ' を開始' : ' / LOCKED'), 'button mode primary');
      const locked = !!mode.unlockAfter && !this.unlockedModes.has(mode.id);
      btn.disabled = locked;
      btn.addEventListener('click', () => this.startMode(mode.id));
      area.append(btn);
    }
  }
  private startMode(modeId: string): void {
    const mode = findOrThrow(this.content.modes, modeId);
    if (!mode.enabled || (mode.unlockAfter && !this.unlockedModes.has(mode.id))) return;
    this.run = makeRun(mode);
    this.card = null;
    this.finalReport = null;
    this.renderHub();
    this.switchTo('hub');
  }
  private renderHub(): void {
    const run = this.run;
    if (!run) return;
    get('hub-heading').textContent = `${run.mode.name} / ステージ選択`;
    get('points').textContent = run.points.toLocaleString('ja-JP') + ' P';
    const stages = get('stage-list');
    stages.replaceChildren();
    run.mode.stageIds.forEach((stageId, index) => {
      const stage = findOrThrow(this.content.stages, stageId);
      const pitcher = findOrThrow(this.content.pitchers, stage.pitcherId);
      const row = document.createElement('div');
      row.className = 'stage-row';
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${stage.name} — ${pitcher.name}`;
      const hint = document.createElement('p');
      hint.textContent = `${stage.totalPitches}球 / ${requiredHomeRuns(stage,run.mode)}HR以上` +
        (run.clearedStages.has(stage.id) ? '  ✓ CLEAR' : '');
      info.append(title, hint);
      const btn = button('挑戦', 'button');
      btn.disabled = index > run.nextStageIndex;
      btn.addEventListener('click', () => this.startStage(stage));
      row.append(info,btn);
      stages.append(row);
    });

    const upgrades = get('upgrade-list');
    upgrades.replaceChildren();
    for (const id of ['power','meet','speed'] as const) {
      const def = this.content.upgrades[id];
      const level = run.upgrades[id];
      const maxed = level >= def.maxLevel;
      const price = upgradeCost(level, def);
      const row = document.createElement('div');
      row.className = 'upgrade-row';
      const text = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = `${def.label}  Lv.${level} / ${def.maxLevel}`;
      const sub = document.createElement('p');
      sub.textContent = id === 'power' ? '飛距離アップ' : id === 'meet' ? '当たり判定アップ' : 'マウスへの追従アップ';
      text.append(name,sub);
      const btn=button(maxed ? 'MAX' : `${price} P`, 'button');
      btn.disabled = maxed || run.points < price;
      btn.addEventListener('click', () => {
        if (buyUpgrade(run,id,this.content.upgrades)) this.renderHub();
      });
      row.append(text,btn);
      upgrades.append(row);
    }
  }
  private startStage(stage: Stage): void {
    const run = this.run;
    if (!run || !run.mode.stageIds.includes(stage.id)) return;
    this.destroyGame();
    this.currentStage = stage;
    const pitcher = findOrThrow(this.content.pitchers, stage.pitcherId);
    get('game-stage-title').textContent = `${stage.name} — ${pitcher.name}`;
    get('game-pitch-name').textContent = pitcher.tagline;
    get('stage-overlay').classList.add('is-hidden');
    this.switchTo('game');
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      backgroundColor: '#13283b',
      parent: 'game-canvas',
      scale: {
        parent: 'game-canvas', mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH, width: 960, height: 600
      },
      scene: new DerbyScene({
        stage, mode: run.mode, pitcher,
        upgrades: { ...run.upgrades }, assets: this.assets,
        onReady: () => { if (run.startedAt === null) run.startedAt = Date.now(); },
        onFinished: records => this.finishStage(stage, records)
      })
    });
  }
  private finishStage(stage: Stage, records: PitchRecord[]): void {
    const run = this.run;
    if (!run || this.currentStage?.id !== stage.id) return;
    const actual = records.filter(x => x.result === 'HR').length;
    const target = requiredHomeRuns(stage,run.mode);
    const cleared = actual >= target;
    const earned = addStageResult(run,stage,records,cleared);

    const finalStage = run.mode.stageIds.at(-1) === stage.id;
    if (cleared && finalStage) {
      run.finishedAt = Date.now();
      if (run.mode.id === 'normal') {
        for (const mode of this.content.modes.filter(m => m.unlockAfter === run.mode.id)) this.unlockedModes.add(mode.id);
      }
      this.renderModes();
      this.showFinalResults();
      return;
    }
    get('stage-outcome-label').textContent = cleared ? 'STAGE CLEAR' : 'TRY AGAIN';
    get('stage-outcome-title').textContent = cleared ? 'ステージ突破！' : 'ノルマ未達成！';
    get('stage-outcome-detail').textContent = `${actual} / ${target} HR　獲得 ${earned.toLocaleString('ja-JP')} P`;
    get('stage-overlay').classList.remove('is-hidden');
  }
  private showFinalResults(): void {
    const run = this.run;
    if (!run) return;
    this.finalReport = summarizeRun(run);
    this.card = null;
    const report = this.finalReport;
    this.switchTo('results');
    get('result-mode').textContent = report.mode;
    get('result-time').textContent = formatTime(report.clearTimeMs);
    get('result-distance').textContent = report.bestDistance.toLocaleString('ja-JP') + 'm';
    get('radar-mount').innerHTML = radarMarkup(report);
    const box = get('stats-mount');
    box.replaceChildren();
    for (const [name,value] of statsRows(report)) {
      const line=document.createElement('div');
      line.className='stat-row';
      const label=document.createElement('span');
      label.textContent=name;
      const result=document.createElement('strong');
      result.textContent=value;
      line.append(label,result);
      box.append(line);
    }
    for (const id of ['copy-button','native-share-button','download-button']) get<HTMLButtonElement>(id).disabled=true;
    get('share-status').textContent = '投稿用画像を生成中…';
    makeShareCard(report,this.content.title,this.content.share.hashtag)
      .then(blob => {
        if (this.finalReport !== report) return;
        this.card = blob;
        get<HTMLButtonElement>('copy-button').disabled = false;
        get<HTMLButtonElement>('download-button').disabled = false;
        get<HTMLButtonElement>('native-share-button').disabled = !supportsNativeShare(blob);
        get('share-status').textContent = '準備完了。PCでは画像コピー後、X投稿画面でCtrl+V。';
      })
      .catch(error => {
        get('share-status').textContent = error instanceof Error ? error.message : 'PNG生成に失敗しました';
      });
  }
  private attachEvents(): void {
    get('continue-button').addEventListener('click',()=>{
      get('stage-overlay').classList.add('is-hidden');
      this.renderHub();
      this.switchTo('hub');
    });
    get('abandon-button').addEventListener('click',()=>{
      if (this.run?.startedAt !== null && !window.confirm('現在の通し記録を破棄してタイトルへ戻りますか？')) return;
      this.run=null;
      this.switchTo('title');
    });
    get('restart-button').addEventListener('click',()=>{
      this.run=null;
      this.card=null;
      this.finalReport=null;
      this.renderModes();
      this.switchTo('title');
    });
    get('copy-button').addEventListener('click',async()=>{
      if (!this.card) return;
      try {
        await copyImage(this.card);
        get('share-status').textContent = 'PNGをコピーしました。②でXを開き、Ctrl+Vで添付してください。';
      } catch(error) {
        get('share-status').textContent = (error instanceof Error ? error.message : '画像コピー失敗') + '。PNGを保存して手動添付してください。';
      }
    });
    get('x-button').addEventListener('click',()=>{
      if (!this.finalReport) return;
      openXComposer(shareText(this.finalReport,this.content.share));
    });
    get('native-share-button').addEventListener('click',async()=>{
      if(!this.card || !this.finalReport) return;
      try {
        await nativeShare(this.card,shareText(this.finalReport,this.content.share));
        get('share-status').textContent='共有メニューに受け渡しました。画像と本文が含まれているか確認してください。';
      } catch(error) {
        get('share-status').textContent=error instanceof Error?error.message:'OS共有に失敗しました';
      }
    });
    get('download-button').addEventListener('click',()=>{ if(this.card) downloadImage(this.card); });
  }
}

void new DerbyApp().boot();
