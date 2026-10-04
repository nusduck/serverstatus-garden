import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');const chart=readFileSync(new URL('../src/HistoryChart.vue',import.meta.url),'utf8');
test('dark dialog uses its own dark panel tokens rather than a nonexistent dark ancestor',()=>assert.match(css,/\.sg-dialog\.dark\s*\{[^}]*--sg-card:#20221f/));
test('empty chart does not print fabricated epoch timestamps',()=>assert.match(chart,/v-if="history\?\.samples\.length" x="44"/));
