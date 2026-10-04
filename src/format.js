import {formatRate} from './history.js';
export const statusText={online:'正常',attention:'线路需留意',warning:'资源偏高',unknown:'指标不全',stale:'数据过期',offline:'已离线'};
export const gradeText={normal:'正常',slow:'高延迟',lightloss:'轻微失败',loss:'需留意',failed:'探测失败',unknown:'无有效数据'};
export const grades=['normal','slow','lightloss','loss','failed','unknown'];
export const num=(v,d=1)=>v===null||v===undefined||!Number.isFinite(v)?'—':Number(v).toFixed(d);
// "1.2 MiB/s" → ["1.2","MiB/s"] so numbers and units can be set in different faces.
export function splitRate(v,si=false){const s=formatRate(v,si);const i=s.indexOf(' ');return i<0?[s,'']:[s.slice(0,i),s.slice(i+1)]}
export const clock=t=>new Date(t*1000).toLocaleTimeString('zh-CN',{hour12:false});
export const hhmm=t=>new Date(t*1000).toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit'});
export const day=t=>new Date(t*1000).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'});
export const tick=(t,range)=>range==='7d'?day(t):hhmm(t);
export const stamp=(t,range)=>range==='1h'?hhmm(t):day(t)+' '+hhmm(t);
