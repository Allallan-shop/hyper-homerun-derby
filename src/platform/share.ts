import { formatTime, type GameContent, type RunReport } from '../game/rules';

export function publishedGameUrl(configured: string): string {
  if (configured) return configured;
  const url = new URL(window.location.href);
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') ||
      ['localhost','127.0.0.1'].includes(url.hostname)) return '';
  return url.origin + url.pathname;
}
export function shareText(report: RunReport, share: GameContent['share']): string {
  const site = publishedGameUrl(share.gameUrl);
  return [
    `${share.headline} をクリア！`,
    `タイム ${formatTime(report.clearTimeMs)} / ${report.homeruns}HR / 最大飛距離 ${report.bestDistance.toLocaleString('ja-JP')}m`,
    `#${share.hashtag.replace(/^#+/, '')}`,
    site
  ].filter(Boolean).join('\n');
}
export function openXComposer(text: string): void {
  const url='https://twitter.com/intent/tweet?text='+encodeURIComponent(text);
  const opened=window.open(url,'_blank','noopener,noreferrer');
  if (!opened) window.location.href=url;
}
export async function copyImage(blob: Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('このブラウザは画像コピーに対応していません');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
export function downloadImage(blob: Blob): void {
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download='hyper-homerun-derby-result.png';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1200);
}
export function supportsNativeShare(blob: Blob): boolean {
  if (!navigator.canShare || !navigator.share) return false;
  return navigator.canShare({ files: [new File([blob], 'hyper-homerun-derby.png', { type: 'image/png' })] });
}
export async function nativeShare(blob: Blob, text: string): Promise<void> {
  const file=new File([blob],'hyper-homerun-derby.png',{type:'image/png'});
  if (!navigator.share || !navigator.canShare?.({ files:[file] })) {
    throw new Error('OSの画像共有には対応していません');
  }
  // Destination apps may ignore text or URL: this is best effort, not an X API.
  await navigator.share({ files:[file], text });
}
