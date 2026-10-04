export {quality,formatBytes,formatRate,normalizeHistory,fetchHistory,historySeries,linePath,uptimeBins,fleetSummary} from './history.js';
const countries={us:['北美','美国'],ca:['北美','加拿大'],sg:['亚太','新加坡'],hk:['亚太','香港'],jp:['亚太','日本'],kr:['亚太','韩国'],cn:['亚太','中国'],tw:['亚太','台湾'],de:['欧洲','德国'],gb:['欧洲','英国'],uk:['欧洲','英国'],fr:['欧洲','法国'],nl:['欧洲','荷兰']};
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const percent=(used,total)=>number(used)!==null&&number(total)>0?Math.min(100,Math.round(used/total*100)):null;
export function normalizeStats(payload,now=Date.now()/1000){
 if(!payload||!Array.isArray(payload.servers)||number(payload.updated)===null)throw new Error('探针数据格式无效');
 return payload.servers.map((s,i)=>{if(!s||typeof s.name!=='string'||!s.name)throw new Error('节点标识无效');
 const location=String(s.location||'').toLowerCase(),place=countries[location]||['其他',s.location||'未设置地区'];
 const online=s.online4===true||s.online6===true,latest=number(s.latest_ts),fresh=latest!==null&&now-latest<=60&&now-payload.updated<=60;
 const cpu=online&&fresh?number(s.cpu):null,memory=online&&fresh?percent(s.memory_used,s.memory_total):null,disk=online&&fresh?percent(s.hdd_used,s.hdd_total):null;
 const status=!online?'offline':!fresh?'stale':[cpu,memory,disk].some(v=>v!==null&&v>=80)?'warning':[cpu,memory,disk].some(v=>v===null)?'unknown':'online';
 const base=s.si===true?1000:1024,unit=s.si===true?'GB':'GiB',labels=Object.fromEntries(String(s.labels||'').split(';').map(p=>p.split('=')).filter(p=>p.length===2));
 const total=number(s.memory_total),diskTotal=number(s.hdd_total);const spec=[total===null?'内存未知':(total/base/base).toFixed(2)+' '+unit+' RAM',diskTotal===null?'磁盘未知':(diskTotal/base).toFixed(1)+' '+unit+' DISK'].join(' / ');
 const latency=[s.time_10010,s.time_189,s.time_10086].map(number).filter(v=>v!==null&&v>0);
 return {id:s.name,displayId:String(i+1).padStart(2,'0'),name:s.alias||s.name,region:place[0],code:(location||'N/A').toUpperCase()+' / '+place[1],role:s.gid?'分组 · '+s.gid:'ServerStatus · '+(s.type||'节点'),status,cpu:cpu===null?null:Math.min(100,Math.round(cpu)),memory,disk,down:online&&fresh&&number(s.network_rx)!==null?s.network_rx/(base*base):null,up:online&&fresh&&number(s.network_tx)!==null?s.network_tx/(base*base):null,uptime:online&&fresh?String(s.uptime||'—'):'—',os:labels.os||'未上报',spec,latency:online&&fresh&&latency.length?Math.round(Math.min(...latency)):null,latest,history:[],weight:number(s.weight)??0};
 }).sort((a,b)=>b.weight-a.weight);
}
export function mergeHistory(rows,previous=new Map(),sampleId){const next=new Map();const merged=rows.map(s=>{const old=previous.get(s.id);const fresh=s.cpu!==null&&['online','warning'].includes(s.status);let values=fresh?(old?.values||[]):[];if(fresh&&old?.sampleId!==sampleId)values=[...values,s.cpu].slice(-60);next.set(s.id,{sampleId,values});return {...s,history:values}});return [merged,next]}
export function expireRows(rows,updated,now){return rows.map(s=>s.status!=='offline'&&(now-(s.latest??0)>60||updated!==null&&now-updated>60)?{...s,status:'stale',cpu:null,memory:null,disk:null,down:null,up:null,latency:null,uptime:'—',history:[]}:s)}
export function selectionMissing(id,rows){return id!==null&&!rows.some(s=>s.id===id)}
export function connectionState(updated,now,error){if(error)return 'error';if(updated===null)return 'loading';return now-updated>60?'stale':'live'}
export async function fetchStats(url,fetcher=fetch){const response=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('接口返回 HTTP '+response.status);const payload=await response.json();normalizeStats(payload);return payload}
