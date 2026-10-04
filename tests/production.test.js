import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../src/'+f,import.meta.url),'utf8');
const app=read('App.vue'),css=read('style.css'),inspector=read('Inspector.vue');
test('V6 console surface: matrix, pinned inspector with history charts, heat and events',()=>{for(const c of ['FleetBand','NodeMatrix','Inspector','FleetHeat','EventLog'])assert.match(app,new RegExp('<'+c+'[ >]'));assert.match(inspector,/<HistoryChart/);assert.doesNotMatch(app,/本次访问|真实样本 \/ 非实时连接|NodeCard/)});
test('footer shares main parent so wide maximum width remains centered',()=>{assert.ok(app.indexOf('<footer')<app.lastIndexOf('</main>'))});
test('custom select reserves arrow space',()=>{assert.match(css,/appearance:\s*none/);assert.match(css,/background-position:\s*right 12px center/);assert.match(css,/padding:\s*0 34px 0 12px/)});
test('every token is defined for light and redefined for both dark entry points',()=>{
 const block=sel=>{const i=css.indexOf(sel);return css.slice(i,css.indexOf('}',i))};
 const names=b=>new Set([...b.matchAll(/(--[\w-]+):/g)].map(m=>m[1]).filter(n=>!n.startsWith('--f-')&&!['--r','--gut','--top'].includes(n)));
 const light=names(block(':root{')),system=names(block(':root:not([data-theme="light"])')),forced=names(block(':root[data-theme="dark"]'));
 for(const n of light){assert.ok(system.has(n),n+' missing in system dark');assert.ok(forced.has(n),n+' missing in forced dark')}
});
test('text tokens meet 4.5 against the panels they sit on in both themes',()=>{
 const tok=(sel,n)=>{const i=css.indexOf(sel),b=css.slice(i,css.indexOf('}',i));return b.match(new RegExp(n+':#(\\w{6})'))[1]};
 const luminance=h=>{const a=h.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2]};
 const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 for(const sel of [':root{',':root[data-theme="dark"]'])for(const fg of ['--ink','--muted','--loss','--fail','--warn-text','--accent'])for(const bg of ['--surface','--surface-2']){
  const r=ratio(tok(sel,fg),tok(sel,bg));assert.ok(r>=4.5,`${sel} ${fg} on ${bg} = ${r.toFixed(2)}`)}
});
