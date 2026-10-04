import {test} from 'node:test';import assert from 'node:assert/strict';import {summarize,selectServers} from './fixtures/garden.js';
test('stale nodes are not online and unknown network is not measured',()=>{const s=summarize([{status:'stale',down:null,up:null},{status:'offline',down:null,up:null}]);assert.equal(s.online,0);assert.equal(s.stale,1);assert.equal(s.measured,0)});
test('default sort respects backend weights',()=>{assert.equal(selectServers([{id:'a',name:'a',weight:1},{id:'b',name:'b',weight:10}])[0].id,'b')});
