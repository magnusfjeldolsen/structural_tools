/**
 * Self-contained interactive HTML: temperature field on a canvas with a time slider,
 * probe curves with a draggable time cursor, draggable/clickable probes recomputed
 * from the embedded snapshots, hover readout, isotherm toggle, themes. No external
 * resources, works from file://, can be emailed.
 */
import type { Project, RunResult } from '@thermo2d/core';
import { esc } from './svg.js';
import type { Lang } from './strings.js';

export interface InteractiveOptions {
  project: Project;
  results: { label: string; result: RunResult }[];
  title?: string;
  lang?: Lang;
  /** Keep at most this many snapshots per result (evenly thinned) to bound file size. Default 61. */
  maxSnapshots?: number;
  bands?: { min: number; max: number; step: number };
  isotherms?: number[];
}

function b64(bytes: Uint8Array): string {
  // Node and browser safe base64.
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}

const f32 = (a: ArrayLike<number>) => b64(new Uint8Array(Float32Array.from(a).buffer));
const u32 = (a: ArrayLike<number>) => b64(new Uint8Array(Uint32Array.from(a).buffer));

export function interactiveHtml(o: InteractiveOptions): string {
  const p = o.project;
  const lang = o.lang ?? p.settings.language ?? 'nb';
  const maxSnap = o.maxSnapshots ?? 61;
  const results = o.results.map(({ label, result: r }) => {
    const nSnap = r.times.length;
    const keep: number[] = [];
    if (nSnap <= maxSnap) for (let i = 0; i < nSnap; i++) keep.push(i);
    else for (let k = 0; k < maxSnap; k++) keep.push(Math.round((k * (nSnap - 1)) / (maxSnap - 1)));
    return {
      label,
      nodes: f32(r.mesh.nodes),
      tris: u32(r.mesh.triangles),
      boundary: r.mesh.boundary.map((s) => [s.a, s.b]),
      elementRegion: Array.from(r.mesh.elementRegion),
      times: keep.map((i) => r.times[i]),
      fields: keep.map((i) => f32(r.fields[i])),
      probeTimes: f32(r.probeTimes),
      probeValues: r.probeValues.map((v) => f32(v)),
      probes: r.probes.map((q) => ({ id: q.id, name: p.probes.find((x) => x.id === q.id)?.name ?? q.id, x: q.position[0], y: q.position[1], found: q.found })),
    };
  });
  const data = {
    title: o.title ?? p.name,
    lang,
    bands: o.bands ?? { min: 0, max: 1100, step: 100 },
    isotherms: o.isotherms ?? [500],
    rebars: p.rebars.map((b) => ({ name: b.name, x: b.centre[0], y: b.centre[1], d: b.diameter })),
    regions: p.regions.map((r) => ({ name: r.name, outer: r.polygon.outer, holes: r.polygon.holes })),
    fire: (() => {
      const bc = p.boundaryConditions.find((b) => b.type === 'convection-radiation');
      const sid = bc && 'gasSeriesId' in bc ? bc.gasSeriesId : undefined;
      const s = sid ? p.timeSeries.find((x) => x.id === sid) : undefined;
      return s ? { name: s.name, points: s.points } : null;
    })(),
    results,
  };
  const S = lang === 'nb'
    ? { time: 'Tid', play: 'Spill av', pause: 'Pause', isotherm: 'Isoterm', mesh: 'Nett', theme: 'Tema', result: 'Resultat', hint: 'Klikk i tverrsnittet for å legge til et målepunkt. Dra et punkt for å flytte det. Dra den loddrette linja i diagrammet for å endre tid.', probes: 'Målepunkter', remove: 'Fjern', fire: 'Kurve', csv: 'CSV', clear: 'Fjern midlertidige' }
    : { time: 'Time', play: 'Play', pause: 'Pause', isotherm: 'Isotherm', mesh: 'Mesh', theme: 'Theme', result: 'Result', hint: 'Click in the section to add a probe. Drag a probe to move it. Drag the vertical line in the chart to change the time.', probes: 'Probes', remove: 'Remove', fire: 'Curve', csv: 'CSV', clear: 'Clear temporary' };
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(data.title)}</title>
<style>
:root{--bg:#fff;--fg:#1b1f24;--muted:#6b7280;--grid:#e5e7eb;--panel:#f8fafc;--accent:#2563eb}
[data-theme=dark]{--bg:#0f172a;--fg:#e5e7eb;--muted:#94a3b8;--grid:#1f2937;--panel:#111827;--accent:#60a5fa}
[data-theme=print]{--bg:#fff;--fg:#000;--muted:#333;--grid:#ccc;--panel:#fff;--accent:#000}
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Arial,sans-serif;background:var(--bg);color:var(--fg);font-size:13px}
header{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--grid)}h1{font-size:16px;margin:0 12px 0 0}
main{display:grid;grid-template-columns:minmax(320px,1fr) minmax(320px,1fr);gap:10px;padding:10px 14px}@media(max-width:900px){main{grid-template-columns:1fr}}
.panel{background:var(--panel);border:1px solid var(--grid);border-radius:6px;padding:8px}canvas{width:100%;display:block;touch-action:none}
label{display:inline-flex;align-items:center;gap:4px;color:var(--muted)}input[type=range]{width:220px}button,select,input[type=number]{font:inherit;background:var(--bg);color:var(--fg);border:1px solid var(--grid);border-radius:4px;padding:3px 8px}
.readout{font-variant-numeric:tabular-nums;color:var(--muted);min-height:18px;padding:4px 2px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid var(--grid);padding:3px 6px;text-align:left}td.num{text-align:right;font-variant-numeric:tabular-nums}
.hint{color:var(--muted);font-size:12px;padding:0 14px 10px}@media print{header button,header select,header input,.hint{display:none}main{grid-template-columns:1fr}}
</style></head><body>
<header><h1>${esc(data.title)}</h1>
<label>${S.result} <select id="res"></select></label>
<label>${S.time} <input id="time" type="range" min="0" max="1" step="any" value="0"> <span id="tlabel"></span></label>
<button id="play">${S.play}</button>
<label><input id="iso" type="checkbox" checked> ${S.isotherm} <input id="isoval" type="number" value="${data.isotherms[0] ?? 500}" step="50" style="width:70px"> °C</label>
<label><input id="meshchk" type="checkbox"> ${S.mesh}</label>
<label>${S.theme} <select id="theme"><option value="light">light</option><option value="dark">dark</option><option value="print">print</option></select></label>
<button id="csv">${S.csv}</button><button id="clear">${S.clear}</button>
</header>
<div class="hint">${S.hint}</div>
<main>
<div class="panel"><canvas id="field" height="520"></canvas><div class="readout" id="fread"></div></div>
<div class="panel"><canvas id="chart" height="360"></canvas><div class="readout" id="cread"></div><table id="ptable"><thead><tr><th>${S.probes}</th><th>x</th><th>y</th><th>θ</th><th></th></tr></thead><tbody></tbody></table></div>
</main>
<script id="data" type="application/json">${json}</script>
<script>
(function(){
const D=JSON.parse(document.getElementById('data').textContent);
const S=${JSON.stringify(S)};
function dec(b64,T){const s=atob(b64),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return new T(u.buffer);}
D.results.forEach(r=>{r.nodes=dec(r.nodes,Float32Array);r.tris=dec(r.tris,Uint32Array);r.fields=r.fields.map(f=>dec(f,Float32Array));r.probeTimes=dec(r.probeTimes,Float32Array);r.probeValues=r.probeValues.map(v=>dec(v,Float32Array));
 // spatial grid for point location
 const n=r.nodes,t=r.tris;let minX=1e30,minY=1e30,maxX=-1e30,maxY=-1e30;for(let i=0;i<n.length;i+=2){if(n[i]<minX)minX=n[i];if(n[i]>maxX)maxX=n[i];if(n[i+1]<minY)minY=n[i+1];if(n[i+1]>maxY)maxY=n[i+1];}
 const nt=t.length/3,G=Math.max(4,Math.floor(Math.sqrt(nt)));const cells=new Array(G*G);for(let i=0;i<G*G;i++)cells[i]=[];const cw=(maxX-minX)/G||1,ch=(maxY-minY)/G||1;
 for(let e=0;e<nt;e++){const a=t[3*e],b=t[3*e+1],c=t[3*e+2];const xs=[n[2*a],n[2*b],n[2*c]],ys=[n[2*a+1],n[2*b+1],n[2*c+1]];const i0=Math.max(0,Math.floor((Math.min(...xs)-minX)/cw)),i1=Math.min(G-1,Math.floor((Math.max(...xs)-minX)/cw)),j0=Math.max(0,Math.floor((Math.min(...ys)-minY)/ch)),j1=Math.min(G-1,Math.floor((Math.max(...ys)-minY)/ch));for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++)cells[j*G+i].push(e);}
 r.box={minX,minY,maxX,maxY};r.locate=function(x,y){const i=Math.floor((x-minX)/cw),j=Math.floor((y-minY)/ch);if(i<0||j<0||i>=G||j>=G)return null;for(const e of cells[j*G+i]){const a=t[3*e],b=t[3*e+1],c=t[3*e+2];const x1=n[2*a],y1=n[2*a+1],x2=n[2*b],y2=n[2*b+1],x3=n[2*c],y3=n[2*c+1];const det=(x2-x1)*(y3-y1)-(x3-x1)*(y2-y1);if(Math.abs(det)<1e-12)continue;const l2=((x-x1)*(y3-y1)-(x3-x1)*(y-y1))/det,l3=((x2-x1)*(y-y1)-(x-x1)*(y2-y1))/det,l1=1-l2-l3;const eps=-1e-6;if(l1>=eps&&l2>=eps&&l3>=eps)return{e,a,b,c,l1,l2,l3};}return null;};
 r.value=function(loc,field){return field[loc.a]*loc.l1+field[loc.b]*loc.l2+field[loc.c]*loc.l3;};
 r.series=function(x,y){const loc=r.locate(x,y);if(!loc)return null;return{t:r.times,v:r.fields.map(f=>r.value(loc,f))};};
});
const STOPS=[[0,[30,60,200]],[.12,[40,130,240]],[.25,[40,200,220]],[.37,[60,200,90]],[.5,[220,220,40]],[.62,[250,160,30]],[.75,[230,60,30]],[.87,[200,30,120]],[1,[255,255,255]]];
function seq(u){u=Math.max(0,Math.min(1,u));for(let i=1;i<STOPS.length;i++){if(u<=STOPS[i][0]){const[u0,c0]=STOPS[i-1],[u1,c1]=STOPS[i];const f=(u-u0)/(u1-u0||1);return 'rgb('+c0.map((a,k)=>Math.round(a+(c1[k]-a)*f)).join(',')+')';}}return 'rgb(255,255,255)';}
const B=D.bands,NB=Math.max(1,Math.round((B.max-B.min)/B.step));function band(v){const k=Math.max(0,Math.min(NB-1,Math.floor((v-B.min)/B.step)));return seq(NB===1?.5:k/(NB-1));}
const COL=['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2','#db2777','#65a30d','#9333ea','#ea580c'];
let ri=0,R=D.results[0],ti=0,playing=false,timer=null,probes=[],drag=null,dragCursor=false,hoverT=null;
const $=id=>document.getElementById(id);const fc=$('field'),cc=$('chart'),fx=fc.getContext('2d'),cx=cc.getContext('2d');
const resSel=$('res');D.results.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=r.label;resSel.appendChild(o);});
function initProbes(){probes=R.probes.filter(p=>p.found).map((p,i)=>({name:p.name,x:p.x,y:p.y,fixed:true,color:COL[i%COL.length],series:{t:R.probeTimes,v:R.probeValues[i]}}));}
initProbes();
function tval(){return R.times[ti];}
const tSlider=$('time');tSlider.max=Math.max(0,R.times.length-1);tSlider.step=1;
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function fit(){const W=fc.width,H=fc.height,m=40;const b=R.box,w=b.maxX-b.minX||1,h=b.maxY-b.minY||1;const s=Math.min((W-2*m-70)/w,(H-2*m)/h);const cxm=(b.minX+b.maxX)/2,cym=(b.minY+b.maxY)/2,pcx=(W-70)/2,pcy=H/2;return{x:v=>pcx+(v-cxm)*s,y:v=>pcy-(v-cym)*s,ix:px=>cxm+(px-pcx)/s,iy:py=>cym-(py-pcy)/s,s};}
function drawField(){const dpr=window.devicePixelRatio||1;fc.width=fc.clientWidth*dpr;fc.height=520*dpr;fx.setTransform(dpr,0,0,dpr,0,0);const W=fc.clientWidth,H=520;fx.fillStyle=css('--bg');fx.fillRect(0,0,W,H);
 const F=fit(),n=R.nodes,t=R.tris,f=R.fields[ti],showMesh=$('meshchk').checked;
 for(let e=0;e<t.length;e+=3){const a=t[e],b=t[e+1],c=t[e+2];const v=(f[a]+f[b]+f[c])/3;fx.fillStyle=band(v);fx.beginPath();fx.moveTo(F.x(n[2*a]),F.y(n[2*a+1]));fx.lineTo(F.x(n[2*b]),F.y(n[2*b+1]));fx.lineTo(F.x(n[2*c]),F.y(n[2*c+1]));fx.closePath();fx.fill();if(showMesh){fx.strokeStyle='rgba(0,0,0,.25)';fx.lineWidth=.4;fx.stroke();}else{fx.strokeStyle=fx.fillStyle;fx.lineWidth=.5;fx.stroke();}}
 fx.strokeStyle=css('--fg');fx.lineWidth=1;fx.beginPath();for(const[a,b]of R.boundary){fx.moveTo(F.x(n[2*a]),F.y(n[2*a+1]));fx.lineTo(F.x(n[2*b]),F.y(n[2*b+1]));}fx.stroke();
 for(const rg of D.regions){fx.beginPath();[rg.outer,...rg.holes].forEach(r=>{r.forEach((p,i)=>i?fx.lineTo(F.x(p[0]),F.y(p[1])):fx.moveTo(F.x(p[0]),F.y(p[1])));fx.closePath();});fx.stroke();}
 if($('iso').checked){const th=+$('isoval').value;fx.strokeStyle=css('--fg');fx.lineWidth=1.5;fx.beginPath();for(let e=0;e<t.length;e+=3){const idx=[t[e],t[e+1],t[e+2]],pts=[];for(let k=0;k<3;k++){const i=idx[k],j=idx[(k+1)%3],vi=f[i],vj=f[j];if((vi<th&&vj>=th)||(vj<th&&vi>=th)){const g=(th-vi)/(vj-vi);pts.push([n[2*i]+(n[2*j]-n[2*i])*g,n[2*i+1]+(n[2*j+1]-n[2*i+1])*g]);}}if(pts.length===2){fx.moveTo(F.x(pts[0][0]),F.y(pts[0][1]));fx.lineTo(F.x(pts[1][0]),F.y(pts[1][1]));}}fx.stroke();}
 for(const b of D.rebars){fx.beginPath();fx.arc(F.x(b.x),F.y(b.y),Math.max(2,b.d/2*F.s),0,6.283);fx.fillStyle='#475569';fx.fill();fx.strokeStyle=css('--fg');fx.lineWidth=.8;fx.stroke();}
 probes.forEach(p=>{const loc=R.locate(p.x,p.y);const v=loc?R.value(loc,f):NaN;fx.beginPath();fx.arc(F.x(p.x),F.y(p.y),5,0,6.283);fx.fillStyle=css('--bg');fx.fill();fx.strokeStyle=p.color;fx.lineWidth=2;fx.stroke();fx.fillStyle=css('--fg');fx.font='11px sans-serif';fx.fillText(p.name+': '+(isFinite(v)?Math.round(v)+' °C':'–'),F.x(p.x)+7,F.y(p.y)-6);});
 // colour bar
 const bx=W-52,by=20,bh=H-60;for(let k=0;k<NB;k++){fx.fillStyle=band(B.min+(k+.5)*B.step);fx.fillRect(bx,by+bh-(k+1)/NB*bh,14,bh/NB+.5);}fx.fillStyle=css('--fg');fx.font='10px sans-serif';for(let k=0;k<=NB;k+=NB>12?Math.ceil(NB/12):1){fx.fillText(Math.round(B.min+k*B.step),bx+18,by+bh-k/NB*bh+3);}fx.fillText('°C',bx,by-6);
 $('tlabel').textContent=(tval()/60).toFixed(1)+' min';
}
function drawChart(){const dpr=window.devicePixelRatio||1;cc.width=cc.clientWidth*dpr;cc.height=360*dpr;cx.setTransform(dpr,0,0,dpr,0,0);const W=cc.clientWidth,H=360,L=50,Rm=14,T=14,Bm=44;cx.fillStyle=css('--panel');cx.fillRect(0,0,W,H);
 const lines=[];probes.forEach(p=>{if(p.series)lines.push({name:p.name,t:p.series.t,v:p.series.v,color:p.color});});
 // other results overlay for fixed probes
 D.results.forEach((r,k)=>{if(k===ri)return;probes.forEach(p=>{const j=r.probes.findIndex(q=>q.name===p.name);if(j>=0&&p.fixed)lines.push({name:p.name+' – '+r.label,t:r.probeTimes,v:r.probeValues[j],color:p.color,dash:[5,3]});});});
 if(D.fire)lines.push({name:D.fire.name,t:D.fire.points.map(q=>q[0]),v:D.fire.points.map(q=>q[1]),color:css('--muted'),dash:[6,3]});
 let t1=R.times[R.times.length-1]||1,v0=1e30,v1=-1e30;lines.forEach(l=>{for(let i=0;i<l.v.length;i++){if(l.t[i]>t1)break;const v=l.v[i];if(isFinite(v)){if(v<v0)v0=v;if(v>v1)v1=v;}}});if(v0>v1){v0=0;v1=100;}if(v1===v0)v1=v0+1;const pad=(v1-v0)*.05;v0-=pad;v1+=pad;
 const X=t=>L+(t/t1)*(W-L-Rm),Y=v=>H-Bm-((v-v0)/(v1-v0))*(H-T-Bm);
 cx.strokeStyle=css('--grid');cx.lineWidth=1;cx.fillStyle=css('--fg');cx.font='10px sans-serif';const nx=6;for(let i=0;i<=nx;i++){const t=t1*i/nx;cx.beginPath();cx.moveTo(X(t),T);cx.lineTo(X(t),H-Bm);cx.stroke();cx.fillText((t/60).toFixed(0),X(t)-6,H-Bm+14);}for(let i=0;i<=5;i++){const v=v0+(v1-v0)*i/5;cx.beginPath();cx.moveTo(L,Y(v));cx.lineTo(W-Rm,Y(v));cx.stroke();cx.fillText(Math.round(v),4,Y(v)+3);}cx.fillText('t [min]',W/2-14,H-4);
 cx.strokeStyle=css('--fg');cx.strokeRect(L,T,W-L-Rm,H-T-Bm);
 lines.forEach(l=>{cx.strokeStyle=l.color;cx.setLineDash(l.dash||[]);cx.lineWidth=l.dash?1.2:1.8;cx.beginPath();let pen=false;for(let i=0;i<l.t.length;i++){if(l.t[i]>t1*1.0001)break;const v=l.v[i];if(!isFinite(v)){pen=false;continue;}pen?cx.lineTo(X(l.t[i]),Y(v)):cx.moveTo(X(l.t[i]),Y(v));pen=true;}cx.stroke();});cx.setLineDash([]);
 const tc=tval();cx.strokeStyle=css('--accent');cx.lineWidth=1.5;cx.beginPath();cx.moveTo(X(tc),T);cx.lineTo(X(tc),H-Bm);cx.stroke();
 // legend
 let lx=L+6,ly=T+12;cx.font='11px sans-serif';lines.slice(0,12).forEach(l=>{cx.strokeStyle=l.color;cx.setLineDash(l.dash||[]);cx.beginPath();cx.moveTo(lx,ly-4);cx.lineTo(lx+16,ly-4);cx.stroke();cx.setLineDash([]);cx.fillStyle=css('--fg');cx.fillText(l.name,lx+20,ly);ly+=14;if(ly>H-Bm-10){ly=T+12;lx+=150;}});
 cc._X=X;cc._t1=t1;
 const tb=$('ptable').querySelector('tbody');tb.innerHTML='';const f=R.fields[ti];probes.forEach((p,i)=>{const loc=R.locate(p.x,p.y);const v=loc?R.value(loc,f):NaN;const tr=document.createElement('tr');tr.innerHTML='<td style="color:'+p.color+'">'+p.name+'</td><td class="num">'+p.x.toFixed(1)+'</td><td class="num">'+p.y.toFixed(1)+'</td><td class="num">'+(isFinite(v)?v.toFixed(1):'–')+'</td><td>'+(p.fixed?'':'<button data-i="'+i+'">'+S.remove+'</button>')+'</td>';tb.appendChild(tr);});
}
function redraw(){drawField();drawChart();}
function setT(i){ti=Math.max(0,Math.min(R.times.length-1,i|0));tSlider.value=ti;redraw();}
tSlider.addEventListener('input',()=>setT(+tSlider.value));
$('play').addEventListener('click',()=>{playing=!playing;$('play').textContent=playing?S.pause:S.play;if(playing){timer=setInterval(()=>{setT(ti+1>=R.times.length?0:ti+1);},120);}else clearInterval(timer);});
resSel.addEventListener('change',()=>{ri=+resSel.value;R=D.results[ri];tSlider.max=Math.max(0,R.times.length-1);const temp=probes.filter(p=>!p.fixed);initProbes();temp.forEach(p=>{p.series=R.series(p.x,p.y);probes.push(p);});setT(Math.min(ti,R.times.length-1));});
['iso','meshchk'].forEach(id=>$(id).addEventListener('change',redraw));$('isoval').addEventListener('input',redraw);
$('theme').addEventListener('change',e=>{document.documentElement.setAttribute('data-theme',e.target.value);redraw();});
$('clear').addEventListener('click',()=>{probes=probes.filter(p=>p.fixed);redraw();});
$('ptable').addEventListener('click',e=>{const b=e.target.closest('button');if(b){probes.splice(+b.dataset.i,1);redraw();}});
$('csv').addEventListener('click',()=>{const rows=[['t [s]',...probes.map(p=>p.name)]];const t=probes[0]&&probes[0].series?probes[0].series.t:R.times;for(let i=0;i<t.length;i++){rows.push([t[i],...probes.map(p=>{if(!p.series)return'';const s=p.series;if(s.t.length===t.length)return s.v[i];let j=0;while(j<s.t.length-1&&s.t[j+1]<=t[i])j++;return s.v[j];})]);}const txt=rows.map(r=>r.join(';')).join('\\r\\n');const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(txt);a.download='probes.csv';a.click();});
function fpos(ev){const r=fc.getBoundingClientRect();const F=fit();return{px:ev.clientX-r.left,py:ev.clientY-r.top,x:F.ix(ev.clientX-r.left),y:F.iy(ev.clientY-r.top),F};}
fc.addEventListener('pointerdown',ev=>{const q=fpos(ev);const hit=probes.findIndex(p=>Math.hypot(q.F.x(p.x)-q.px,q.F.y(p.y)-q.py)<8);if(hit>=0){drag=hit;fc.setPointerCapture(ev.pointerId);}else if(R.locate(q.x,q.y)){const i=probes.length;probes.push({name:'P'+(i+1),x:q.x,y:q.y,fixed:false,color:COL[i%COL.length],series:R.series(q.x,q.y)});redraw();}});
fc.addEventListener('pointermove',ev=>{const q=fpos(ev);if(drag!==null){const p=probes[drag];if(R.locate(q.x,q.y)){p.x=q.x;p.y=q.y;p.series=R.series(q.x,q.y);p.fixed=false;redraw();}return;}const loc=R.locate(q.x,q.y);$('fread').textContent=loc?('x = '+q.x.toFixed(1)+' mm, y = '+q.y.toFixed(1)+' mm, θ = '+R.value(loc,R.fields[ti]).toFixed(1)+' °C @ '+(tval()/60).toFixed(1)+' min'):'';});
fc.addEventListener('pointerup',ev=>{drag=null;});
cc.addEventListener('pointerdown',ev=>{dragCursor=true;cc.setPointerCapture(ev.pointerId);moveCursor(ev);});cc.addEventListener('pointermove',ev=>{if(dragCursor)moveCursor(ev);else{const r=cc.getBoundingClientRect();const t=((ev.clientX-r.left-50)/(cc.clientWidth-64))*cc._t1;$('cread').textContent=t>=0&&t<=cc._t1?('t = '+(t/60).toFixed(1)+' min: '+probes.map(p=>{if(!p.series)return'';const s=p.series;let j=0;while(j<s.t.length-1&&s.t[j+1]<=t)j++;return p.name+' '+Math.round(s.v[j])+' °C';}).join(', ')):'';}});cc.addEventListener('pointerup',()=>{dragCursor=false;});
function moveCursor(ev){const r=cc.getBoundingClientRect();const t=Math.max(0,Math.min(cc._t1,((ev.clientX-r.left-50)/(cc.clientWidth-64))*cc._t1));let best=0;for(let i=0;i<R.times.length;i++)if(Math.abs(R.times[i]-t)<Math.abs(R.times[best]-t))best=i;setT(best);}
window.addEventListener('resize',redraw);redraw();
})();
</script>
</body></html>`;
}
