// Historical observations are server-owned. No session or demo fallback.
export async function restoreFocusAfterUpdate(waitForDom,opener,getFallback){
 await waitForDom();
 const target=opener?.isConnected?opener:getFallback();
 target?.focus();
}
export const carriers=[['电信','189'],['联通','10010'],['移动','10086']];
export const ranges={'1h':3600,'24h':86400,'7d':604800};
const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function quality(s,key,t,worst=false,threshold={slow:300,loss:5}){
 const unknown={grade:'unknown',latency:null,loss:null};
 if(!s||!(s.online4||s.online6)||!valid(s.latest_ts)||t-s.latest_ts>60||t<s.latest_ts)return unknown;
 const q=worst?s.bucket_quality?.[key]:null;
 if(q&&(!q.count||q.missing))return unknown;
 const latency=q?q.max_latency:s['time_'+key],loss=q?q.max_loss:s['ping_'+key];
 if(!valid(latency)||latency<=0||!valid(loss)||loss>100)return unknown;
 return {grade:loss===100?'failed':latency>=1000||loss>=threshold.loss?'loss':loss>0?'lightloss':latency>=threshold.slow?'slow':'normal',latency,loss};
}
export function formatBytes(v,si=false){
 if(!valid(v))return '—';const base=si?1000:1024,units=si?['B','KB','MB','GB','TB']:['B','KiB','MiB','GiB','TiB'];
 let i=0;while(v>=base&&i<units.length-1){v/=base;i++}return v.toFixed(1)+' '+units[i];
}
export const formatRate=(v,si=false)=>v===null||v===undefined?'—':formatBytes(v,si)+'/s';
export function normalizeHistory(p,range){
 if(!p||p.version!==1||p.range!==range||!ranges[range]||!valid(p.start)||(p.end!==null&&(!valid(p.end)||p.end<p.start))||!valid(p.generated_at)||!valid(p.interval)||p.interval<=0||!Array.isArray(p.samples))throw new Error('历史数据格式无效');
 const unique=new Map();for(const s of p.samples){if(!valid(s.updated)||!Array.isArray(s.servers))throw new Error('历史样本格式无效');if(s.updated>=p.start&&s.updated<=p.end)unique.set(s.updated,s)}
 return {...p,samples:[...unique.values()].sort((a,b)=>a.updated-b.updated).slice(-360)};
}
export async function fetchHistory(range,fetcher=fetch){
 if(!ranges[range])throw new Error('历史范围无效');
 const r=await fetcher('./assets/garden-history/'+range+'.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error(r.status===404?'历史正在采集':'历史连接异常 / HTTP '+r.status);
 return normalizeHistory(await r.json(),range);
}
export function historySeries(h,id,key){return (h?.samples||[]).map(p=>{
 const s=p.servers.find(s=>s.name===id);let v=null;
 if(s&&(s.online4||s.online6)&&valid(s.latest_ts)&&p.updated-s.latest_ts<=60&&p.updated>=s.latest_ts){
 if(key==='memory'||key==='disk'){const pre=key==='memory'?'memory':'hdd';v=valid(s[pre+'_used'])&&s[pre+'_total']>0?Math.min(100,s[pre+'_used']/s[pre+'_total']*100):null}
 else v=valid(s[key])?s[key]:null;
 if(key.startsWith('time_')&&v===0)v=null;
 }return {t:p.updated,v};
})}
export function linePath(points,interval,x,y){let path='',pen=false,last=null;for(const p of points){if(p.v===null||!Number.isFinite(p.v)){pen=false;continue}if(last!==null&&p.t-last>interval*2)pen=false;path+=(pen?'L':'M')+x(p.t)+','+y(p.v);pen=true;last=p.t}return path}
export function uptimeBins(h,id,key,count=36){
 const start=h?.start??0,end=h?.windowEnd??h?.end??1,span=Math.max(1,end-start),step=span/count;
 const priority={normal:0,slow:1,lightloss:2,loss:3,failed:4,unknown:5};
 return Array.from({length:count},(_,i)=>{const a=start+i*step,b=a+step;let q={grade:'unknown',latency:null,loss:null};
 const observations=(h?.samples||[]).filter(p=>(p.bucket_start??p.updated)<b&&(p.bucket_end??p.updated+(h.interval||1))>a);
 if(observations.length){const grades=observations.map(p=>quality(p.servers.find(s=>s.name===id),key,p.updated,true));q=grades.sort((x,y)=>priority[y.grade]-priority[x.grade])[0];
 // Partial bucket coverage remains unknown rather than painting the gap green.
 const covered=observations.reduce((n,p)=>n+Math.max(0,Math.min(b,p.bucket_end??p.updated+(h.interval||1))-Math.max(a,p.bucket_start??p.updated)),0);
 if(covered<step*.8)q={grade:'unknown',latency:null,loss:null};
 }return {...q,start:a,end:b};})
}
export function fleetSummary(rows){const fresh=rows.filter(s=>['online','warning','unknown'].includes(s.status));const cpus=fresh.filter(s=>s.cpu!==null&&s.cpu!==undefined);const sum=k=>{const measured=fresh.filter(s=>s[k]!==null&&s[k]!==undefined);return measured.length?measured.reduce((n,s)=>n+s[k],0):null};
 return {total:rows.length,online:fresh.length,attention:rows.filter(s=>s.status!=='online'||s.attention).length,cpu:cpus.length?cpus.reduce((n,s)=>n+s.cpu,0)/cpus.length:null,down:sum('down'),up:sum('up')};
}
