import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addStageResult, buyUpgrade, followBat, formatTime, makeRun, pitchHorizontalX,
  requiredHomeRuns, stagePoints, summarizeRun, swingContact, weightedPick
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
  const perfect=swingContact({offset:0,width:85,timingErrorMs:0,powerLevel:4,fenceDistance:190,random:()=>0.5});
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
    {stageId:'one',pitchId:'x',motion:'straight',effect:'none',result:'HR',swung:true,contactOffset:0,timingErrorMs:12,distanceM:1000},
    {stageId:'one',pitchId:'x',motion:'straight',effect:'none',result:'HIT',swung:true,contactOffset:5,timingErrorMs:15,distanceM:190},
    {stageId:'one',pitchId:'x',motion:'straight',effect:'none',result:'TAKE',swung:false,contactOffset:null,timingErrorMs:null,distanceM:0},
    {stageId:'two',pitchId:'x',motion:'zigzag',effect:'clone',result:'HR',swung:true,contactOffset:0,timingErrorMs:8,distanceM:260}
  ];
  const report=summarizeRun(run);
  assert.equal(report.clearTimeMs,60000);
  assert.equal(report.pitches,4);
  assert.equal(report.homeruns,2);
  assert.equal(report.contactRate,1);
  assert.equal(report.bestDistance,1000);
  assert.equal(report.radar[4],100);
  assert.equal(report.longestStreak,1);
  assert.equal(formatTime(60000),'01:00.00');
});

test('first-pass balance: clean hits can be HR while modest contacts are only HIT',()=>{
  const best=swingContact({offset:0,width:80,timingErrorMs:0,powerLevel:1,fenceDistance:225,random:()=>0.5});
  const modest=swingContact({offset:40,width:80,timingErrorMs:75,powerLevel:1,fenceDistance:225,random:()=>0.5});
  assert.equal(best?.result,'HR');
  assert.equal(modest?.result,'HIT');
});
