<script setup>
import {ref,computed,nextTick,onMounted,onUnmounted,watch} from 'vue';
import {normalizeStats,connectionState,fetchStats,selectionMissing} from './live.js';
import {carriers,quality,fleetSummary,fetchHistory,ranges,formatRate,restoreFocusAfterUpdate} from './history.js';
import NodeCard from './NodeCard.vue';
import HistoryChart from './HistoryChart.vue';
const query=ref(''),region=ref('all'),status=ref('all'),dark=ref(false);
try{dark.value=localStorage.getItem('server-garden-theme')==='dark'}catch{}
const payload=ref(null),now=ref(Date.now()/1000),error=ref(''),busy=ref(false);
const histories=ref({}),historyErrors=ref({}),historyBusy=new Set(),range=ref('1h');
const chosenId=ref(null),dialog=ref(null),historyChart=ref(null),site=ref(null),tab=ref('quality'),metric=ref('latency');
let timer,clock,historyTimer,disposed=false,opener;
const servers=computed(()=>payload.value?normalizeStats(payload.value,now.value).map(s=>{
 const raw=payload.value.servers.find(r=>r.name===s.id);
 const qualities=carriers.map(([,key])=>quality(raw,key,now.value));
 return {...s,raw,attention:s.status!=='online'||qualities.some(q=>q.grade!=='normal')};
}):[]);
const link=computed(()=>connectionState(payload.value?.updated??null,now.value,error.value));
const connectionText=computed(()=>({loading:'正在连接探针',live:'实时数据 / 每 5 秒更新',stale:'数据已过期 / 等待探针更新',error:'连接异常 / 正在重试'}[link.value]));
const updateTime=computed(()=>payload.value?new Date(payload.value.updated*1000).toLocaleTimeString('zh-CN',{hour12:false}):'—');
// Totals use bytes, not a mixture of SI and IEC rates from different nodes.
const summary=computed(()=>{const rows=servers.value.map(s=>({...s,down:s.down===null?null:s.raw.network_rx,up:s.up===null?null:s.raw.network_tx}));return fleetSummary(rows)});
const filtered=computed(()=>servers.value.filter(s=>(region.value==='all'||s.raw.location===region.value)&&(status.value==='all'||(status.value==='attention'?s.attention:!s.attention))&&(s.name+' '+s.code).toLowerCase().includes(query.value.trim().toLowerCase())));
const regions=computed(()=>[...new Map(servers.value.map(s=>[s.raw.location,s.code.split(' / ')[1]])).entries()]);
const chosen=computed(()=>servers.value.find(s=>s.id===chosenId.value));
const selectedHistory=computed(()=>histories.value[range.value]??null);
// Export end is the last actual observation. The grey overview spans the whole requested window.
const overviewHistory=computed(()=>{const h=histories.value['1h'];return h?{...h,windowEnd:h.start+ranges['1h']}:null});
const historyMessage=computed(()=>historyErrors.value[range.value]||(selectedHistory.value?.samples.length?'':'历史正在采集'));
const coverage=computed(()=>{const h=selectedHistory.value;if(!h?.samples.length)return range.value+' 窗口 · '+historyMessage.value;const first=h.samples[0].updated,last=h.samples.at(-1).updated;return range.value+' 窗口 · 实际覆盖 '+Math.max(0,Math.round((last-first)/60))+' 分钟 / '+h.samples.length+' 桶'+(historyErrors.value[range.value]?' · 历史连接异常':'')});
async function refresh(){if(busy.value||disposed)return;busy.value=true;try{const p=await fetchStats('./json/stats.json');if(!disposed){payload.value=p;error.value='';now.value=Date.now()/1000}}catch(e){if(!disposed)error.value=e.message}finally{busy.value=false;if(!disposed)timer=setTimeout(refresh,5000)}}
async function loadHistory(r){if(historyBusy.has(r)||disposed)return;historyBusy.add(r);try{const h=await fetchHistory(r);if(!disposed){histories.value={...histories.value,[r]:h};historyErrors.value={...historyErrors.value,[r]:''}}}catch(e){if(!disposed)historyErrors.value={...historyErrors.value,[r]:e.message}}finally{historyBusy.delete(r)}}
function theme(){dark.value=!dark.value;try{localStorage.setItem('server-garden-theme',dark.value?'dark':'light')}catch{};document.documentElement.style.background=dark.value?'#151515':'#f4f3ef'}
async function detail(s,event){if(chosenId.value!==null)return;opener=event.currentTarget;chosenId.value=s.id;tab.value='quality';metric.value='latency';await nextTick();dialog.value.showModal();historyChart.value?.resize();site.value.inert=true;document.body.style.overflow='hidden';dialog.value.querySelector('.sg-close').focus();loadHistory(range.value)}
function close(){dialog.value?.close();chosenId.value=null;site.value.inert=false;document.body.style.overflow='';restoreFocusAfterUpdate(nextTick,opener,()=>document.querySelector('#search'))}
function trap(e){if(e.key!=='Tab')return;const f=[...dialog.value.querySelectorAll('button,[tabindex="0"]')].filter(x=>x.getClientRects().length);if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0]?.focus()}}
function changeTab(t){tab.value=t;metric.value=t==='resource'?'cpu':'latency'}
watch(range,r=>loadHistory(r));watch(servers,rows=>{if(selectionMissing(chosenId.value,rows))close()});
onMounted(()=>{refresh();loadHistory('1h');clock=setInterval(()=>now.value=Date.now()/1000,1000);historyTimer=setInterval(()=>{loadHistory('1h');if(chosenId.value!==null&&range.value!=='1h')loadHistory(range.value)},30000)});
onUnmounted(()=>{disposed=true;clearTimeout(timer);clearInterval(clock);clearInterval(historyTimer);document.body.style.overflow=''});
</script>
<template>
<div ref="site" class="site" :class="{dark}">
<header class="header"><a class="brand" href="https://cloud.kygoho.win/"><svg viewBox="0 0 128 128" aria-hidden="true"><path fill="currentColor" d="M16 64C16 42 30 30 52 28C62 27 74 28 86 34C104 43 116 52 116 64C116 76 104 85 86 94C74 100 62 101 52 100C30 98 16 86 16 64Z"/><g fill="var(--paper)"><circle cx="42" cy="64" r="8.5"/><circle cx="64" cy="62.5" r="9.5"/><circle cx="86" cy="64" r="8.5"/></g></svg>POD'S GARDEN</a><nav aria-label="主导航"><a href="https://cloud.kygoho.win/service/">Service <span>↗</span></a></nav><button class="theme" @click="theme" :aria-pressed="dark" aria-label="切换深色模式">◐</button></header><main><div class="intro"><div class="hero"><div class="eyebrow">THE GARDEN / INFRASTRUCTURE OBSERVATORY</div><h1>Server<br><span>Garden<span class="dot">.</span></span></h1><p>让每一个节点，都有迹可循。<br><span class="muted">花园背后的机器，以及它们留下的呼吸。</span></p></div><aside class="hero-aside"><div class="orbit" aria-hidden="true"><svg viewBox="0 0 240 170"><ellipse cx="120" cy="85" rx="108" ry="42" transform="rotate(-25 120 85)"/><ellipse cx="120" cy="85" rx="108" ry="42" transform="rotate(25 120 85)"/><path d="M120 42v86M77 85h86"/><circle cx="120" cy="85" r="23"/><circle cx="204" cy="45" r="6" class="orbit-dot"/></svg></div><span class="eyebrow">SMALL MACHINES. QUIETLY GROWING.</span><div class="prototype"><span class="demo-dot" :class="link"></span> {{connectionText}}</div><p>ServerStatus · 上次数据 {{updateTime}}<br>服务端历史 · 每 30 秒读取</p></aside></div>
<div v-if="link==='error'||link==='stale'" class="connection-alert" role="status">{{connectionText}} · {{error}} · 保留数据不代表当前状态</div>
<section class="sg-board"><div class="sg-title"><div><span class="eyebrow">01 / GARDEN LIVE</span><h2>花园里的节点</h2></div></div>
<div class="sg-summary"><div><span class="sg-label">在线节点</span><div class="sg-big">{{summary.online}}<small> / {{summary.total}}</small></div><span class="sg-label">IPv4 / IPv6 · 新鲜心跳</span></div><div><span class="sg-label">需要留意</span><div class="sg-big" style="color:var(--amber)">{{summary.attention}}<small> 个节点</small></div></div><div><span class="sg-label">平均 CPU</span><div class="sg-big">{{summary.cpu===null?'—':summary.cpu.toFixed(1)}}<small> %</small></div></div><div><span class="sg-label">即时吞吐</span><div class="sg-big">↓ {{formatRate(summary.down)}}</div><span class="sg-label">↑ {{formatRate(summary.up)}}</span></div></div>
<div class="sg-tools"><input id="search" v-model="query" type="search" aria-label="搜索节点" placeholder="搜索名称 / 地域…"><label>地域<select id="region" v-model="region"><option value="all">全部地域</option><option v-for="[key,label] in regions" :key="key" :value="key">{{label}}</option></select></label><label>节点状态<select id="status" v-model="status"><option value="all">全部状态</option><option value="normal">正常</option><option value="attention">需要留意</option></select></label><span class="sg-count" aria-live="polite">{{filtered.length}} / {{servers.length}} 个节点</span></div>
<div class="sg-cards"><NodeCard v-for="s in filtered" :key="s.id" :node="s" :history="overviewHistory" :now="now" :history-message="historyErrors['1h']" @detail="detail"/><div v-if="!filtered.length" class="sg-empty">{{link==='loading'?'正在连接探针…':error||'没有匹配的节点。'}} <button class="sg-reset" @click="query='';region='all';status='all'">重置筛选</button></div></div>
</section><footer class="sg-footer"><span>POD'S GARDEN / SERVER OBSERVATORY</span><span>实时探针，服务端历史。Still growing.</span></footer></main></div>
<dialog ref="dialog" class="sg-dialog" :class="{dark}" aria-labelledby="detail-title" @cancel.prevent="close" @keydown="trap" @click="e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}}">
<template v-if="chosen"><div class="hx-head"><div><span class="eyebrow">NODE / HISTORY</span><h2 id="detail-title">{{chosen.name}}</h2><p>{{chosen.code}} · {{chosen.spec}}</p></div><button class="sg-close" aria-label="关闭历史详情" @click="close">×</button></div>
<div class="hx-toolbar"><div class="sg-tabs"><button v-for="[key,label] in [['quality','线路质量'],['resource','资源'],['network','流量']]" :key="key" :aria-pressed="tab===key" @click="changeTab(key)">{{label}}</button></div><div class="sg-range"><button v-for="r in ['1h','24h','7d']" :key="r" :aria-pressed="range===r" @click="range=r">{{r}}</button></div></div>
<div class="hx-main"><div class="hx-chart-head"><div class="hx-metrics"><button v-for="[key,label] in tab==='quality'?[['latency','延迟'],['loss','失败率']]:tab==='resource'?[['cpu','CPU'],['memory','内存'],['disk','磁盘']]:[]" :key="key" :class="{active:metric===key}" :aria-pressed="metric===key" @click="metric=key">{{label}}</button><span v-if="tab==='network'" class="sg-label">双向流量</span></div><span>{{coverage}}</span></div><HistoryChart ref="historyChart" :history="selectedHistory" :node="chosen" :tab="tab" :metric="metric"/></div>
<p class="sg-dialog-note" title="300ms / 5% 是可配置视觉阈值，不是行业标准。节点离线不等于线路中断。">曲线取每桶最后真实样本；时间条取桶内最差质量，缺采灰色。失败率为滚动 TCP 探测失败率。{{selectedHistory?'请求窗口 '+new Date(selectedHistory.start*1000).toLocaleString('zh-CN')+' 至 '+new Date((selectedHistory.start+ranges[range])*1000).toLocaleString('zh-CN'):historyMessage}}</p>
</template></dialog>
</template>
