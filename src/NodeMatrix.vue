<script setup>
import {computed} from 'vue';
import {median} from './insights.js';
import NodeRow from './NodeRow.vue';
const props=defineProps({rows:Array,grouped:Boolean,cards:Boolean,bins:Object,history:Object,range:String,selectedId:String});
const emit=defineEmits(['select']);
const minLatency=s=>{const v=s.qualities.map(q=>q.q.latency).filter(v=>v!==null);return v.length?Math.min(...v):null};
const groups=computed(()=>{if(!props.grouped)return [{name:null,rows:props.rows}];const map=new Map();for(const s of props.rows){if(!map.has(s.region))map.set(s.region,[]);map.get(s.region).push(s)}
 return [...map].map(([name,rows])=>({name,rows,online:rows.filter(s=>s.fresh).length,latency:median(rows.map(minLatency))}))});
function keys(e){const keys={ArrowDown:1,j:1,ArrowUp:-1,k:-1};if(!(e.key in keys)||!e.target.classList.contains('nm-btn'))return;e.preventDefault();const all=[...e.currentTarget.querySelectorAll('.nm-btn')],i=all.indexOf(e.target),next=all[Math.max(0,Math.min(all.length-1,i+keys[e.key]))];next.focus();next.click()}
</script>
<template>
<div class="mx" :class="{cards}" @keydown="keys">
 <div v-if="!cards" class="mx-h" aria-hidden="true"><span>节点</span><span class="res"><span>CPU</span><span>内存</span><span>磁盘</span></span><span>网络 · {{range}}</span><span class="q-line"><span></span><span>三网质量 · {{range}} · 左旧右新</span><span>延迟</span><span>失败</span></span><span class="upt">运行 / 负载</span></div>
 <template v-for="g in groups" :key="g.name??'all'">
  <div v-if="g.name&&!cards" class="grp"><b>{{g.name}}</b><span class="num">{{g.online}}/{{g.rows.length}} 在线</span><span>中位最低延迟 <span class="num">{{g.latency??'—'}} ms</span></span><hr></div>
  <div :class="cards?'card-grid':'mx-body'"><NodeRow v-for="s in g.rows" :key="s.id" :node="s" :bins="bins[s.id]" :history="history" :range="range" :card="cards" :selected="s.id===selectedId" @select="(n,e)=>emit('select',n,e)"/></div>
 </template>
 <slot/>
</div>
</template>
