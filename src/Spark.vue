<script setup>
import {computed} from 'vue';
// Inline trend on the requested window's time scale; absent buckets break the line.
const props=defineProps({points:{type:Array,default:()=>[]},points2:{type:Array,default:null},start:Number,end:Number,interval:{type:Number,default:60},max:Number,color:{type:String,default:'--accent'},color2:{type:String,default:'--c-tx'},height:{type:Number,default:22},area:{type:Boolean,default:true}});
const W=100;
const geo=computed(()=>{
 const all=[...props.points,...(props.points2||[])].map(p=>p.v).filter(v=>v!==null&&Number.isFinite(v));
 if(!all.length)return null;
 const h=props.height,top=props.max??(Math.max(...all)*1.1||1),span=Math.max(1,(props.end??1)-(props.start??0));
 const x=t=>((t-(props.start??0))/span*W).toFixed(2),y=v=>(h-1-Math.min(1,v/top)*(h-3)).toFixed(2);
 const runs=pts=>{const out=[];let run=[],last=null;for(const p of pts){if(p.v===null||!Number.isFinite(p.v)||(last!==null&&p.t-last>props.interval*2)){if(run.length)out.push(run);run=[]}if(p.v!==null&&Number.isFinite(p.v))run.push(p);last=p.t}if(run.length)out.push(run);return out};
 const line=pts=>runs(pts).map(r=>r.map((p,i)=>(i?'L':'M')+x(p.t)+','+y(p.v)).join('')).join('');
 const fill=runs(props.points).filter(r=>r.length>1).map(r=>'M'+x(r[0].t)+','+(h-1)+r.map(p=>'L'+x(p.t)+','+y(p.v)).join('')+'L'+x(r.at(-1).t)+','+(h-1)+'Z').join('');
 return {line:line(props.points),line2:props.points2?line(props.points2):'',fill};
});
</script>
<template>
<svg class="spark" :viewBox="`0 0 ${W} ${height}`" :height="height" preserveAspectRatio="none" aria-hidden="true">
 <template v-if="geo"><path v-if="area" :d="geo.fill" :fill="`var(${color})`" fill-opacity=".14"/><path :d="geo.line" fill="none" :stroke="`var(${color})`" stroke-width="1.3" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><path v-if="geo.line2" :d="geo.line2" fill="none" :stroke="`var(${color2})`" stroke-width="1.1" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></template>
 <line v-else x1="0" :x2="W" :y1="height-1" :y2="height-1" stroke="var(--line-strong)" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>
</svg>
</template>
