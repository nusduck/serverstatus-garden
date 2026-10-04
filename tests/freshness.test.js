import {test} from 'node:test';import assert from 'node:assert/strict';import {normalizeStats} from '../src/live.js';
test('global stale payload does not expose fresh-looking node metrics',()=>{const s=normalizeStats({updated:1000,servers:[{name:'n',online4:true,latest_ts:1061,cpu:20}]},1061)[0];assert.equal(s.status,'stale');assert.equal(s.cpu,null)});
