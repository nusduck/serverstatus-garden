import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.vue',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
test('approved V5 surface replaces session charts and list mode',()=>{assert.match(app,/sg-board/);assert.match(app,/HistoryChart/);assert.doesNotMatch(app,/本次访问|真实样本 \/ 非实时连接|view==='list'/);});
test('footer shares main parent so wide maximum width remains centered',()=>{assert.ok(app.indexOf('<footer')<app.lastIndexOf('</main>'));});
test('custom select reserves arrow space and fixed centered height',()=>{assert.match(css,/appearance:\s*none/);assert.match(css,/background-position:\s*right 12px center/);assert.match(css,/padding:\s*0 34px 0 12px/);});
test('light and dark text palette meets 4.5 against panel',()=>{
 const luminance=h=>{const a=h.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2]};
 for(const [fg,bg] of [['151515','faf9f6'],['686866','e8e7e1'],['35634a','faf9f6'],['925017','faf9f6'],['f2f0eb','20221f'],['aaa9a5','252523']]){const a=luminance(fg),b=luminance(bg);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5)}
 assert.match(css,/\.sg-resources[^}]+strong\s*\{color:var\(--ink\)/);
});
