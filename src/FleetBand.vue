<script setup>
import {computed} from 'vue';
import {carriers,formatBytes} from './history.js';
import {fleetSeries,gradeDistribution,median,windowOf} from './insights.js';
import {statusText,gradeText,num,splitRate} from './format.js';
import Spark from './Spark.vue';
const props=defineProps({servers:Array,summary:Object,bins:Object,history:Object,range:String});
const emit=defineEmits(['select']);
const win=computed(()=>windowOf(props.history));
const dotColor={online:'--ok',attention:'--lightloss',warning:'--lightloss',unknown:'--lightloss',stale:'--unknown',offline:'--fail'};
const attention=computed(()=>props.servers.filter(s=>s.key!=='online'));
const cpu=computed(()=>fleetSeries(props.history,'cpu','avg'));
const rx=computed(()=>fleetSeries(props.history,'network_rx')),tx=computed(()=>fleetSeries(props.history,'network_tx'));
const down=computed(()=>splitRate(props.summary.down)),up=computed(()=>splitRate(props.summary.up));
const colors=['--c-ct','--c-cu','--c-cm'];
const latency=computed(()=>carriers.map(([label],i)=>({label,color:colors[i],v:median(props.servers.filter(s=>s.fresh).map(s=>s.qualities[i].q.latency))})));
const dist=computed(()=>gradeDistribution(Object.values(props.bins).flat()));
const total=computed(()=>Object.values(dist.value).reduce((a,b)=>a+b,0));
const okRate=computed(()=>{const known=total.value-dist.value.unknown;return known?dist.value.normal/known*100:null});
const sum=k=>{const v=props.servers.filter(s=>s.fresh&&Number.isFinite(s.raw[k])).map(s=>s.raw[k]);return v.length?v.reduce((a,b)=>a+b,0):null};
</script>
<template>
<section class="band" aria-label="全局概览">
 <div class="cell"><span class="label">在线节点</span><span class="big">{{summary.online}}<small>/ {{summary.total}}</small></span>
  <div class="dots"><button v-for="s in servers" :key="s.id" :style="{background:`var(${dotColor[s.key]})`}" :data-tip="s.name+' — '+statusText[s.key]" :aria-label="s.name+' '+statusText[s.key]" @click="emit('select',s,$event)"></button></div></div>
 <div class="cell"><span class="label">需要留意</span><span class="big" :class="{alert:attention.length}">{{attention.length}}<small>个节点</small></span>
  <div class="chips"><span v-for="s in attention.slice(0,3)" :key="s.id">{{s.name}} <em>· {{statusText[s.key]}}</em></span><span v-if="attention.length>3"><em>另有 {{attention.length-3}} 个</em></span><span v-if="!attention.length&&servers.length"><em>全部正常</em></span></div></div>
 <div class="cell"><span class="label">平均 CPU · 新鲜心跳</span><span class="big">{{num(summary.cpu)}}<small>%</small></span><Spark :points="cpu" :start="win.start" :end="win.end" :interval="history?.interval" :max="100" color="--c-cpu" :height="24"/></div>
 <div class="cell"><span class="label">即时吞吐 · {{range}} 趋势</span><span class="big">{{down[0]}}<small>{{down[1]}} ↓</small><span class="num up">{{up[0]}} <small>{{up[1]}} ↑</small></span></span><Spark :points="rx" :points2="tx" :start="win.start" :end="win.end" :interval="history?.interval" color="--c-rx" color2="--c-tx" :height="24"/></div>
 <div class="cell"><span class="label">三网中位延迟 · 当前</span><div v-for="c in latency" :key="c.label" class="ctr"><span>{{c.label}}</span><span class="bar"><i :style="{width:Math.min(100,(c.v??0)/500*100)+'%',background:`var(${c.color})`}"></i></span><span class="num">{{num(c.v,0)}}<small>ms</small></span></div></div>
 <div class="cell"><span class="label">线路正常率 · {{range}} 时间条</span><span class="big">{{num(okRate)}}<small>%</small></span>
  <div class="dist"><i v-for="(v,g) in dist" v-show="v" :key="g" :class="'g-'+g" :style="{flex:v}" :data-tip="gradeText[g]+' '+v+' 段 · '+(v/total*100).toFixed(1)+'%'"></i></div>
  <span class="label">累计 ↓ {{formatBytes(sum('network_in'))}} · ↑ {{formatBytes(sum('network_out'))}}</span></div>
</section>
</template>
