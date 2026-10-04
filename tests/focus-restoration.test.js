import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as history from '../src/history.js';

test('focus restoration waits for Vue removal before selecting the fallback',async()=>{
 assert.equal(typeof history.restoreFocusAfterUpdate,'function');
 const focused=[];
 const opener={isConnected:true,focus(){focused.push('removed-opener')}};
 const fallback={focus(){focused.push('search')}};
 await history.restoreFocusAfterUpdate(async()=>{opener.isConnected=false},opener,()=>fallback);
 assert.deepEqual(focused,['search']);
});

test('focus restoration retains a surviving opener',async()=>{
 assert.equal(typeof history.restoreFocusAfterUpdate,'function');
 const focused=[];
 const opener={isConnected:true,focus(){focused.push('opener')}};
 await history.restoreFocusAfterUpdate(async()=>{},opener,()=>({focus(){focused.push('search')}}));
 assert.deepEqual(focused,['opener']);
});
