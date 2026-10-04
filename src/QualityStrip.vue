<script setup>
import {ref} from 'vue';
import {gradeText,num,stamp} from './format.js';
// Left is oldest. Each cell is the worst observation in its bucket; partial coverage stays unknown.
const props=defineProps({bins:{type:Array,default:()=>[]},label:String,range:{type:String,default:'1h'},interactive:Boolean});
const emit=defineEmits(['readout']);
const index=ref(null);
const text=b=>`${props.label} ${stamp(b.start,props.range)}—${stamp(b.end,props.range)} · ${gradeText[b.grade]}`+(b.latency===null?'':` · ${num(b.latency)} ms · 滚动 TCP 失败率 ${num(b.loss)}%`);
function move(e){if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const cells=[...e.currentTarget.parentElement.children],i=cells.indexOf(e.currentTarget),n=e.key==='Home'?0:e.key==='End'?cells.length-1:Math.max(0,Math.min(cells.length-1,i+(e.key==='ArrowRight'?1:-1)));index.value=n;cells[n].focus()}
</script>
<template>
<div v-if="interactive" class="strip wide" role="group" :aria-label="label+'质量历史，左旧右新'"><button v-for="(b,i) in bins" :key="i" :class="'g-'+b.grade" :tabindex="i===(index??bins.length-1)?0:-1" :aria-label="text(b)" :data-tip="text(b)" @focus="emit('readout',text(b))" @blur="emit('readout','')" @keydown="move"></button></div>
<div v-else class="strip" aria-hidden="true"><i v-for="(b,i) in bins" :key="i" :class="'g-'+b.grade" :data-tip="text(b)"></i></div>
</template>
