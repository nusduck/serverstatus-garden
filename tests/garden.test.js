import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as garden from '../src/live.js';
const s={name:'n',online4:true,latest_ts:1000,cpu:20,time_189:30,ping_189:0};
const call=(name,...args)=>garden[name]?.(...args);
test('quality distinguishes node outage, missing fields and rolling failure',()=>{
 assert.deepEqual(call('quality',s,'189',1000),{grade:'normal',latency:30,loss:0});
 assert.equal(call('quality',{...s,online4:false},'189',1000)?.grade,'unknown');
 assert.equal(call('quality',{...s,time_189:null},'189',1000)?.grade,'unknown');
 assert.equal(call('quality',{...s,ping_189:100},'189',1000)?.grade,'failed');
 assert.equal(call('quality',{...s,time_189:301},'189',1000)?.grade,'slow');
 assert.equal(call('quality',{...s,ping_189:5},'189',1000)?.grade,'loss');
 assert.equal(call('quality',s,'189',1061)?.grade,'unknown');
});
test('quality buckets use worst observations and missing coverage stays unknown',()=>{
 assert.equal(call('quality',{...s,bucket_quality:{189:{max_loss:7,max_latency:90,count:2,missing:0}}},'189',1000,true)?.grade,'loss');
 assert.equal(call('quality',{...s,bucket_quality:{189:{max_loss:0,max_latency:90,count:2,missing:1}}},'189',1000,true)?.grade,'unknown');
});
test('units honor decimal versus binary and memory KB versus disk MB',()=>{
 assert.equal(call('formatBytes',1000000,true),'1.0 MB');
 assert.equal(call('formatBytes',1048576,false),'1.0 MiB');
 assert.equal(call('formatRate',1024,false),'1.0 KiB/s');
 assert.equal(call('formatBytes',null,false),'—');
 const row=garden.normalizeStats({updated:1000,servers:[{...s,si:true,memory_total:1000000,hdd_total:1000,network_rx:1000000}]},1000)[0];
 assert.match(row.spec,/1.00 GB RAM \/ 1.0 GB DISK/);
 assert.equal(row.down,1);
});
test('history validates, sorts, deduplicates and preserves full requested window',()=>{
 const payload={version:1,range:'1h',start:0,end:1000,generated_at:1000,interval:10,samples:[{updated:1000,servers:[s]},{updated:990,servers:[s]},{updated:990,servers:[s]}]};
 const h=call('normalizeHistory',payload,'1h');
 assert.deepEqual(h?.samples.map(x=>x.updated),[990,1000]);assert.equal(h?.start,0);
 assert.throws(()=>garden.normalizeHistory({...payload,range:'7d'},'1h'));
});
test('history chart breaks gaps rather than connecting absent buckets',()=>{
 assert.equal(call('linePath',[{t:1,v:10},{t:11,v:20},{t:50,v:30},{t:60,v:null},{t:70,v:0}],10,x=>x,x=>x),'M1,10L11,20M50,30M70,0');
});
test('uptime bins retain grey uncovered requested periods',()=>{
 const bins=call('uptimeBins',{start:0,end:100,interval:10,samples:[{updated:95,bucket_start:90,bucket_end:100,servers:[{...s,latest_ts:95}]}]},'n','189',10);
 assert.equal(bins?.length,10);assert.equal(bins?.[0].grade,'unknown');assert.equal(bins?.at(-1).grade,'normal');
});
test('fleet summary excludes stale values even when supplied',()=>{
 const total=call('fleetSummary',[{status:'stale',cpu:90,down:99,up:99},{status:'online',cpu:20,down:1,up:2}]);
 assert.deepEqual(total,{total:2,online:1,attention:1,cpu:20,down:1,up:2});
});
test('series rejects offline or stale history fields and selection is stable by name',()=>{
 const h={interval:10,samples:[{updated:1000,servers:[s]},{updated:1100,servers:[s]}]};
 assert.deepEqual(call('historySeries',h,'n','cpu'),[{t:1000,v:20},{t:1100,v:null}]);
 assert.equal(garden.selectionMissing('n',[{id:'n'}]),false);assert.equal(garden.selectionMissing('n',[]),true);
});
test('history HTTP 404 is collecting, never a demo fallback',async()=>{
 assert.equal(typeof garden.fetchHistory,'function');
 await assert.rejects(garden.fetchHistory('1h',async()=>({ok:false,status:404})),/历史正在采集/);
});
