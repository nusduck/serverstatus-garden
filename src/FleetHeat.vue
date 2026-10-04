<script setup>
import {computed,ref} from 'vue';
import {heatBins,windowOf} from './insights.js';
import {stamp,tick,num} from './format.js';
const props=defineProps({servers:Array,history:Object,range:String});
const emit=defineEmits(['select']);
const metric=ref('cpu');
const spec={cpu:{label:'CPU',top:100,hue:'--accent',fmt:v=>num(v)+'%',max:'100%'},lat:{label:'最低延迟',top:400,hue:'--slow',fmt:v=>num(v,0)+' ms',max:'≥ 400 ms'},loss:{label:'最大失败率',top:10,hue:'--loss',fmt:v=>num(v)+'%',max:'≥ 10%'}};
// Cells depend on the id list, not on the per-second server objects.
const ids=computed(()=>props.servers.map(s=>s.id).join('\n'));
const cells=computed(()=>Object.fromEntries(ids.value.split('\n').filter(Boolean).map(id=>[id,heatBins(props.history,id,metric.value)])));
const rows=computed(()=>props.servers.map(s=>({s,cells:cells.value[s.id]??[]})));
const win=computed(()=>windowOf(props.history));
const fill=v=>{const p=Math.round(Math.min(1,Math.max(0,v/spec[metric.value].top))**.8*100);return `color-mix(in oklab,var(${spec[metric.value].hue}) ${Math.max(6,p)}%,var(--heat-lo))`};
</script>
<template>
<section class="panel" aria-label="花园热力图">
 <div class="panel-head"><h2>花园热力</h2>
  <div class="seg" role="group" aria-label="热力指标"><button v-for="(v,k) in spec" :key="k" :aria-pressed="metric===k" @click="metric=k">{{v.label}}</button></div>
  <div class="right scale"><span>0</span><span class="grad" :style="{background:`linear-gradient(90deg,var(--heat-lo),var(${spec[metric].hue}))`}"></span><span>{{spec[metric].max}}</span></div></div>
 <div class="heat">
  <div v-if="!history?.samples.length" class="empty">历史正在采集，热力图会随服务端历史逐格出现。</div>
  <div class="hm" :class="{faint:!history?.samples.length}">
   <template v-for="r in rows" :key="r.s.id"><button class="nmc" @click="emit('select',r.s,$event)">{{r.s.name}}</button>
    <div class="cells" aria-hidden="true"><i v-for="(c,i) in r.cells" :key="i" :class="{'g-unknown':c.v===null}" :style="c.v===null?null:{background:fill(c.v)}" :data-tip="r.s.name+' · '+stamp(c.start,range)+' · '+(c.v===null?'无数据':spec[metric].fmt(c.v))"></i></div></template>
   <span></span><div class="axis"><span>{{history?tick(win.start,range):''}}</span><span>{{range}} 窗口</span><span>{{history?tick(win.end,range):''}}</span></div>
  </div>
 </div>
</section>
</template>
