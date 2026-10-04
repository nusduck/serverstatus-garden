<script setup>
import {computed,ref,onMounted,onUnmounted,watch,nextTick} from 'vue';
import {carriers,historySeries,linePath} from './history.js';
const props=defineProps(['history','node','tab','metric']);const plot=ref(null),width=ref(800),index=ref(0);let observer;
function resize(){const w=plot.value?.getBoundingClientRect().width;if(w>0)width.value=w}
defineExpose({resize});
onMounted(()=>{observer=new ResizeObserver(resize);observer.observe(plot.value);window.addEventListener('resize',resize)});onUnmounted(()=>{observer?.disconnect();window.removeEventListener('resize',resize)});
const height=computed(()=>width.value<500?230:280),colors=['var(--hx-teal)','var(--hx-blue)','var(--hx-purple)'];
const lines=computed(()=>{
 const h=props.history,id=props.node.id;
 if(props.tab==='quality')return carriers.map(([label,key],i)=>({label,color:colors[i],unit:props.metric==='loss'?'%':'ms',points:historySeries(h,id,(props.metric==='loss'?'ping_':'time_')+key)}));
 if(props.tab==='network')return [['接收','network_rx'],['发送','network_tx']].map(([label,key],i)=>({label,color:colors[i],unit:props.node.raw.si?'KB/s':'KiB/s',points:historySeries(h,id,key).map(p=>({...p,v:p.v===null?null:p.v/(props.node.raw.si?1000:1024)}))}));
 return [{label:{cpu:'CPU',memory:'内存',disk:'磁盘'}[props.metric],color:colors[0],unit:'%',points:historySeries(h,id,props.metric)}];
});
watch(lines,async()=>{index.value=Math.max(0,(props.history?.samples.length||1)-1);await nextTick();resize()},{immediate:true});
const bounds=computed(()=>{const p=props.history?.samples||[];return [p[0]?.updated??0,p.at(-1)?.updated??1]});
const cap=computed(()=>props.tab==='resource'?100:Math.max(1,...lines.value.flatMap(l=>l.points.map(p=>p.v??0)))*1.15);
const x=t=>44+(t-bounds.value[0])/Math.max(1,bounds.value[1]-bounds.value[0])*(width.value-60),y=v=>height.value-34-v/cap.value*(height.value-50);
const clock=t=>new Date(t*1000).toLocaleTimeString('zh-CN',{hour12:false});
const num=v=>v===null||v===undefined?'—':Number(v).toFixed(1);
function inspect(i){index.value=Math.max(0,Math.min((props.history?.samples.length||1)-1,i))}
function pointer(e){const p=props.history?.samples||[];if(!p.length)return;const r=plot.value.getBoundingClientRect(),t=bounds.value[0]+Math.max(0,Math.min(1,(e.clientX-r.left-44)/(r.width-60)))*(bounds.value[1]-bounds.value[0]);let best=0;p.forEach((a,i)=>{if(Math.abs(a.updated-t)<Math.abs(p[best].updated-t))best=i});inspect(best)}
function keyboard(e){if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();inspect(e.key==='Home'?0:e.key==='End'?Infinity:index.value+(e.key==='ArrowRight'?1:-1))}
const stats=l=>{const v=l.points.filter(p=>p.v!==null).map(p=>p.v);return {avg:v.length?v.reduce((a,b)=>a+b,0)/v.length:null,max:v.length?Math.max(...v):null}};
</script>
<template>
<div ref="plot" class="hx-chart" tabindex="0" role="group" aria-label="历史图，可用左右方向键查看样本" @pointermove="pointer" @keydown="keyboard">
<svg :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="lines.map(l=>l.label).join('、')+'历史'">
<g v-for="i in 5" :key="i"><path class="hx-grid" :d="`M44 ${y(cap*(i-1)/4)}H${width-16}`"/><text x="35" :y="y(cap*(i-1)/4)+4" text-anchor="end">{{num(cap*(i-1)/4)}}</text></g>
<text v-if="history?.samples.length" x="44" :y="height-10">{{clock(bounds[0])}}</text><text v-if="history?.samples.length" :x="width-16" :y="height-10" text-anchor="end">{{clock(bounds[1])}}</text>
<path v-for="l in lines" :key="l.label" class="hx-line" :stroke="l.color" :d="linePath(l.points,history?.interval||1,x,y)"/>
<line v-if="history?.samples.length" class="hx-crosshair" :x1="x(history.samples[index]?.updated??bounds[0])" :x2="x(history.samples[index]?.updated??bounds[0])" y1="16" :y2="height-34"/>
<g v-for="l in lines" :key="l.label"><circle v-if="l.points[index]?.v!==null&&l.points[index]" :cx="x(l.points[index].t)" :cy="y(l.points[index].v)" r="4" :fill="l.color"/></g>
</svg><span v-if="!history?.samples.length" class="history-empty">无有效历史样本</span></div>
<div class="hx-readout" aria-live="polite"><span>{{history?.samples[index]?clock(history.samples[index].updated):'—'}}</span><span v-for="l in lines" :key="l.label"><i :style="{background:l.color}"></i>{{l.label}} <b>{{num(l.points[index]?.v)}} {{l.unit}}</b></span></div>
<div class="hx-stat-grid" :style="{gridTemplateColumns:`repeat(${lines.length},minmax(0,1fr))`}"><div v-for="l in lines" :key="l.label" class="hx-stat"><div class="hx-stat-top"><i :style="{background:l.color}"></i>{{l.label}}</div><strong>{{num(l.points.at(-1)?.v)}}<small>{{l.unit}}</small></strong><div class="hx-stat-bottom">均值 {{num(stats(l).avg)}} · 峰值 {{num(stats(l).max)}}</div></div></div>
</template>
<style scoped>.history-empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:12px;pointer-events:none}</style>
