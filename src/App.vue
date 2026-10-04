<script setup>
import {ref,computed,nextTick,onMounted,onUnmounted,watch} from 'vue';
import {normalizeStats,connectionState,fetchStats,selectionMissing} from './live.js';
import {carriers,quality,uptimeBins,fleetSummary,fetchHistory,ranges,restoreFocusAfterUpdate} from './history.js';
import {clock} from './format.js';
import FleetBand from './FleetBand.vue';
import NodeMatrix from './NodeMatrix.vue';
import Inspector from './Inspector.vue';
import FleetHeat from './FleetHeat.vue';
import EventLog from './EventLog.vue';
const query=ref(''),region=ref('all'),status=ref('all'),sort=ref('weight'),cards=ref(false),dark=ref(false),range=ref('1h');
const payload=ref(null),now=ref(Date.now()/1000),error=ref(''),busy=ref(false);
const histories=ref({}),historyErrors=ref({}),historyBusy=new Set();
const chosenId=ref(null),sheetOpen=ref(false),narrow=ref(false),dialog=ref(null),inspector=ref(null),tip=ref({text:'',x:0,y:0});
let timer,clockTimer,historyTimer,disposed=false,opener,media;
const servers=computed(()=>payload.value?normalizeStats(payload.value,now.value).map(s=>{
 const raw=payload.value.servers.find(r=>r.name===s.id),fresh=['online','warning','unknown'].includes(s.status);
 const qualities=carriers.map(([label,key])=>({label,key,q:quality(raw,key,now.value)}));
 const attention=s.status!=='online'||qualities.some(q=>q.q.grade!=='normal');
 return {...s,raw,fresh,qualities,attention,key:s.status==='online'&&attention?'attention':s.status};
}):[]);
const link=computed(()=>connectionState(payload.value?.updated??null,now.value,error.value));
const connectionText=computed(()=>({loading:'正在连接探针',live:'实时 · 每 5 秒',stale:'数据已过期 · 等待探针',error:'连接异常 · 正在重试'}[link.value]));
const updateTime=computed(()=>payload.value?clock(payload.value.updated):'—');
// Totals use bytes, not a mixture of SI and IEC rates from different nodes.
const summary=computed(()=>fleetSummary(servers.value.map(s=>({...s,down:s.down===null?null:s.raw.network_rx,up:s.up===null?null:s.raw.network_tx}))));
const regions=computed(()=>[...new Set(servers.value.map(s=>s.region))].map(r=>[r,servers.value.filter(s=>s.region===r).length]));
const minLatency=s=>{const v=s.qualities.map(q=>q.q.latency).filter(v=>v!==null);return v.length?Math.min(...v):Infinity};
const sorters={weight:null,cpu:(a,b)=>(b.cpu??-1)-(a.cpu??-1),latency:(a,b)=>minLatency(a)-minLatency(b),traffic:(a,b)=>((b.down??0)+(b.up??0))-((a.down??0)+(a.up??0)),name:(a,b)=>a.name.localeCompare(b.name,'zh-CN')};
const filtered=computed(()=>{const q=query.value.trim().toLowerCase();const rows=servers.value.filter(s=>(region.value==='all'||s.region===region.value)&&(status.value==='all'||(status.value==='attention'?s.attention:s.status===status.value))&&[s.name,s.code,s.os,s.region].join(' ').toLowerCase().includes(q));return sorters[sort.value]?[...rows].sort(sorters[sort.value]):rows});
const counts=computed(()=>({attention:servers.value.filter(s=>s.attention).length,offline:servers.value.filter(s=>s.status==='offline').length}));
const active=computed(()=>servers.value.find(s=>s.id===chosenId.value)??filtered.value[0]??servers.value[0]??null);
// Bins and axes span the whole requested window; the export's end is only the last observation.
const windowed=r=>{const h=histories.value[r];return h?{...h,windowEnd:h.start+ranges[r]}:null};
const rangeHistory=computed(()=>windowed(range.value));
// Quality bins are shared by rows and the fleet strip; keyed by the id list so the clock never rebuilds them.
const ids=computed(()=>servers.value.map(s=>s.id).join('\n'));
const bins=computed(()=>{const h=rangeHistory.value;return Object.fromEntries(ids.value.split('\n').filter(Boolean).map(id=>[id,carriers.map(([,k])=>uptimeBins(h,id,k))]))});
const historyMessage=computed(()=>historyErrors.value[range.value]||(rangeHistory.value?.samples.length?'':'历史正在采集'));
const coverage=computed(()=>{const h=rangeHistory.value;if(!h?.samples.length)return range.value+' 窗口 · '+historyMessage.value;const first=h.samples[0].updated,last=h.samples.at(-1).updated;return range.value+' 窗口 · 实际覆盖 '+Math.max(0,Math.round((last-first)/60))+' 分钟 / '+h.samples.length+' 桶'+(historyErrors.value[range.value]?' · 历史连接异常':'')});
async function refresh(){if(busy.value||disposed)return;busy.value=true;try{const p=await fetchStats('./json/stats.json');if(!disposed){payload.value=p;error.value='';now.value=Date.now()/1000}}catch(e){if(!disposed)error.value=e.message}finally{busy.value=false;if(!disposed)timer=setTimeout(refresh,5000)}}
async function loadHistory(r){if(historyBusy.has(r)||disposed)return;historyBusy.add(r);try{const h=await fetchHistory(r);if(!disposed){histories.value={...histories.value,[r]:h};historyErrors.value={...historyErrors.value,[r]:''}}}catch(e){if(!disposed)historyErrors.value={...historyErrors.value,[r]:e.message}}finally{historyBusy.delete(r)}}
function applyTheme(){document.documentElement.dataset.theme=dark.value?'dark':'light'}
function theme(){dark.value=!dark.value;try{localStorage.setItem('server-garden-theme',dark.value?'dark':'light')}catch{};applyTheme()}
async function select(s,event){if(!s)return;chosenId.value=s.id;if(!narrow.value||sheetOpen.value)return;opener=event?.currentTarget;sheetOpen.value=true;await nextTick();dialog.value.showModal();inspector.value?.resize();document.body.style.overflow='hidden';dialog.value.querySelector('.sg-close')?.focus()}
function close(){dialog.value?.close();sheetOpen.value=false;document.body.style.overflow='';restoreFocusAfterUpdate(nextTick,opener,()=>document.querySelector('#search'))}
function resetFilters(){query.value='';region.value='all';status.value='all'}
function keys(e){if(e.key==='/'&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)&&!sheetOpen.value){e.preventDefault();document.querySelector('#search')?.focus()}}
function showTip(e){const el=e.target.closest?.('[data-tip]');tip.value=el?{text:el.dataset.tip,x:e.clientX,y:e.clientY}:{text:'',x:0,y:0}}
function moveTip(e){if(tip.value.text)tip.value={...tip.value,x:e.clientX,y:e.clientY}}
const tipStyle=computed(()=>{if(typeof window==='undefined')return {};const w=Math.min(280,window.innerWidth-16);return {left:Math.max(8,Math.min(tip.value.x+12,window.innerWidth-w-8))+'px',top:(tip.value.y+80>window.innerHeight?tip.value.y-64:tip.value.y+16)+'px',maxWidth:w+'px'}});
function setCards(v){cards.value=v;try{localStorage.setItem('server-garden-view',v?'cards':'matrix')}catch{}}
watch(range,r=>loadHistory(r));
watch(servers,rows=>{if(selectionMissing(chosenId.value,rows)){if(sheetOpen.value)close();chosenId.value=null}});
onMounted(()=>{
 try{const t=localStorage.getItem('server-garden-theme');dark.value=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;cards.value=localStorage.getItem('server-garden-view')==='cards'}catch{}
 applyTheme();media=matchMedia('(max-width: 1100px)');narrow.value=media.matches;media.onchange=e=>{if(sheetOpen.value)close();narrow.value=e.matches};
 refresh();loadHistory('1h');clockTimer=setInterval(()=>now.value=Date.now()/1000,1000);
 historyTimer=setInterval(()=>{loadHistory('1h');if(range.value!=='1h')loadHistory(range.value)},30000);
 document.addEventListener('keydown',keys);document.addEventListener('pointerover',showTip);document.addEventListener('pointermove',moveTip,{passive:true});
});
onUnmounted(()=>{disposed=true;clearTimeout(timer);clearInterval(clockTimer);clearInterval(historyTimer);if(media)media.onchange=null;document.removeEventListener('keydown',keys);document.removeEventListener('pointerover',showTip);document.removeEventListener('pointermove',moveTip);document.body.style.overflow=''});
</script>
<template>
<div class="site">
<header class="top"><div class="wrap">
 <a class="brand" href="https://cloud.kygoho.win/"><svg viewBox="0 0 128 128" aria-hidden="true"><path fill="currentColor" d="M16 64C16 42 30 30 52 28C62 27 74 28 86 34C104 43 116 52 116 64C116 76 104 85 86 94C74 100 62 101 52 100C30 98 16 86 16 64Z"/><g fill="var(--bg)"><circle cx="42" cy="64" r="8.5"/><circle cx="64" cy="62.5" r="9.5"/><circle cx="86" cy="64" r="8.5"/></g></svg><b>Server Garden</b><span>POD'S GARDEN</span></a>
 <div class="pulse" :data-link="link" role="status"><svg viewBox="0 0 18 18" aria-hidden="true"><circle class="track" cx="9" cy="9" r="7"/><circle :key="payload?.updated" class="ring" cx="9" cy="9" r="7"/><circle class="core" cx="9" cy="9" r="2.5"/></svg><span class="txt">{{connectionText}}</span></div>
 <nav class="nav" aria-label="主导航"><a href="https://cloud.kygoho.win/service/">Service ↗</a></nav>
 <div class="spacer"></div>
 <label class="search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m11 11 3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input id="search" v-model="query" type="search" aria-label="搜索节点" placeholder="搜索名称、地域、系统" autocomplete="off"><kbd aria-hidden="true">/</kbd></label>
 <div class="seg top-range" role="group" aria-label="时间窗口"><button v-for="r in Object.keys(ranges)" :key="r" :aria-pressed="range===r" @click="range=r">{{r}}</button></div>
 <button class="icon-btn" @click="theme" :aria-pressed="dark" aria-label="切换深色模式"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg></button>
</div></header>
<main class="wrap">
 <section class="mast"><h1>花园里的 <i>{{servers.length||'—'}}</i> 台机器</h1><p>三网线路、资源与流量在同一屏对照；选中节点查看完整历史。</p><div class="meta"><span>上次探针 <b class="num">{{updateTime}}</b></span><span>历史 <b>服务端 · 每 30 秒读取</b></span><span>视觉阈值 <b>300 ms / 5 %</b></span></div></section>
 <div v-if="link==='error'||link==='stale'" class="connection-alert" role="status">{{connectionText}}<template v-if="error"> · {{error}}</template> · 保留的数据不代表当前状态</div>
 <FleetBand :servers="servers" :summary="summary" :bins="bins" :history="rangeHistory" :range="range" @select="select"/>
 <div class="layout">
  <section class="panel" aria-label="节点矩阵">
   <div class="panel-head"><h2>节点矩阵</h2>
    <div class="pills" role="group" aria-label="地域"><button class="pill" :aria-pressed="region==='all'" @click="region='all'">全部 <b>{{servers.length}}</b></button><button v-for="[r,n] in regions" :key="r" class="pill" :aria-pressed="region===r" @click="region=r">{{r}} <b>{{n}}</b></button></div>
    <div class="right">
     <div class="seg low-range" role="group" aria-label="时间窗口"><button v-for="r in Object.keys(ranges)" :key="r" :aria-pressed="range===r" @click="range=r">{{r}}</button></div>
     <div class="pills" role="group" aria-label="节点状态"><button class="pill" :aria-pressed="status==='all'" @click="status='all'">全部状态</button><button class="pill" :aria-pressed="status==='attention'" @click="status='attention'"><i class="sw warn"></i>需留意 <b>{{counts.attention}}</b></button><button class="pill" :aria-pressed="status==='offline'" @click="status='offline'"><i class="sw fail"></i>离线 <b>{{counts.offline}}</b></button></div>
     <select id="sort" v-model="sort" class="sel" aria-label="排序"><option value="weight">按权重 · 分地域</option><option value="cpu">CPU 从高到低</option><option value="latency">延迟从低到高</option><option value="traffic">流量从高到低</option><option value="name">按名称</option></select>
     <div class="seg" role="group" aria-label="视图"><button :aria-pressed="!cards" @click="setCards(false)">矩阵</button><button :aria-pressed="cards" @click="setCards(true)">卡片</button></div>
    </div>
    <span class="count" aria-live="polite">{{filtered.length}} / {{servers.length}} 个节点</span>
   </div>
   <NodeMatrix :rows="filtered" :grouped="sort==='weight'" :cards="cards" :bins="bins" :history="rangeHistory" :range="range" :selected-id="active?.id" @select="select">
    <div v-if="!filtered.length" class="sg-empty">{{link==='loading'?'正在连接探针…':error||'没有匹配的节点。'}} <button class="pill" @click="resetFilters">重置筛选</button></div>
   </NodeMatrix>
  </section>
  <aside v-if="!narrow" class="panel insp" aria-labelledby="detail-title"><Inspector v-if="active" :node="active" :history="rangeHistory" :range="range" :now="now" :coverage="coverage"/><div v-else class="insp-empty">选中节点后，这里显示它的延迟、资源与流量历史。</div></aside>
 </div>
 <div class="lower"><FleetHeat :servers="filtered" :history="rangeHistory" :range="range" @select="select"/><EventLog :servers="servers" :history="rangeHistory" :range="range" :message="historyMessage" @select="select"/></div>
 <footer class="foot"><span>POD'S GARDEN / SERVER OBSERVATORY</span><span>离线、缺失和过期值显示为空白或「—」，不补造数据。Still growing.</span></footer>
</main>
</div>
<dialog ref="dialog" class="sheet" aria-labelledby="detail-title" @cancel.prevent="close" @click="e=>{if(e.target===dialog)close()}">
 <Inspector v-if="narrow&&sheetOpen&&active" ref="inspector" :node="active" :history="rangeHistory" :range="range" :now="now" :coverage="coverage" closable @close="close"/>
</dialog>
<div v-show="tip.text" class="tip" :style="tipStyle" aria-hidden="true">{{tip.text}}</div>
</template>
