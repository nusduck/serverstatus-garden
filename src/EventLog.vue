<script setup>
import {computed} from 'vue';
import {historyEvents} from './insights.js';
import {stamp} from './format.js';
const props=defineProps({servers:Array,history:Object,range:String,message:String});
const emit=defineEmits(['select']);
const byId=computed(()=>new Map(props.servers.map(s=>[s.id,s])));
const all=computed(()=>historyEvents(props.history));
const events=computed(()=>all.value.filter(e=>e.id===null||byId.value.has(e.id)));
const color={down:'--fail',loss:'--loss',warn:'--lightloss',up:'--ok',gap:'--muted'};
</script>
<template>
<section class="panel" aria-label="状态变化">
 <div class="panel-head"><h2>状态变化</h2><span class="label">{{history?`${range} 内 ${events.length} 条 · 由服务端历史推导`:message}}</span></div>
 <ol class="events">
  <li v-for="(e,i) in events.slice(0,60)" :key="i"><time>{{stamp(e.t,range)}}</time><span class="dot" :style="{background:`var(${color[e.kind]})`}"></span><span><button v-if="e.id" class="ev-node" @click="emit('select',byId.get(e.id),$event)">{{byId.get(e.id).name}}</button> <span class="why">{{e.text}}</span></span></li>
  <li v-if="!events.length" class="none">{{history?'窗口内没有状态变化。':'等待服务端历史。'}}</li>
 </ol>
</section>
</template>
