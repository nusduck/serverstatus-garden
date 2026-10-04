<script setup>
import {computed,ref,onMounted,onUnmounted} from 'vue';
import {linePath} from './history.js';
import {tick,stamp} from './format.js';
// Series share the history's bucket timestamps. Gaps stay open and are shaded, never interpolated.
const props=defineProps({series:{type:Array,default:()=>[]},history:Object,range:String,unit:String,max:Number,threshold:Number,mirror:Boolean,height:{type:Number,default:150},digits:{type:Number,default:0},label:String});
const plot=ref(null),width=ref(400),hover=ref(null);let observer;
function resize(){const w=plot.value?.getBoundingClientRect().width;if(w>0)width.value=w}
defineExpose({resize});
onMounted(()=>{resize();observer=new ResizeObserver(resize);observer.observe(plot.value)});onUnmounted(()=>observer?.disconnect());
const pad={l:38,r:8,t:8,b:20};
const g=computed(()=>{
 const h=props.history,w=width.value,H=props.height,ih=H-pad.t-pad.b,start=h?.start??0,end=h?.windowEnd??h?.end??start+1,span=Math.max(1,end-start);
 const values=props.series.flatMap(s=>s.points.map(p=>p.v)).filter(v=>v!==null&&Number.isFinite(v));
 const nice=v=>{if(!(v>0))return 1;const p=10**Math.floor(Math.log10(v));return [1,1.2,1.5,2,2.5,3,4,5,6,8,10].map(m=>m*p).find(m=>m>=v)};
 const top=props.max??nice(Math.max(props.threshold??0,...values,0)*1.08);
 const mid=pad.t+ih/2,x=t=>pad.l+(t-start)/span*(w-pad.l-pad.r);
 const y=props.mirror?v=>mid-v/top*ih/2:v=>pad.t+(1-v/top)*ih,yDown=v=>mid+v/top*ih/2;
 const ys=i=>props.mirror&&i===1?yDown:y;
 const base=props.mirror?mid:pad.t+ih;
 const ticks=props.mirror?[[top,pad.t],[0,mid],[top,pad.t+ih]]:[0,.25,.5,.75,1].map(f=>[top*f,y(top*f)]);
 const times=(h?.samples||[]).map(p=>p.updated),interval=h?.interval||60;
 const gaps=[];let prev=start;for(const t of [...times,end]){if(t-prev>interval*2)gaps.push([x(prev),x(t)]);prev=t}
 const lines=props.series.map((s,i)=>{const yy=ys(i),d=linePath(s.points,interval,x,yy);
  const area=s.area?d.split('M').filter(Boolean).map(seg=>{const pts=seg.split('L');if(pts.length<2)return '';const first=pts[0].split(',')[0],last=pts.at(-1).split(',')[0];return 'M'+first+','+base+'L'+seg+'L'+last+','+base+'Z'}).join(''):'';
  const lastPoint=[...s.points].reverse().find(p=>p.v!==null&&Number.isFinite(p.v));
  return {...s,d,area,dot:lastPoint?{cx:x(lastPoint.t),cy:yy(lastPoint.v)}:null}});
 return {w,H,ih,top,x,ys,ticks,gaps,lines,times,xticks:[start,start+span/3,start+span*2/3,end],threshold:props.threshold!==undefined&&props.threshold<=top&&!props.mirror?y(props.threshold):null};
});
const fmt=v=>v===null||v===undefined||!Number.isFinite(v)?'—':v.toFixed(props.digits);
const active=computed(()=>{const t=g.value.times;if(!t.length)return null;return hover.value??t.length-1});
const readout=computed(()=>{const i=active.value;if(i===null)return null;const t=g.value.times[i];return {t,values:props.series.map(s=>({label:s.label,color:s.color,v:s.points[i]?.v??null}))}});
function move(e){const t=g.value.times;if(!t.length)return;const r=plot.value.getBoundingClientRect(),px=e.clientX-r.left;let best=0;for(let i=1;i<t.length;i++)if(Math.abs(g.value.x(t[i])-px)<Math.abs(g.value.x(t[best])-px))best=i;hover.value=best}
</script>
<template>
<div class="hx-chart" ref="plot">
 <svg :viewBox="`0 0 ${g.w} ${g.H}`" :height="g.H" role="img" :aria-label="label" @pointermove="move" @pointerleave="hover=null">
  <rect v-for="(r,i) in g.gaps" :key="'g'+i" class="hx-gap" :x="r[0]" :y="8" :width="Math.max(1,r[1]-r[0])" :height="g.ih"/>
  <g v-for="([v,yy],i) in g.ticks" :key="'t'+i"><line class="hx-grid" :x1="38" :x2="g.w-8" :y1="yy" :y2="yy" :stroke-dasharray="v===0?null:'1 3'"/><text :x="32" :y="yy+3" text-anchor="end">{{fmt(v)}}</text></g>
  <template v-if="g.threshold!==null"><line class="hx-thr" :x1="38" :x2="g.w-8" :y1="g.threshold" :y2="g.threshold"/><text class="hx-thr-label" :x="g.w-8" :y="g.threshold-4" text-anchor="end">{{threshold}} {{unit}}</text></template>
  <template v-if="history?.samples.length"><text v-for="(t,i) in g.xticks" :key="'x'+i" :x="g.x(t)" :y="g.H-5" :text-anchor="i===0?'start':i===3?'end':'middle'">{{tick(t,range)}}</text></template>
  <template v-for="(s,i) in g.lines" :key="s.label"><path v-if="s.area" :d="s.area" :fill="`var(${s.color})`" fill-opacity=".13"/><path :d="s.d" class="hx-line" :stroke="`var(${s.color})`"/><circle v-if="s.dot&&hover===null" :cx="s.dot.cx" :cy="s.dot.cy" r="2.8" :fill="`var(${s.color})`" class="hx-dot"/></template>
  <g v-if="hover!==null"><line class="hx-cross" :x1="g.x(g.times[hover])" :x2="g.x(g.times[hover])" :y1="8" :y2="8+g.ih"/><template v-for="(s,i) in g.lines" :key="'c'+i"><circle v-if="s.points[hover]?.v!==null&&s.points[hover]?.v!==undefined" :cx="g.x(g.times[hover])" :cy="g.ys(i)(s.points[hover].v)" r="3.2" :fill="`var(${s.color})`" class="hx-dot"/></template></g>
 </svg>
 <div class="hx-readout" aria-live="off"><template v-if="readout"><span class="t">{{stamp(readout.t,range)}}</span><span v-for="v in readout.values" :key="v.label"><i :style="{background:`var(${v.color})`}"></i>{{v.label}} <b>{{fmt(v.v)}}</b> {{v.v===null?'':unit}}</span></template><span v-else>历史正在采集，暂无可绘制的数据</span></div>
</div>
</template>
