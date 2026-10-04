import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.vue',import.meta.url),'utf8');const chart=readFileSync(new URL('../src/HistoryChart.vue',import.meta.url),'utf8');
test('narrow screens open the inspector in a native modal sheet that closes on cancel',()=>{assert.match(app,/<dialog ref="dialog" class="sheet"[^>]*@cancel\.prevent="close"/);assert.match(app,/restoreFocusAfterUpdate\(nextTick,opener/)});
test('empty chart does not print fabricated epoch timestamps',()=>assert.match(chart,/<template v-if="history\?\.samples\.length"><text v-for="\(t,i\) in g\.xticks"/));
test('chart shades collection gaps instead of interpolating across them',()=>{assert.match(chart,/linePath\(s\.points,interval/);assert.match(chart,/class="hx-gap"/)});
