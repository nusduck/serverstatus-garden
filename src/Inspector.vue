<script setup>
import {computed,ref} from 'vue';
import {carriers,historySeries,uptimeBins,formatBytes,ranges} from './history.js';
import {statusText,gradeText,grades,num,splitRate} from './format.js';
import HistoryChart from './HistoryChart.vue';
import QualityStrip from './QualityStrip.vue';
const props=defineProps({node:Object,history:Object,range:String,now:Number,coverage:String,closable:Boolean});
const emit=defineEmits(['close']);
const charts=ref([]),readout=ref('');
defineExpose({resize:()=>charts.value.forEach(c=>c?.resize())});
const n=computed(()=>props.node),raw=computed(()=>n.value.raw),id=computed(()=>props.node.id);
const colors=['--c-ct','--c-cu','--c-cm'];
const latency=computed(()=>carriers.map(([label,key],i)=>({label,color:colors[i],points:historySeries(props.history,id.value,'time_'+key)})));
const resources=computed(()=>[['CPU','cpu','--c-cpu',true],['内存','memory','--c-mem'],['磁盘','disk','--c-disk']].map(([label,key,color,area])=>({label,color,area,points:historySeries(props.history,id.value,key)})));
const base=computed(()=>raw.value.si?1000:1024);
const network=computed(()=>[['接收','network_rx','--c-rx'],['发送','network_tx','--c-tx']].map(([label,key,color])=>({label,color,area:true,points:historySeries(props.history,id.value,key).map(p=>({...p,v:p.v===null?null:p.v/base.value/base.value}))})));
const bins=computed(()=>carriers.map(([,key])=>uptimeBins(props.history,id.value,key,48)));
const fresh=computed(()=>n.value.fresh);
const val=k=>fresh.value&&Number.isFinite(raw.value[k])?raw.value[k]:null;
const heartbeat=computed(()=>Number.isFinite(raw.value.latest_ts)?Math.max(0,Math.round(props.now-raw.value.latest_ts)):null);
const ago=s=>s===null?'未知':s<90?s+' 秒前':s<5400?Math.round(s/60)+' 分钟前':Math.round(s/3600)+' 小时前';
const facts=computed(()=>[
 ['系统',n.value.os],['规格',n.value.spec],['运行',n.value.uptime],
 ['负载 1 / 5 / 15',[val('load_1'),val('load_5'),val('load_15')].map(v=>num(v,2)).join(' / ')],
 ['连接 TCP / UDP',num(val('tcp_count'),0)+' / '+num(val('udp_count'),0)],
 ['累计 ↓ / ↑',formatBytes(val('network_in'),raw.value.si)+' / '+formatBytes(val('network_out'),raw.value.si)],
 ['协议',[raw.value.online4&&'IPv4',raw.value.online6&&'IPv6'].filter(Boolean).join(' + ')||'均不可达'],
 ['最后心跳',ago(heartbeat.value)]]);
const step=computed(()=>{const s=ranges[props.range]/48;return s>=3600?(s/3600).toFixed(1).replace('.0','')+' 小时':Math.round(s/60)+' 分钟'});
const kpis=computed(()=>[['CPU',n.value.cpu,'--c-cpu'],['内存',n.value.memory,'--c-mem'],['磁盘',n.value.disk,'--c-disk']]);
const rateUnit=computed(()=>raw.value.si?'MB/s':'MiB/s');
const down=computed(()=>splitRate(val('network_rx'),raw.value.si)),up=computed(()=>splitRate(val('network_tx'),raw.value.si));
</script>
<template>
<div class="insp-body">
 <div class="ih">
  <svg class="pod" viewBox="0 0 128 128" aria-hidden="true"><path fill="currentColor" d="M16 64C16 42 30 30 52 28C62 27 74 28 86 34C104 43 116 52 116 64C116 76 104 85 86 94C74 100 62 101 52 100C30 98 16 86 16 64Z"/><g fill="var(--surface)"><circle cx="42" cy="64" r="8.5"/><circle cx="64" cy="62.5" r="9.5"/><circle cx="86" cy="64" r="8.5"/></g></svg>
  <div class="ih-text"><h2 id="detail-title">{{node.name}}</h2><p>{{node.code}} · {{node.spec}}</p><span class="status" :data-s="node.key">{{statusText[node.key]}}<template v-if="!fresh"> · 最后心跳 {{ago(heartbeat)}}</template></span></div>
  <button v-if="closable" class="icon-btn sg-close" aria-label="关闭节点详情" @click="emit('close')"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6"/></svg></button>
 </div>
 <div class="kpis">
  <div v-for="[l,v,c] in kpis" :key="l" class="kpi" :class="{hot:v!==null&&v>=80}" :style="{'--c':`var(${c})`}"><span class="label">{{l}}</span><span class="num">{{num(v)}}<small>%</small></span><span class="bar"><i :style="{width:(v??0)+'%'}"></i></span></div>
  <div class="kpi"><span class="label">实时 ↓ / ↑</span><span class="num sm">{{down[0]}}<small>{{down[1]}}</small></span><span class="num sm">{{up[0]}}<small>{{up[1]}}</small></span></div>
 </div>
 <section class="sec"><div class="sec-h"><h3>三网延迟</h3><div class="legend"><span v-for="(s,i) in latency" :key="s.label"><i :style="{background:`var(${colors[i]})`}"></i>{{s.label}}</span></div></div>
  <HistoryChart :ref="el=>charts[0]=el" :series="latency" :history="history" :range="range" unit="ms" :threshold="300" label="三网延迟历史"/></section>
 <section class="sec"><div class="sec-h"><h3>线路质量时间条</h3><span class="label">每格 {{step}} · 取桶内最差</span></div>
  <div class="big-strips"><template v-for="([label],i) in carriers" :key="label"><span>{{label}}</span><QualityStrip :bins="bins[i]" :label="label" :range="range" interactive @readout="t=>readout=t"/></template></div>
  <p class="strip-readout" aria-live="polite">{{readout||'用方向键逐格查看；斜纹为缺采或覆盖不足。'}}</p>
  <div class="legend"><span v-for="g in grades" :key="g"><i :class="'g-'+g"></i>{{gradeText[g]}}</span></div></section>
 <section class="sec"><div class="sec-h"><h3>资源</h3><div class="legend"><span v-for="s in resources" :key="s.label"><i :style="{background:`var(${s.color})`}"></i>{{s.label}}</span></div></div>
  <HistoryChart :ref="el=>charts[1]=el" :series="resources" :history="history" :range="range" unit="%" :max="100" :threshold="80" :height="124" label="资源占用历史"/></section>
 <section class="sec"><div class="sec-h"><h3>网络</h3><div class="legend"><span><i style="background:var(--c-rx)"></i>接收 · 上半</span><span><i style="background:var(--c-tx)"></i>发送 · 下半</span></div></div>
  <HistoryChart :ref="el=>charts[2]=el" :series="network" :history="history" :range="range" :unit="rateUnit" mirror :digits="2" :height="132" label="网络流量历史"/></section>
 <section class="sec"><div class="sec-h"><h3>系统</h3></div><dl class="facts"><template v-for="[k,v] in facts" :key="k"><dt>{{k}}</dt><dd>{{v}}</dd></template></dl></section>
 <p class="sec note" title="300ms / 5% 是可配置视觉阈值，不是行业标准。节点离线不等于线路中断。">{{coverage}}。曲线取每桶最后真实样本，时间条取桶内最差质量；失败率为滚动 TCP 探测失败率。</p>
</div>
</template>
