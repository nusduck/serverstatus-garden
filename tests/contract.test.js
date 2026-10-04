import {test} from 'node:test';import assert from 'node:assert/strict';import {normalizeHistory,quality} from '../src/history.js';
test('empty server export with null actual end remains collecting',()=>{const h=normalizeHistory({version:1,range:'1h',generated_at:100,start:0,end:null,interval:10,samples:[]},'1h');assert.equal(h.end,null);assert.deepEqual(h.samples,[])});
test('future node heartbeat is unknown rather than fresh quality',()=>assert.equal(quality({online4:true,latest_ts:1001,time_189:20,ping_189:0},'189',1000).grade,'unknown'));
