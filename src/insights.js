// Fleet-level views derived only from server-owned history. Missing data stays null.
import {carriers,quality} from './history.js';
const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export const freshAt=(s,t)=>!!s&&(s.online4===true||s.online6===true)&&valid(s.latest_ts)&&t-s.latest_ts<=60&&t>=s.latest_ts;
export const windowOf=h=>({start:h?.start??0,end:h?.windowEnd??h?.end??1});
export function median(values){const v=values.filter(valid).sort((a,b)=>a-b);return v.length?v[Math.floor((v.length-1)/2)]:null}

// One point per bucket: average or sum of the fresh nodes that reported the field.
export function fleetSeries(h,key,mode='sum'){return (h?.samples||[]).map(p=>{
 const v=p.servers.filter(s=>freshAt(s,p.updated)&&valid(s[key])).map(s=>s[key]);
 return {t:p.updated,v:v.length?v.reduce((a,b)=>a+b,0)/(mode==='avg'?v.length:1):null};
})}

const metricOf={
 cpu:s=>valid(s.cpu)?Math.min(100,s.cpu):null,
 lat:s=>{const v=carriers.map(([,k])=>s['time_'+k]).filter(x=>valid(x)&&x>0);return v.length?Math.min(...v):null},
 loss:s=>{const v=carriers.map(([,k])=>s['ping_'+k]).filter(x=>valid(x)&&x<=100);return v.length?Math.max(...v):null}
};
// Heat cells over the requested window; a cell with no fresh observation is null (drawn hatched).
export function heatBins(h,id,metric,count=48){
 const {start,end}=windowOf(h),step=Math.max(1,end-start)/count,pick=metricOf[metric];
 const cells=Array.from({length:count},(_,i)=>({start:start+i*step,end:start+(i+1)*step,values:[]}));
 for(const p of h?.samples||[]){const i=Math.floor((p.updated-start)/step);if(i<0||i>=count)continue;
  const s=p.servers.find(x=>x.name===id);if(!freshAt(s,p.updated))continue;const v=pick(s);if(v!==null)cells[i].values.push(v)}
 return cells.map(({start,end,values})=>({start,end,v:values.length?(metric==='loss'?Math.max(...values):values.reduce((a,b)=>a+b,0)/values.length):null}));
}

export function gradeDistribution(binRows){const d={normal:0,slow:0,lightloss:0,loss:0,failed:0,unknown:0};for(const row of binRows)for(const b of row)d[b.grade]=(d[b.grade]??0)+1;return d}

// State changes inferred from consecutive history buckets. Collector gaps reset tracking
// so a pause in collection is reported once as a gap, not as every node going offline.
export function historyEvents(h){
 const samples=h?.samples||[],gap=(h?.interval||60)*2,events=[],prev=new Map();
 for(let i=0;i<samples.length;i++){const p=samples[i];
  if(i>0&&p.updated-samples[i-1].updated>gap){events.push({t:samples[i-1].updated,id:null,kind:'gap',text:'采集缺口 约 '+Math.round((p.updated-samples[i-1].updated)/60)+' 分钟 · 期间留空'});prev.clear()}
  for(const s of p.servers){if(!s?.name)continue;const was=prev.get(s.name),fresh=freshAt(s,p.updated);
   const grades=carriers.map(([,k])=>fresh?quality(s,k,p.updated,!!s.bucket_quality?.[k]).grade:'unknown');
   // Hysteresis: CPU clears below 70%, a line clears after three good buckets, so flapping reads as one event.
   const worse=grades.map(g=>g==='loss'||g==='failed');
   const now={fresh,hot:fresh&&valid(s.cpu)&&(s.cpu>=80||(!!was?.hot&&s.cpu>=70)),
    bad:worse.map((b,c)=>fresh&&(b||(!!was?.bad[c]&&was.good[c]<2))),good:worse.map((b,c)=>b?0:(was?.good[c]??0)+1)};
   if(was){
    if(was.fresh&&!fresh)events.push({t:p.updated,id:s.name,kind:'down',text:s.online4||s.online6?'心跳超过 60 秒未更新':'离线 · IPv4 / IPv6 均不可达'});
    if(!was.fresh&&fresh)events.push({t:p.updated,id:s.name,kind:'up',text:'恢复上报'});
    if(!was.hot&&now.hot)events.push({t:p.updated,id:s.name,kind:'warn',text:'CPU 升至 '+Math.round(s.cpu)+'%'});
    carriers.forEach(([label,k],c)=>{if(fresh&&!was.bad[c]&&now.bad[c]){const failed=grades[c]==='failed';const loss=s.bucket_quality?.[k]?.max_loss??s['ping_'+k];events.push({t:p.updated,id:s.name,kind:failed?'down':'loss',text:label+(failed?' 探测全部失败':' 失败率 '+Number(loss).toFixed(1)+'%')})}});
   }
   prev.set(s.name,now);
  }
 }
 return events.sort((a,b)=>b.t-a.t);
}
