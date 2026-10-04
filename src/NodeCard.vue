<script setup>
import {computed,ref} from 'vue';
import {carriers,quality,uptimeBins,formatRate,formatBytes} from './history.js';
const props=defineProps(['node','history','historyMessage','now']);defineEmits(['detail']);
const readout=ref(''),indices=ref({});
const bins=key=>uptimeBins(props.history,props.node.id,key);
const num=v=>v===null||v===undefined?'—':Number(v).toFixed(1);
const clock=t=>new Date(t*1000).toLocaleTimeString('zh-CN',{hour12:false});
const status=computed(()=>({offline:'已离线',stale:'数据过期',unknown:'指标不全',warning:'资源偏高',online:props.node.attention?'需留意':'正常'}[props.node.status]));
const beatText=(b,label)=>`${label} ${clock(b.start)}—${clock(b.end)} · ${ {unknown:'无有效数据',normal:'正常',slow:'高延迟',lightloss:'轻失败',loss:'需留意',failed:'探测失败'}[b.grade]} · ${num(b.latency)} ms · 滚动 TCP 失败率 ${num(b.loss)}%`;
function move(e,key){if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const cells=[...e.currentTarget.parentElement.children],i=cells.indexOf(e.currentTarget),n=e.key==='Home'?0:e.key==='End'?cells.length-1:Math.max(0,Math.min(cells.length-1,i+(e.key==='ArrowRight'?1:-1)));indices.value[key]=n;cells[n].focus()}
const fresh=computed(()=>['online','warning','unknown'].includes(props.node.status));
</script>
<template>
<article class="sg-card">
 <div class="sg-top"><svg class="sg-pod" viewBox="0 0 128 128" aria-hidden="true"><path fill="currentColor" d="M16 64C16 42 30 30 52 28C62 27 74 28 86 34C104 43 116 52 116 64C116 76 104 85 86 94C74 100 62 101 52 100C30 98 16 86 16 64Z"/><g fill="var(--paper)"><circle cx="42" cy="64" r="8.5"/><circle cx="64" cy="62.5" r="9.5"/><circle cx="86" cy="64" r="8.5"/></g></svg><h3>{{node.name}}</h3><span class="sg-status" :class="{'sg-warn':node.status!=='online'||node.attention}">{{status}}</span></div>
 <p class="sg-meta">{{node.code}} · {{node.os}} · {{node.raw.online4?'IPv4':''}} / {{node.raw.online6?'IPv6':''}}</p>
 <div class="sg-resources"><div v-for="[label,value] in [['CPU',node.cpu],['内存',node.memory],['磁盘',node.disk]]" :key="label"><span class="sg-label">{{label}}</span><strong>{{num(value)}}<small> %</small></strong><div class="sg-meter"><i :style="{width:(value??0)+'%'}"></i></div></div></div>
 <div class="sg-speedline"><span>↓ 接收 <strong>{{formatRate(fresh?node.raw.network_rx:null,node.raw.si)}}</strong></span><span>↑ 发送 <strong>{{formatRate(fresh?node.raw.network_tx:null,node.raw.si)}}</strong></span></div>
 <div class="sg-quality"><div class="sg-quality-title"><span>三网</span><span>{{historyMessage||'近 1h · 服务端历史'}}</span></div>
 <div v-for="[label,key] in carriers" :key="key" class="sg-uptime-row"><div class="sg-uptime-heading"><b>{{label}}</b><span><strong>{{num(quality(fresh?node.raw:null,key,now).latency)}} ms</strong>失败 {{num(quality(fresh?node.raw:null,key,now).loss)}}%</span></div>
 <div class="sg-beats" role="group" :aria-label="label+'历史，左旧右新'"><button v-for="(b,i) in bins(key)" :key="i" class="sg-beat" style="flex:1" :data-grade="b.grade" :tabindex="i===(indices[key]??35)?0:-1" :title="beatText(b,label)" :aria-label="beatText(b,label)" @pointerenter="readout=beatText(b,label)" @pointerleave="readout=''" @focus="readout=beatText(b,label)" @blur="readout=''" @click="readout=beatText(b,label)" @keydown="move($event,key)"></button></div></div>
 <div class="sg-uptime-axis"><span>{{history?clock(history.start):'—'}}</span><span>1h</span><span>{{history?clock(history.windowEnd):'—'}}</span></div>
 <div class="sg-beat-readout" :class="{visible:readout}" aria-live="polite">{{readout}}</div></div>
 <div class="sg-foot"><span>累计 ↓ <strong>{{formatBytes(fresh?node.raw.network_in:null,node.raw.si)}}</strong> ↑ <strong>{{formatBytes(fresh?node.raw.network_out:null,node.raw.si)}}</strong></span><span><strong>{{fresh&&Number.isFinite(node.raw.tcp_count)&&Number.isFinite(node.raw.udp_count)?node.raw.tcp_count+node.raw.udp_count:'—'}}</strong> 连接</span></div>
 <details class="sg-extra"><summary>系统与原始指标</summary><p>运行 {{node.uptime}} · {{node.spec}}<br>负载 {{fresh?node.raw.load_1??'—':'—'}} / {{fresh?node.raw.load_5??'—':'—'}} / {{fresh?node.raw.load_15??'—':'—'}}</p></details>
 <button class="sg-detail-btn" @click="$emit('detail',node,$event)" :aria-label="'查看 '+node.name+' 历史详情'">历史详情 ↗</button>
</article>
</template>
