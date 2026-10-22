import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addStageResult, battingSideSign, buyUpgrade, fenceDistanceAtDirection, fieldFlyoverFrame, flightCameraView, followBat, formatTime, makeRun, pitchDuration, pitchHorizontalX, projectFieldLanding, MAX_ARCADE_DISTANCE_M,
  requiredHomeRuns, stagePoints, summarizeRun, swingContact, validateContent, weightedPick
} from '../src/game/rules.ts';

const mode = {
  id:'normal', name:'NORMAL', enabled:true,
  stageIds:['one','two'], speedMultiplier:1, spreadMultiplier:1, quotaMultiplier:1
};
const stage = {
  id:'one',name:'STAGE 1',pitcherId:'dummy',
  totalPitches:10,requiredHomeruns:3,pitchDurationMs:1700,
  horizontalSpread:90,fenceDistance:180,
  pool:[{id:'fast',type:'straight',effect:'none',weight:1}]
};
const upgradeRules = {
  power:{label:'Power',maxLevel:10,baseCost:100,stepCost:100},
  meet:{label:'Meet',maxLevel:10,baseCost:100,stepCost:100},
  speed:{label:'Speed',maxLevel:10,baseCost:100,stepCost:100}
};

test('weighted selection obeys weights, without replacing all randomness with lanes',()=>{
  const pool=[{id:'a',weight:80},{id:'b',weight:20}];
  assert.equal(weightedPick(pool,()=>0).id,'a');
  assert.equal(weightedPick(pool,()=>0.79).id,'a');
  assert.equal(weightedPick(pool,()=>0.81).id,'b');
  assert.throws(()=>weightedPick([],()=>0));
});

test('continuous horizontal pitch and bat following are smooth',()=>{
  assert.equal(pitchHorizontalX('straight',480,319,1),319);
  assert.equal(pitchHorizontalX('zigzag',480,319,1),319);
  const slow=followBat(480,600,100,1);
  const fast=followBat(480,600,100,9);
  assert(slow>480 && slow<600);
  assert(fast>slow && fast<600);
});

test('hit quality and direction depend on horizontal offset and timing',()=>{
  const perfect=swingContact({offset:0,width:85,timingErrorMs:0,powerLevel:4,fenceDistance:122,random:()=>0.5});
  assert(perfect && perfect.result==='HR');
  const foul=swingContact({offset:40,width:80,timingErrorMs:140,powerLevel:4,fenceDistance:190,random:()=>0.5});
  assert.equal(foul?.result,'FOUL');
  assert.equal(swingContact({offset:81,width:80,timingErrorMs:0,powerLevel:10,fenceDistance:100}),null);
});

test('upgrades consume points, not separate run state',()=>{
  const run=makeRun(mode);
  run.points=300;
  assert(buyUpgrade(run,'power',upgradeRules));
  assert.equal(run.upgrades.power,2);
  assert.equal(run.points,200);
  assert(buyUpgrade(run,'power',upgradeRules));
  assert.equal(run.upgrades.power,3);
  assert.equal(run.points,0);
  assert.equal(buyUpgrade(run,'power',upgradeRules),false);
});

test('stage replay and losses contribute to same run',()=>{
  const run=makeRun(mode);
  const miss={stageId:'one',pitchId:'fast',motion:'straight',effect:'none',result:'MISS',swung:true,contactOffset:null,timingErrorMs:null,distanceM:0};
  const hr={...miss,result:'HR',contactOffset:0,timingErrorMs:2,distanceM:300};
  assert.equal(requiredHomeRuns(stage,mode),3);
  assert.equal(addStageResult(run,stage,[miss],false),stagePoints([miss],false));
  assert.equal(run.retries,1);
  assert.equal(run.records.length,1);
  addStageResult(run,stage,[hr,hr,hr],true);
  assert.equal(run.nextStageIndex,1);
  assert.equal(run.records.length,4);
  assert(run.clearedStages.has('one'));
});

test('run timer, radar and hit summary are derived from pitch history',()=>{
  const run=makeRun(mode);
  run.startedAt=1000;
  run.finishedAt=61000;
  run.records=[
    {stageId:'one',pitchId:'x',motion:'straight',effect:'none',result:'HR',swung:true,contactOffset:0,timingErrorMs:12,distanceM:150},
    {stageId:'one',pitchId:'x',motion:'straight',effect:'none',result:'HIT',swung:true,contactOffset:5,timingErrorMs:15,distanceM:90},
    {stageId:'one',pitchId:'x',motion:'straight',effect:'none',result:'TAKE',swung:false,contactOffset:null,timingErrorMs:null,distanceM:0},
    {stageId:'two',pitchId:'x',motion:'zigzag',effect:'clone',result:'HR',swung:true,contactOffset:0,timingErrorMs:8,distanceM:130}
  ];
  const report=summarizeRun(run);
  assert.equal(report.clearTimeMs,60000);
  assert.equal(report.pitches,4);
  assert.equal(report.homeruns,2);
  assert.equal(report.contactRate,1);
  assert.equal(report.bestDistance,150);
  assert.equal(report.radar[4],100);
  assert.equal(report.longestStreak,1);
  assert.equal(formatTime(60000),'01:00.00');
});

test('first-pass balance: clean hits can be HR while modest contacts are only HIT',()=>{
  const best=swingContact({offset:0,width:80,timingErrorMs:0,powerLevel:1,fenceDistance:122,random:()=>0.5});
  const modest=swingContact({offset:40,width:80,timingErrorMs:75,powerLevel:1,fenceDistance:122,random:()=>0.5});
  assert.equal(best?.result,'HR');
  assert.equal(modest?.result,'HIT');
});

test('batting stance is left by default and both orientations share the same x physics',()=>{
  assert.equal(battingSideSign('left'), 1);
  assert.equal(battingSideSign('right'), -1);
  const config = JSON.parse(readFileSync(new URL('../public/config/game-content.json', import.meta.url), 'utf8'));
  assert.equal(config.gameplay.defaultBattingSide, 'left');
  validateContent(config);
  assert(config.stages.every(s => s.horizontalSpread <= config.gameplay.strikeHalfWidth));
  assert(config.stages[0].pitchDurationMs < 1500);
});

test('first swing response is slower while speed upgrades still matter',()=>{
  const slow=followBat(480,600,100,1);
  const fast=followBat(480,600,100,9);
  assert(slow-480 < 18, 'base movement should not snap toward the cursor');
  assert(fast > slow + 25, 'speed upgrades should remain meaningful');
  assert(fast < 600);
});

test('faster standard pitches retain contrast with the changeup',()=>{
  const cfg=JSON.parse(readFileSync(new URL('../public/config/game-content.json', import.meta.url),'utf8'));
  const expected=[870,740,630];
  cfg.stages.forEach((stage,index)=>{
    assert.equal(stage.pitchDurationMs,expected[index]);
    const base=pitchDuration(stage,cfg.modes[0],'straight');
    const offspeed=pitchDuration(stage,cfg.modes[0],'changeup');
    assert(offspeed > base * 1.5);
  });
});

test('seamless camera keeps the exact original frame at ball contact',()=>{
  const args={
    launchX: 498, launchY: 455, landingX: 625, landingY: 209,
    arcHeight: 185, flightMs: 2000, holdMs: 820,
    viewWidth: 960, viewHeight: 600
  };
  const impact=flightCameraView({...args,elapsedMs:0});
  assert.equal(impact.ballX,args.launchX);
  assert.equal(impact.ballY,args.launchY);
  assert.equal(impact.zoom,1);
  assert.equal(impact.cameraX,0);
  assert.equal(impact.cameraY,0);
  assert.equal(impact.landed,false);
  const near=flightCameraView({...args,elapsedMs:17});
  assert(Math.abs(near.cameraX)<1&&Math.abs(near.cameraY)<1);
  assert(near.ballY<impact.ballY);
  const mid=flightCameraView({...args,elapsedMs:1100});
  assert(mid.zoom>1.05&&mid.zoom<=1.25);
  assert(mid.cameraX<=0&&mid.cameraX>=960*(1-mid.zoom));
  assert(mid.cameraY<=0&&mid.cameraY>=600*(1-mid.zoom));
  const landing=flightCameraView({...args,elapsedMs:args.flightMs});
  assert.equal(landing.landed,true);
  assert.equal(landing.ballX,args.landingX);
  assert(Math.abs(landing.ballY-args.landingY)<0.00001);
  const returned=flightCameraView({...args,elapsedMs:args.flightMs+args.holdMs});
  assert.equal(returned.zoom,1);
  assert.equal(returned.cameraX,0);
  assert.equal(returned.cameraY,0);
  assert.equal(returned.ballX,args.landingX);
  assert(Math.abs(returned.ballY-args.landingY)<0.00001);
});

test('R5 flight field starts at contact, scrolls across the stadium, and fades back',()=>{
  const args={
    launchX:485,launchY:448,direction:.48,distanceM:140,
    outcome:'HR',flightMs:2200,holdMs:820,
    viewWidth:960,viewHeight:600
  };
  const initial=fieldFlyoverFrame({...args,elapsedMs:0});
  assert.equal(initial.ballX,args.launchX);
  assert.equal(initial.ballY,args.launchY);
  assert.equal(initial.alpha,0);
  assert.equal(initial.landed,false);
  const afterOneFrame=fieldFlyoverFrame({...args,elapsedMs:1000/60});
  assert(afterOneFrame.alpha>=0&&afterOneFrame.alpha<.04);
  assert(Math.abs(afterOneFrame.ballX-args.launchX)<10);
  assert(Math.abs(afterOneFrame.ballY-args.launchY)<18);
  const early=fieldFlyoverFrame({...args,elapsedMs:180});
  assert(early.alpha>.85,'field should appear in a fast transition');
  const midpoint=fieldFlyoverFrame({...args,elapsedMs:1100});
  assert.equal(midpoint.alpha,1);
  assert(midpoint.offsetY>initial.offsetY+300,
    'field map needs to travel hundreds of pixels, not merely zoom');
  assert(midpoint.ballY<midpoint.groundY);
  const landed=fieldFlyoverFrame({...args,elapsedMs:args.flightMs});
  assert.equal(landed.landed,true);
  assert(Math.abs(landed.ballY-landed.groundY)<.0001);
  const closing=fieldFlyoverFrame({...args,elapsedMs:args.flightMs+args.holdMs});
  assert.equal(closing.alpha,0);
  const hit=fieldFlyoverFrame({...args,outcome:'HIT',distanceM:90,elapsedMs:args.flightMs});
  assert(hit.offsetY<landed.offsetY,
    'HIT should land infield/shallower than a HR');
});

test('R6 realistic distance range and shared stadium wall match the game config',()=>{
  const cfg=JSON.parse(readFileSync(new URL('../public/config/game-content.json',import.meta.url),'utf8'));
  assert(cfg.stages.every(s=>s.fenceDistance===122),'same baseball park for all opponents');
  assert.equal(fenceDistanceAtDirection(122,0),122);
  assert.equal(fenceDistanceAtDirection(122,.89),100);
  for(const power of [1,4,10,20])for(const random of [0,.25,.5,1]){
    const contact=swingContact({offset:0,width:80,timingErrorMs:0,
      powerLevel:power,fenceDistance:122,random:()=>random});
    assert(contact);
    assert(contact.distanceM<=MAX_ARCADE_DISTANCE_M);
    assert(contact.distanceM>=40);
  }
});

test('R6 a HR visibly lands outside the wall while a HIT stays on the field',()=>{
  for(const direction of [-.85,-.5,0,.5,.85]){
    const wall=fenceDistanceAtDirection(122,direction);
    const hit=projectFieldLanding(Math.floor(wall-1),direction,122);
    const hr=projectFieldLanding(Math.ceil(wall+1),direction,122);
    assert(hit.fair&&hr.fair);
    assert.equal(hit.crossedFence,false);
    assert.equal(hr.crossedFence,true);
    assert(hit.worldY>hit.fenceY,'HIT lands between plate and fence');
    assert(hr.worldY<hr.fenceY-35,'HR must visibly clear the drawn fence/wall');
    // Wall positions follow M0 590 Q1100 180 2200 590 from flight-field.svg.
    const fraction=(hr.fenceX-1100)/1100;
    const svgFence=385+205*fraction*fraction;
    assert(Math.abs(hr.fenceY-svgFence)<1e-8);
    const flight=fieldFlyoverFrame({
      launchX:480,launchY:456,direction,distanceM:Math.ceil(wall+1),
      centerFenceDistanceM:122,outcome:'HR',
      elapsedMs:1800,flightMs:1800,holdMs:1250,
      viewWidth:960,viewHeight:600
    });
    assert.equal(flight.landed,true);
    assert.equal(flight.visiblyOverFence,true);
    assert(flight.groundY<flight.fenceY-35,'flyover and scorer use the SAME wall');
    const shallower=fieldFlyoverFrame({
      launchX:480,launchY:456,direction,distanceM:Math.floor(wall-1),
      centerFenceDistanceM:122,outcome:'HIT',
      elapsedMs:1800,flightMs:1800,holdMs:820,
      viewWidth:960,viewHeight:600
    });
    assert(!shallower.visiblyOverFence);
    assert(shallower.groundY>shallower.fenceY,'in-play hit landing is before fence');
  }
});

test('R6 borderline fence and foul positions never produce false HR',()=>{
  assert.equal(projectFieldLanding(122,0,122).crossedFence,false);
  for(const direction of [-1.05,-.92,.92,1.05]){
    const distant=projectFieldLanding(160,direction,122);
    assert.equal(distant.fair,false);
    assert.equal(distant.crossedFence,false);
  }
  for(const offset of [-38,0,38])for(const timing of [-70,0,70]){
    for(const power of [1,4,9]){
      const swing=swingContact({
        offset,width:80,timingErrorMs:timing,powerLevel:power,
        fenceDistance:122,random:()=>.5
      });
      assert(swing);
      const landing=projectFieldLanding(swing.distanceM,swing.direction,122);
      assert.equal(swing.result,landing.fair
        ? landing.crossedFence?'HR':'HIT' : 'FOUL');
    }
  }
});
