import {test} from 'node:test';import assert from 'node:assert/strict';
import {fleetSeries,heatBins,historyEvents,gradeDistribution,median} from '../src/insights.js';
const node=(t,o={})=>({name:'n',online4:true,latest_ts:t,cpu:20,network_rx:100,time_189:40,ping_189:0,time_10010:50,ping_10010:0,time_10086:60,ping_10086:0,...o});
const hist=(rows,interval=10,start=0,windowEnd=100)=>({start,windowEnd,interval,samples:rows.map(([t,servers])=>({updated:t,servers}))});

test('fleet series averages or sums only fresh nodes and keeps empty buckets null',()=>{
 const h=hist([[10,[node(10),node(10,{name:'m',cpu:40,network_rx:50})]],[20,[node(20,{online4:false})]],[30,[node(30,{name:'x',latest_ts:-100,cpu:99})]]]);
 assert.deepEqual(fleetSeries(h,'cpu','avg').map(p=>p.v),[30,null,null]);
 assert.deepEqual(fleetSeries(h,'network_rx').map(p=>p.v),[150,null,null]);
});
test('heat bins never paint uncovered or stale periods',()=>{
 const h=hist([[5,[node(5,{cpu:10})]],[15,[node(15,{cpu:30})]],[95,[node(95,{latest_ts:0})]]]);
 const cells=heatBins(h,'n','cpu',10);
 assert.equal(cells.length,10);assert.equal(cells[0].v,10);assert.equal(cells[1].v,30);assert.equal(cells[5].v,null);assert.equal(cells[9].v,null);
 assert.equal(heatBins(h,'n','lat',10)[0].v,40);
 assert.equal(heatBins(hist([[5,[node(5,{ping_10010:7})]]]),'n','loss',10)[0].v,7);
});
test('events report outage, recovery and a collector gap once instead of per node',()=>{
 const h=hist([[10,[node(10)]],[20,[node(20,{online4:false})]],[30,[node(30)]],[200,[node(200)]]],10,0,300);
 const kinds=historyEvents(h).map(e=>e.kind);
 assert.deepEqual([...kinds].sort(),['down','gap','up']);
});
test('flapping CPU and line failures read as one event each',()=>{
 const cpu=[85,79,82,60,90],rows=cpu.map((c,i)=>[(i+1)*10,[node((i+1)*10,{cpu:c,ping_10010:i<3?(i%2?0:8):0})]]);
 const e=historyEvents(hist([[0,[node(0)]],...rows],10,0,100));
 assert.equal(e.filter(x=>x.kind==='warn').length,2);
 assert.equal(e.filter(x=>x.kind==='loss').length,1);
 assert.match(e.find(x=>x.kind==='loss').text,/联通 失败率 8.0%/);
});
test('distribution counts bins and median ignores missing values',()=>{
 assert.deepEqual(gradeDistribution([[{grade:'normal'},{grade:'unknown'}],[{grade:'loss'}]]),{normal:1,slow:0,lightloss:0,loss:1,failed:0,unknown:1});
 assert.equal(median([null,30,10,20]),20);assert.equal(median([null]),null);
});
