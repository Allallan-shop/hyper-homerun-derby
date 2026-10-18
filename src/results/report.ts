import { clamp, formatTime, type RunReport } from '../game/rules';

const AXES = ['ミート', '本塁打', 'タイミング', '連打', '飛距離'];
const number = (n: number) => n.toLocaleString('ja-JP');
const percentage = (n: number) => (n * 100).toFixed(1) + '%';

export function statsRows(report: RunReport): [string, string][] {
  return [
    ['総投球', number(report.pitches)],
    ['総ホームラン', number(report.homeruns) + ' 本'],
    ['ホームラン率', percentage(report.homeRunRate)],
    ['ミート率', percentage(report.contactRate)],
    ['最長連続ホームラン', number(report.longestStreak) + ' 本'],
    ['再挑戦回数', number(report.retries) + ' 回'],
    ['平均タイミング誤差', report.averageTimingErrorMs === null ? '—' : report.averageTimingErrorMs.toFixed(1) + ' ms']
  ];
}
export function radarMarkup(report: RunReport): string {
  const x = 190;
  const y = 183;
  const radius = 114;
  const point = (i: number, ratio: number) => {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
    return `${(x + Math.cos(a) * radius * ratio).toFixed(1)},${(y + Math.sin(a) * radius * ratio).toFixed(1)}`;
  };
  const grids = [0.25, 0.5, 0.75, 1].map(r =>
    `<polygon points="${AXES.map((_,i) => point(i,r)).join(' ')}" fill="none" stroke="#6e889a" stroke-width="1" opacity=".55"/>`).join('');
  const lines = AXES.map((_,i) => {
    const [px,py] = point(i,1).split(',');
    return `<line x1="${x}" y1="${y}" x2="${px}" y2="${py}" stroke="#637d8e" opacity=".5"/>`;
  }).join('');
  const poly = AXES.map((_,i) => point(i,clamp(report.radar[i] / 100,0,1))).join(' ');
  const labelPos: [number,number][] = [[190,40],[339,143],[278,346],[105,346],[39,143]];
  const labels = AXES.map((axis,i)=>`<text x="${labelPos[i][0]}" y="${labelPos[i][1]}" fill="#ddf7ef" font-size="16" text-anchor="middle">${axis}</text>`).join('');
  return `<svg viewBox="0 0 380 365" role="img" aria-label="プレイ成績の5軸レーダーチャート" xmlns="http://www.w3.org/2000/svg">${grids}${lines}<polygon points="${poly}" fill="#4eddb7" fill-opacity=".33" stroke="#65f2c4" stroke-width="3"/>${labels}</svg>`;
}
export function makeShareCard(report: RunReport, gameName: string, hashtag: string): Promise<Blob> {
  const size = 1200;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return Promise.reject(new Error('Canvas描画が利用できません'));
  const drawRounded = (x:number,y:number,w:number,h:number,r:number,color:string) => {
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x,y,w,h,r);
    g.fill();
  };
  const line = (x1:number,y1:number,x2:number,y2:number,color:string,width=2) => {
    g.strokeStyle = color;g.lineWidth=width;g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();
  };
  const label = (str:string,x:number,y:number,px:number,color:string,weight='600',align:CanvasTextAlign='left') => {
    g.textAlign=align;g.fillStyle=color;g.font=`${weight} ${px}px system-ui, sans-serif`;g.fillText(str,x,y);
  };
  g.fillStyle='#122438';g.fillRect(0,0,size,size);
  drawRounded(66,64,1068,1072,28,'#1c344a');
  line(94,190,1106,190,'#456075',3);
  label(gameName.toUpperCase().slice(0,34),104,128,34,'#e9f8f7','800');
  label('GAME CLEAR!',104,174,29,'#63e8b5','800');
  drawRounded(870,130,230,50,12,'#325b60');
  label(report.mode,985,163,25,'#fff','700','center');
  drawRounded(96,226,492,218,20,'#28465c');
  drawRounded(611,226,492,218,20,'#28465c');
  label('CLEAR TIME',127,283,27,'#c1d6df');
  label(formatTime(report.clearTimeMs),127,379,72,'#ffffff','900');
  label('MAX DISTANCE',641,283,27,'#c1d6df');
  label(number(report.bestDistance)+'m',641,379,72,'#ffffff','900');
  label('PLAYER ANALYSIS',112,504,30,'#e4f6f3','800');
  label('BATTING STATS',644,504,30,'#e4f6f3','800');
  const cx=341, cy=754, radius=195;
  const polygon=(level:number) => {
    g.beginPath();
    for(let i=0;i<5;i++){
      const a=-Math.PI/2+i*Math.PI*2/5;
      const x=cx+Math.cos(a)*radius*level,y=cy+Math.sin(a)*radius*level;
      if(i===0)g.moveTo(x,y);else g.lineTo(x,y);
    }g.closePath();
  };
  for(const level of [.25,.5,.75,1]){polygon(level);g.strokeStyle='#54758a';g.lineWidth=2;g.stroke();}
  polygon(1); // axis lines from the center to vertices
  for(let i=0;i<5;i++){
    const a=-Math.PI/2+i*Math.PI*2/5;
    line(cx,cy,cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,'#54758a',2);
  }
  g.beginPath();
  for(let i=0;i<5;i++){
    const a=-Math.PI/2+i*Math.PI*2/5;
    const v=clamp(report.radar[i]/100,0,1);
    const x=cx+Math.cos(a)*radius*v,y=cy+Math.sin(a)*radius*v;
    if(!i)g.moveTo(x,y);else g.lineTo(x,y);
  }g.closePath();
  g.fillStyle='rgba(67,213,173,.32)';g.fill();
  g.strokeStyle='#6ff3c8';g.lineWidth=6;g.stroke();
  const labelPositions:[number,number][]=[[341,531],[566,714],[480,1004],[193,1004],[110,714]];
  AXES.forEach((name,i)=>label(name,labelPositions[i][0],labelPositions[i][1],21,'#e3f2f0','700','center'));
  const rows:[string,string][]=[
    ['総ホームラン',number(report.homeruns)+' HR'],
    ['本塁打率',percentage(report.homeRunRate)],
    ['ミート率',percentage(report.contactRate)],
    ['最長連続HR',number(report.longestStreak)+' 本'],
    ['再挑戦',number(report.retries)+' 回']
  ];
  rows.forEach(([name,value],i)=>{
    const y=597+i*82;
    label(name,647,y,26,'#b9d1dc');
    label(value,1082,y,31,'#ffffff','800','right');
    line(644,y+24,1084,y+24,'#445c72',2);
  });
  line(96,1047,1104,1047,'#49657a',2);
  const tag='#'+hashtag.replace(/^#+/,'');
  label(tag,600,1104,33,'#64e8b7','800','center');
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG画像の生成に失敗しました')),'image/png');
  });
}
