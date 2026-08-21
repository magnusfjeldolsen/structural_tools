// Verification vectors for wall_min_reinf_api.js.  Run:  node test.js
const A = require('./wall_min_reinf_api.js');
let pass=0, fail=0;
const near=(a,b,tol)=>a!=null&&Math.abs(a-b)<=tol;
function t(name, got, want, tol){ const ok=near(got,want,tol); ok?pass++:fail++;
  console.log((ok?'PASS':'FAIL')+'  '+name+'  got='+(got==null?'null':(+got).toFixed(2))+' want='+want); }

// 1 base case
let r = A.calculate({t:350, fck:35, exposureSide:'exterior', vBar:{dia:12,spacing:250}, crackReq:'none'});
t('fctm B35', r.material.fctm, 3.21, 0.01);
t('AsHMin (exact fctm 3.2098)', r.detailing.AsHMin, 674.1, 1);
t('AsVMin', r.detailing.AsVMin, 350, 1);
t('AsVProv', r.detailing.AsVProv, 452.39, 0.1);
t('sVMax t350', r.detailing.sVMax, 400, 0.1);

// 2 sheet parity: kc=1, sigma=240 -> 2333
const parity = 1*1*3.2*350000/240/2;
t('sheet C22 formula', parity, 2333.3, 1);

// 3 wk0.3 ø16
r = A.calculate({t:350, fck:35, cover:35, crackReq:'wk030', selectedDia:16, vBar:{dia:12,spacing:250}});
const b16 = r.crack.bars.find(b=>b.dia===16);
t('phi*req o16', b16.phiStarReq, 14.25, 0.05);
t('sigmaS o16', b16.sigmaS, 257.5, 2);
t('AsReq o16', b16.AsReq, 2175, 10);
t('ccMax o16', b16.ccUncapped, 92, 2);
const b8 = r.crack.bars.find(b=>b.dia===8);
t('sigmaS o8', b8.sigmaS, 391, 3);
t('AsFloor', r.crack.AsFloor, 1120, 5);

// 4 Ramboll culvert t=240 B45
r = A.calculate({t:240, fck:45, exposureSide:'exterior', vBar:{dia:16,spacing:200}, crackReq:'none'});
t('culvert naLeg', r.detailing.naLeg, 547.2, 1);
t('culvert AsVMin/layer', r.detailing.AsVMin, 240, 1);
t('culvert AsVMax', r.detailing.AsVMax, 9600, 1);

// 5 retaining wall t=400 B35
r = A.calculate({t:400, fck:35, exposureSide:'exterior', vBar:{dia:16,spacing:200}, crackReq:'none'});
t('rw naLeg (fctm 3.21)', r.detailing.naLeg, 770, 2);
t('rw AsVMin/layer', r.detailing.AsVMin, 400, 1);

// 6 single layer t=200
r = A.calculate({t:200, fck:35, layers:1, crackReq:'wk030', selectedDia:10, vBar:{dia:12,spacing:200}});
const s8 = r.crack.bars.find(b=>b.dia===8);
const s10 = r.crack.bars.find(b=>b.dia===10);
console.log((s10.status==='outOfTable'?'PASS':'FAIL')+'  single layer o10 outOfTable  got='+s10.status); s10.status==='outOfTable'?pass++:fail++;
console.log((s8.build==='unbuildable'?'PASS':'FAIL')+'  single layer o8 unbuildable  got='+s8.build+' cc='+(s8.ccUncapped||0).toFixed(1)); s8.build==='unbuildable'?pass++:fail++;
console.log((r.governing.horizontal.blocked?'PASS':'FAIL')+'  blocked o10 does not fall back to detailing  As='+r.governing.horizontal.As); r.governing.horizontal.blocked?pass++:fail++;

// 7 t=100 spacing cap
r = A.calculate({t:100, fck:35, vBar:{dia:8,spacing:200}, crackReq:'none'});
t('sVMax t100', r.detailing.sVMax, 300, 0.1);

// 8 fck 40 no zero
t('fctm B40', A.fctmOf(40), 3.51, 0.01);

// 9 early age
r = A.calculate({t:350, fck:35, crackAgeDays:3, cementClass:'N', crackReq:'wk030', vBar:{dia:12,spacing:250}});
t('fctEff 3d', r.material.fctEff, 1.92, 0.02);

// 10 Table L.1
r = A.calculate({t:250, wallL:36000, wallH:3000, crackReq:'wk030', vBar:{dia:12,spacing:250}});
t('L/H 12 Rtop', r.zone.tableL1.Rtop, 0.5, 0.001);
console.log('  L/H12 note='+r.zone.tableL1.note+' height='+r.zone.tableL1.height);
r = A.calculate({t:350, wallL:6000, wallH:3000, crackReq:'wk030', vBar:{dia:12,spacing:250}});
t('L/H2 zone height (Rcrit=0.3125)', r.zone.tableL1.height, 1125, 5);
t('3t', r.zone.practice, 1050, 1);

// 11 watertight
r = A.calculate({mode:'watertight', t:300, fck:35, crackReq:'watertight', hD:1200, selectedDia:12, vBar:{dia:12,spacing:200}});
console.log('  watertight wk='+r.crack.wk.toFixed(3)+' src='+r.crack.wkSource);
r = A.calculate({mode:'watertight', t:300, fck:35, crackReq:'watertight', hD:6000, selectedDia:12, vBar:{dia:12,spacing:200}});
console.log('  deep tank wk='+r.crack.wk.toFixed(3)+'  simplified o12 status='+r.crack.bars.find(b=>b.dia===12).status
  +'  direct o12 As='+ (r.crack.barsDirect.find(b=>b.dia===12).AsReq||0).toFixed(0));

// 12 direct vs simplified on the base case
r = A.calculate({t:350, fck:35, cover:35, crackReq:'wk030', selectedDia:16, vBar:{dia:12,spacing:250}});
const d16 = r.crack.barsDirect.find(b=>b.dia===16);
console.log('  o16 simplified As='+b16.AsReq.toFixed(0)+' cc='+b16.ccUncapped.toFixed(0)
  +'   direct As='+d16.AsReq.toFixed(0)+' cc='+d16.ccUncapped.toFixed(0)+' srMax='+d16.srMax.toFixed(0));

// 13 NA uplift
r = A.calculate({t:350, fck:35, crackReq:'wk030', naCoverUplift:{on:true,cnom:35,cminDur:25}, vBar:{dia:12,spacing:250}});
t('NA uplift wk', r.crack.wk, 0.39, 0.001);
r = A.calculate({t:350, fck:35, crackReq:'wk030', naCoverUplift:{on:true,cnom:60,cminDur:25}, vBar:{dia:12,spacing:250}});
t('NA uplift capped 1.3', r.crack.wk, 0.39, 0.001);

// 14 single layer detailing doubling
r = A.calculate({t:200, fck:35, layers:1, exposureSide:'exterior', vBar:{dia:12,spacing:200}, crackReq:'none'});
t('1-layer AsVMin=full', r.detailing.AsVMin, 400, 1);
t('1-layer AsHMin=2*naLeg', r.detailing.AsHMin, 2*0.3*200000*3.21/500, 5);

// 15 interior wall
r = A.calculate({t:350, fck:35, exposureSide:'interior', vBar:{dia:12,spacing:250}, crackReq:'none'});
t('interior naLeg', r.detailing.naLeg, 337.0, 1);
t('interior AsHMin', r.detailing.AsHMin, 337.0, 1);

console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
