import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const chart=readFileSync(new URL('../src/HistoryChart.vue',import.meta.url),'utf8'),app=readFileSync(new URL('../src/App.vue',import.meta.url),'utf8');
test('history measures visible plot after native dialog opens, not only before opening',()=>{assert.match(chart,/defineExpose\(\{resize\}\)/);assert.match(chart,/getBoundingClientRect\(\)\.width/);assert.match(app,/dialog\.value\.showModal\(\);historyChart\.value\?\.resize\(\)/)});
