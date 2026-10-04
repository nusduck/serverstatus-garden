<script setup>
import {computed} from 'vue';
import {historySeries} from './history.js';
import {windowOf} from './insights.js';
import {statusText,num,splitRate} from './format.js';
import Spark from './Spark.vue';
import QualityStrip from './QualityStrip.vue';
const props=defineProps({node:Object,bins:{type:Array,default:()=>[[],[],[]]},history:Object,range:String,selected:Boolean,card:Boolean});
const emit=defineEmits(['select']);
const n=computed(()=>props.node);
const win=computed(()=>windowOf(props.history));
// Keyed by the stable id so the 1 s clock does not recompute history series.
const id=computed(()=>props.node.id);
const rx=computed(()=>historySeries(props.history,id.value,'network_rx')),tx=computed(()=>historySeries(props.history,id.value,'network_tx'));
const down=computed(()=>splitRate(n.value.fresh?n.value.raw.network_rx:null,n.value.raw.si)),up=computed(()=>splitRate(n.value.fresh?n.value.raw.network_tx:null,n.value.raw.si));
const load=computed(()=>n.value.fresh&&Number.isFinite(n.value.raw.load_1)?n.value.raw.load_1.toFixed(2):'—');
const label=computed(()=>`${n.value.name}，${statusText[n.value.key]}，CPU ${num(n.value.cpu,0)}%，内存 ${num(n.value.memory,0)}%，磁盘 ${num(n.value.disk,0)}%，`+n.value.qualities.map(q=>`${q.label} ${num(q.q.latency,0)} 毫秒`).join('，'));
</script>
<template>
<article :class="[card?'card':'mx-r',{dim:!node.fresh,selected}]" @click="emit('select',node,$event)">
 <div class="nm"><span class="st" :data-s="node.key"></span><div><button class="nm-btn" :aria-pressed="selected" :aria-label="label" @click.stop="emit('select',node,$event)">{{node.name}}</button><span v-if="node.key==='offline'" class="tag warn">离线</span><span v-else-if="node.key==='stale'" class="tag">过期</span><span class="sub">{{node.code}} · {{node.os}} · {{[node.raw.online4&&'v4',node.raw.online6&&'v6'].filter(Boolean).join(' / ')||'—'}}</span></div></div>
 <div class="res"><div v-for="[l,v,c] in [['CPU',node.cpu,'--c-cpu'],['内存',node.memory,'--c-mem'],['磁盘',node.disk,'--c-disk']]" :key="l" class="mtr" :class="{hot:v!==null&&v>=80}" :style="{'--c':`var(${c})`}" :data-tip="l+' '+num(v)+'%'"><span class="num">{{num(v,0)}}<small>%</small></span><span class="bar"><i :style="{width:(v??0)+'%'}"></i></span></div></div>
 <div class="net"><span class="arr">↓</span><span class="num">{{down[0]}}<small>{{down[1]}}</small></span><span class="arr">↑</span><span class="num">{{up[0]}}<small>{{up[1]}}</small></span><Spark :points="rx" :points2="tx" :start="win.start" :end="win.end" :interval="history?.interval" color="--c-rx" color2="--c-tx" :height="16"/></div>
 <div class="qcol"><div v-for="(q,i) in node.qualities" :key="q.key" class="q-line"><span>{{q.label.slice(0,1)}}</span><QualityStrip :bins="bins[i]" :label="node.name+' · '+q.label" :range="range"/><span class="num">{{num(q.q.latency,0)}}<small>ms</small></span><span class="ls" :class="{bad:q.q.loss>=5}">{{q.q.loss===null?'—':num(q.q.loss)+'%'}}</span></div></div>
 <div v-if="!card" class="upt"><span class="num">{{node.fresh?node.uptime:'—'}}</span><span class="label num">{{load}}</span></div>
</article>
</template>
