/* Exact dated endpoints, unchanged 50/30/20 method; usable in Node and browser. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AionPeriod=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const scenarios=[[.5,.3,.2],[.6,.25,.15],[.7,.2,.1],[.55,.35,.1],[.45,.35,.2],[.9,.1,0],[.4,.4,.2],[.6,.4,0]];
 const known=v=>typeof v==='number'&&Number.isFinite(v);
 function percentile(a,v){if(a.length===1)return 50;return (a.filter(x=>x<v).length+(a.filter(x=>x===v).length-1)/2)/(a.length-1)*100;}
 function dates(start,end){let out=[];for(let d=new Date(start+'T00:00:00Z');d<=new Date(end+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1)){out.push(d.toISOString().slice(0,10));if(out.length>1000)throw Error('Слишком длинный период');}return out;}
 function priceChange(a,b){return a&&b&&known(a.price)&&a.price>0&&known(b.price)&&!a.provisional&&!b.provisional&&a.price_change_comparable&&b.price_change_comparable&&a.price_basis===b.price_basis?(b.price/a.price-1)*100:null;}
 function priceMovement(a,b){let exact=priceChange(a,b);if(exact!==null)return {pct:exact,approximate:false};if(a&&b&&known(a.price)&&a.price>0&&known(b.price))return {pct:(b.price/a.price-1)*100,approximate:true};return null;}
 function order(a,i=0){return a.slice().sort((x,y)=>Number(y.scores[i].toFixed(10))-Number(x.scores[i].toFixed(10))||y.daily-x.daily||y.tie-x.tie||x.server.localeCompare(y.server,'en'));}
 function compare(data,start,end){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start)throw Error('Начало периода должно быть не позже конца');
   let first=data.days.find(d=>d.date===start),last=data.days.find(d=>d.date===end);
   const index=d=>new Map((d?.rows||[]).map(r=>[r.id,r])),a=index(first),b=index(last);
   let rows=data.registry.map(meta=>{
     let x=a.get(meta.id),y=b.get(meta.id),r={...meta,start:x||null,end:y||null,score:null,scores:null,daily:null,perSeller:null,delta:null,elapsed:null,problems:[],prices:{}};
     for(let p of ['g2g','funpay'])r.prices[p]={start:x?.platforms[p]||null,end:y?.platforms[p]||null,change:priceChange(x?.platforms[p],y?.platforms[p]),movement:priceMovement(x?.platforms[p],y?.platforms[p])};
     if(!x)r.problems.push('Нет основного снимка на начало');
     if(!y)r.problems.push('Нет основного снимка на конец');
     if(x&&y){
       let same=x.counter_key&&y.counter_key&&x.counter_key.every(v=>v!==null)&&JSON.stringify(x.counter_key)===JSON.stringify(y.counter_key);
       if(!same||!known(x.counter)||!known(y.counter))r.problems.push('Нет сопоставимой пары счётчиков G2G');
       else{r.delta=y.counter-x.counter;r.elapsed=(Date.parse(y.counter_at)-Date.parse(x.counter_at))/86400000;
         if(r.delta<0)r.problems.push('Счётчик уменьшился: состав объявлений мог измениться');
         else if(r.delta===0)r.problems.push('Рост счётчика не зафиксирован');
         if(!known(r.elapsed)||r.elapsed<=0)r.problems.push('Нет положительного интервала наблюдений');
       }
       let g=y.platforms.g2g;
       if(!g.complete||!g.crosscheck||!known(g.sellers)||g.sellers<=0)r.problems.push('Нет полной проверенной выборки продавцов G2G');
       if(y.status!=='Online')r.problems.push('Нет подтверждения, что сервер в сети');
       if(!known(y.load24))r.problems.push('Нет средней загрузки за 24 часа');
     }
     if(r.problems.length===0){r.daily=r.delta/r.elapsed;r.perSeller=r.daily/y.platforms.g2g.sellers;r.tie=!y.platforms.funpay.provisional&&known(y.platforms.funpay.price)?y.platforms.funpay.price:-1;}
     return r;
   });
   for(let region of ['EU','NA-EAST','NA-WEST'])for(let age of ['NRD / Early Access','Free / Launch']){
     let pool=rows.filter(r=>r.region===region&&r.age===age&&!r.problems.length);
     for(let r of pool){r.factors=[percentile(pool.map(x=>x.daily),r.daily),percentile(pool.map(x=>x.perSeller),r.perSeller),percentile(pool.map(x=>x.end.load24),r.end.load24)];r.scores=scenarios.map(w=>w.reduce((s,v,i)=>s+v*r.factors[i],0));r.score=r.scores[0];r.cohortSize=pool.length;}
   }
   const present=new Set(data.days.map(d=>d.date));
   return {rows,start,end,first:first||null,last:last||null,missing:dates(start,end).filter(d=>!present.has(d)),endpointComplete:!!first&&!!last};
 }
 function filter(rows,o){return rows.filter(r=>(!o.region||r.region===o.region)&&(!o.faction||r.faction===o.faction)&&(!o.age||r.age===o.age)&&(!o.search||r.server.toLowerCase().includes(o.search.toLowerCase()))&&(o.entry!=='new'||r.end?.creation_blocked===false)&&(o.entry!=='closed'||r.end?.creation_blocked===true));}
 function group(rows,age,faction){let pool=rows.filter(r=>r.age===age&&r.faction===faction&&r.scores),sorted=order(pool);return sorted.map(r=>{let positions=scenarios.map((_,i)=>order(pool,i).findIndex(x=>x.id===r.id)+1);return {...r,robust:{min:Math.min(...positions),max:Math.max(...positions),top5:positions.filter(x=>x<=5).length}};});}
 function union(rows,p,side='end'){const sets=rows.map(r=>r[side]?.platforms[p]?.seller_ids);if(!sets.length||sets.some(x=>!Array.isArray(x)))return null;return new Set(sets.flat().map(String)).size;}
 function availablePeriod(data,c){const inside=data.days.filter(d=>d.date>=c.start&&d.date<=c.end),future=c.end>data.days[data.days.length-1].date;for(let r of c.rows){let points=inside.map(d=>({date:d.date,row:d.rows.find(x=>x.id===r.id)})).filter(x=>x.row);r.available_start=points[0]?.date||null;r.available_end=points[points.length-1]?.date||null;if(!future){r.start=points[0]?.row||null;r.end=points[points.length-1]?.row||null;}for(let p of ['funpay','g2g']){let q=points.filter(x=>known(x.row.platforms[p].price)),first=q[0],last=q[q.length-1];if(!future)r.prices[p]={start:first?.row.platforms[p]||null,end:last?.row.platforms[p]||null,start_date:first?.date||null,end_date:last?.date||null,change:priceChange(first?.row.platforms[p],last?.row.platforms[p]),movement:first&&last&&first.date!==last.date?priceMovement(first.row.platforms[p],last.row.platforms[p]):null};}}return c;}
 function availableUnion(rows,p){const covered=rows.filter(r=>Array.isArray(r.end?.platforms[p]?.seller_ids));return {count:new Set(covered.flatMap(r=>r.end.platforms[p].seller_ids).map(String)).size,covered:covered.length,dates:[...new Set(covered.map(r=>r.available_end).filter(Boolean))].sort()};}
 function movements(a,b){if(!Array.isArray(a)||!Array.isArray(b))return null;let x=new Set(a.map(String)),y=new Set(b.map(String));return {added:[...y].filter(id=>!x.has(id)).length,removed:[...x].filter(id=>!y.has(id)).length};}
 function sampledLoad(data,id,start,end){let points=data.days.filter(d=>d.date>=start&&d.date<=end).map(d=>({date:d.date,row:d.rows.find(r=>r.id===id)})).filter(p=>known(p.row?.load_sample_mean)&&p.row.load_sample_count>0),count=points.reduce((n,p)=>n+p.row.load_sample_count,0);return {count,mean:count?points.reduce((n,p)=>n+p.row.load_sample_mean*p.row.load_sample_count,0)/count:null,days:points.map(p=>p.date)};}
 function external(data,id,start,end){let s=data.external.find(x=>x.id===id),points=s?.points.filter(p=>p.date>=start&&p.date<=end)||[];return {source:s||null,points,first:points.find(p=>p.date===start)||null,last:points.find(p=>p.date===end)||null};}
 function proceeds(gross,p,fees){if(!known(gross)||gross<0)return null;if(p==='g2g')return gross*(1-fees.g2g_sale_fee_fraction);let balance=gross/fees.funpay_catalog_to_seller_divisor,fee=Math.max(balance*fees.funpay_withdrawal_fee_fraction,fees.funpay_minimum_withdrawal_fee_rub);return balance>=fee?balance-fee:null;}
 function farmChoice(data,server,gs,isAlt){const chosen=isAlt?data.alt_dungeon:data.main_dungeon;if(chosen){const gates={'Krao Cave':700,'Draupnir':700,'Urugugu Canyon':1400,'Vakron Sky Island':1400,'Fire Temple':2100,'Ferocious Horn Den':2100};if(!gates[chosen]||gates[chosen]>Number(gs))throw Error('Dungeon unavailable for selected GS');return server.dungeon_scenarios?.[chosen]||null;}return isAlt&&gs==='2100'&&data.alt_farm==='fire'?server.dungeon_scenarios?.['Fire Temple']||server.profiles[gs+'-'+gs]:server.profiles[gs+'-'+gs];}
/* Opt-in October 2026 energy rules. Prices/yields remain the archived model inputs. */
function eventEnergyReference(data,ref,server,profile,n){
 const [main,alt]=profile.split('-'),a=farmChoice(data,server,main,false),b=farmChoice(data,server,alt,true);
 if(!a||(n>0&&!b))return null;
 const temporary=!!data.transfer_energy,shop=temporary?20:(data.energy_shop?4:0),shared=temporary?0:(data.energy_account?16:0),halloween=data.halloween_energy?4:0;
 const recipient=n>0&&b.assessed_weekly_kina_min>a.assessed_weekly_kina_min?1:0;
 const claims=Array.from({length:n+1},(_,i)=>21+shop+(i===recipient?shared+halloween:0));
 const runs=[];let direct=0,loot=0,lootMax=0;
 claims.forEach((count,i)=>{const source=i===0?a:b,d=source.weekly_direct_kina_min/126,l=source.weekly_loot_after_tax_min/126,hi=source.assessed_weekly_kina_max/126-d;loot+=count*l;lootMax+=count*hi;for(let j=0;j<Math.ceil(count/2);j++)runs.push(d*Math.min(2,count-j*2));});
 runs.sort((x,y)=>y-x).forEach((value,i)=>{direct+=value*(i<84?1:i<105?.8:i<126?.6:i<147?.4:.2);});
 return {...ref,main_dungeon:a.main_dungeon,alts_dungeon:b?.main_dungeon||a.main_dungeon,weekly_direct_kina_min:direct,weekly_loot_after_tax_min:loot,energy_cost_kina:0,assessed_weekly_kina_min:direct+loot,assessed_weekly_kina_max:direct+lootMax,weekly_physical_runs:runs.length,scenario_hours_at_12_minutes:runs.length*.2,account_energy_claims:shared,account_energy_recipient:recipient===0?'main':'alt',penalized_runs:Math.max(0,runs.length-84),event_character_claims:claims,event_bound_cost:100000*(shop*(n+1)+shared)};
}
function eventBoundIncome(data,ref){
 if(!ref||!data.bound_vendor)return null;
 const rows=data.bound_vendor.dungeons,a=rows.find(x=>x.dungeon===ref.main_dungeon),b=rows.find(x=>x.dungeon===ref.alts_dungeon),accounts=data.accounts??1;
 if(!a||ref.event_character_claims.length>1&&!b)return null;
 const earned=ref.event_character_claims.reduce((sum,count,i)=>sum+count*(i===0?a:b).per_reward_min,0)*accounts,cost=ref.event_bound_cost*accounts;
 return {earned,cost,balance:earned-cost};
}

 function withAccountEnergy(data,ref,server,profile,n){if(data.transfer_energy||data.halloween_energy)return eventEnergyReference(data,ref,server,profile,n);if(!data.energy_account)return ref;const [main,alt]=profile.split('-'),a=farmChoice(data,server,main,false),b=farmChoice(data,server,alt,true),count=data.energy_shop?25:21,recipient=n>0&&b.assessed_weekly_kina_min>a.assessed_weekly_kina_min?1:0,claims=Array.from({length:n+1},(_,i)=>count+(i===recipient?16:0)),runs=[];let direct=0,loot=0,directMax=0,lootMax=0;for(let i=0;i<claims.length;i++){const source=i===0?a:b,d=source.weekly_direct_kina_min/126,l=source.weekly_loot_after_tax_min/126,hi=source.assessed_weekly_kina_max/126-d;loot+=claims[i]*l;lootMax+=claims[i]*hi;for(let j=0;j<Math.ceil(claims[i]/2);j++){const size=Math.min(2,claims[i]-j*2);runs.push({direct:d*size});}}runs.sort((x,y)=>y.direct-x.direct);runs.forEach((r,i)=>{const multiplier=i<84?1:i<105?.8:i<126?.6:i<147?.4:.2;direct+=r.direct*multiplier;});const cost=0;return {...ref,weekly_direct_kina_min:direct,weekly_loot_after_tax_min:loot,energy_cost_kina:cost,assessed_weekly_kina_min:direct+loot-cost,assessed_weekly_kina_max:direct+lootMax-cost,weekly_physical_runs:runs.length,scenario_hours_at_12_minutes:runs.length*.2,account_energy_claims:16,account_energy_recipient:recipient===0?'main':'alt',penalized_runs:Math.max(0,runs.length-84)};}
 function withShopEnergy(data,ref,n){if(!data.energy_shop)return ref;const out={...ref},count=Number(data.energy_shop);if(count!==4)throw Error('Only screenshot-verified shop limit supported');for(const k of ['assessed_weekly_kina_min','assessed_weekly_kina_max','weekly_direct_kina_min','weekly_loot_after_tax_min'])out[k]=ref[k]*25/21;out.energy_cost_kina=0;out.assessed_weekly_kina_min-=out.energy_cost_kina;out.assessed_weekly_kina_max-=out.energy_cost_kina;out.weekly_physical_runs=13*(n+1);out.scenario_hours_at_12_minutes=out.weekly_physical_runs*.2;return out;}
 function singleRosterReference(data,row,profile){const server=data.income_reference?.rows.find(x=>x.region===row.region&&x.server===row.server),base=server?.profiles[profile];if(!base)return null;const n=data.roster_alts??5;if(!Number.isInteger(n)||n<0||n>9)throw Error('Supported roster: 0–9 alts');if(n===5&&data.alt_farm!=='fire'&&!data.main_dungeon&&!data.alt_dungeon)return withAccountEnergy(data,withShopEnergy(data,{...base},n),server,profile,n);const [main,alt]=profile.split('-'),a=farmChoice(data,server,main,false),b=farmChoice(data,server,alt,true);if(!a||!b)return null;const ref={...base,main_dungeon:a.main_dungeon,alts_dungeon:b.main_dungeon};for(const key of ['assessed_weekly_kina_min','assessed_weekly_kina_max','weekly_direct_kina_min','weekly_loot_after_tax_min'])ref[key]=(a[key]+n*b[key])/6;ref.weekly_physical_runs=11*(n+1);ref.scenario_hours_at_12_minutes=ref.weekly_physical_runs*.2;return withAccountEnergy(data,withShopEnergy(data,ref,n),server,profile,n);}
 function rosterReference(data,row,profile){const ref=singleRosterReference(data,row,profile);if(!ref)return null;const count=data.accounts??1;if(!Number.isInteger(count)||count<1||count>10)throw Error('Supported account count: 1–10');const out={...ref,accounts:count,per_account_subscription_rub:ref.subscription_paid_rub};for(const key of ['assessed_weekly_kina_min','assessed_weekly_kina_max','weekly_direct_kina_min','weekly_loot_after_tax_min','energy_cost_kina','weekly_physical_runs','scenario_hours_at_12_minutes','subscription_paid_rub','account_energy_claims','penalized_runs'])if(known(ref[key]))out[key]=ref[key]*count;return out;}
 function income(data,row,profile,p){let ref=rosterReference(data,row,profile),q=row.end?.platforms[p];if(!ref||!known(q?.price))return null;let low=proceeds(ref.assessed_weekly_kina_min/1e6*(data.sale_fraction??1)*q.price,p,data.sale_fees),high=proceeds(ref.assessed_weekly_kina_max/1e6*(data.sale_fraction??1)*q.price,p,data.sale_fees);if(low===null||high===null)return null;return {min:low-ref.subscription_paid_rub,max:high-ref.subscription_paid_rub,reference:ref,priceProvisional:q.provisional};}
 // Display order of an already selected market shortlist. Does not change eligibility or scores.
 function funpayOrder(data,rows,profile){const values=new Map(rows.map(r=>[r.id,income(data,r,profile,'funpay')?.min??null]));return rows.slice().sort((a,b)=>{let x=values.get(a.id),y=values.get(b.id);return Number(known(y))-Number(known(x))||(known(x)&&known(y)?y-x:0)||(b.score??-1)-(a.score??-1)||a.server.localeCompare(b.server,'en');});}
 function median(values){const a=values.slice().sort((a,b)=>a-b),n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null;}
 function smoothFactors(value,reference,policy){
   const clip=x=>Math.max(0,Math.min(100,x)),review=policy.activity_source==='review_sales';
   const sat=(x,med)=>x+med>0?100*x/(x+med):0,shrink=policy.activity_shrinkage_sellers??3,volumeShare=policy.activity_volume_share??0,med=reference.activity_median||0;
   let activity;
   if(value.activity===null)activity=review?null:0;                                  // v6: без выборки компонент не считается вместо нейтрального вклада
   else if(!review)activity=sat(value.activity,med)*Math.min(1,(value.reduction_sellers??3)/policy.min_reduction_sellers);
   else{const n=Number(value.review_sellers)||0;
     const intensity=value.activity===0?0:sat((n*value.activity+shrink*med)/(n+shrink),med);   // малая выборка прижимается к медиане; наблюдаемый ноль остаётся нулём
     if(volumeShare>0){const sales=Number(value.review_sales)||0,smed=reference.sales_median||0;
       const volume=sales===0?0:sat((n*sales+shrink*smed)/(n+shrink),smed);           // вторая половина — общий объём продаж против своей когорты
       activity=(1-volumeShare)*intensity+volumeShare*volume;}
     else activity=intensity;}
   return [clip(100*value.payout/reference.best_income),activity,100*reference.sellers_median/(value.sellers+reference.sellers_median),value.price_daily_pct===null?0:50+50*value.price_daily_pct/(Math.abs(value.price_daily_pct)+policy.price_daily_soft_scale_pct),clip(value.load)];
 }
 function rankFunpay(data,comparison,profile){
   const policy=data.funpay_ranking_policy;if(!policy)return comparison.rows;
   let index=new Map();for(let x of data.funpay_listing_intervals||[])if(x.from_day>=comparison.start&&x.to_day<=comparison.end){if(!index.has(x.id))index.set(x.id,[]);index.get(x.id).push(x);}
   for(let r of comparison.rows){
     let points=index.get(r.id)||[],opportunities=points.reduce((s,x)=>s+x.observations,0),reductions=points.reduce((s,x)=>s+x.reductions,0),sellers=new Set(points.flatMap(x=>x.reduction_seller_ids)),exposureHours=points.reduce((s,x)=>s+x.exposure_hours,0);
     let first=points.length?points.reduce((a,b)=>a.from<b.from?a:b).from:null,last=points.length?points.reduce((a,b)=>a.to>b.to?a:b).to:null,hours=first&&last?(Date.parse(last)-Date.parse(first))/3600000:0;
     let observedHours=points.reduce((s,x)=>s+(Date.parse(x.to)-Date.parse(x.from))/3600000,0);
     let quotes=data.days.filter(d=>d.date>=comparison.start&&d.date<=comparison.end).map(d=>({date:d.date,q:d.rows.find(x=>x.id===r.id)?.platforms.funpay})).filter(x=>known(x.q?.price)&&x.q.price>0&&!x.q.provisional&&x.q.price_change_comparable&&x.q.price_basis===r.end?.platforms.funpay.price_basis);
     let q0=quotes[0],q1=quotes[quotes.length-1],priceDays=q0&&q1?(Date.parse(q1.q.price_at)-Date.parse(q0.q.price_at))/86400000:0,retention=priceDays>0?(Math.pow(q1.q.price/q0.q.price,1/priceDays)-1)*100:null,payout=income(data,r,profile,'funpay'),problems=[],warnings=[];
     if(comparison.end>data.days[data.days.length-1].date)problems.push('Конец выбранного периода ещё не наступил');
     if(!r.end)problems.push('Нет сбора на выбранную конечную дату');
     else{if(!r.end.platforms.funpay.complete)problems.push('Нет полной выборки продавцов FunPay');if(!payout||r.end.platforms.funpay.provisional)problems.push('Нет проверенной цены FunPay для выплаты');else if(payout.min<=0)warnings.push('Прогноз не покрывает подписку');if(r.end.status!=='Online')problems.push('Статус сервера не подтверждён');if(!known(r.end.load24))problems.push('Нет загрузки сервера');}
     if(points.length<policy.min_intervals||opportunities<policy.min_observations||observedHours<policy.min_observed_hours)warnings.push('Мало наблюдений за остатками; активность не оценена');
     if(!known(exposureHours)||exposureHours<=0)warnings.push('Нет сопоставимых часов объявлений');
     if(sellers.size<policy.min_reduction_sellers)warnings.push('Изменения остатков замечены у менее трёх продавцов');
     if(priceDays<1||retention===null||q1?.date!==(r.available_end||comparison.end))warnings.push('Не хватает истории цены; за её устойчивость баллы не начислены');
     const excluded={};for(let x of points)for(let [k,v] of Object.entries(x.excluded))excluded[k]=(excluded[k]||0)+v;
     r.funpay_rank={score:null,scores:null,problems,warnings,intervals:points.length,observations:opportunities,reductions,reduction_sellers:sellers.size,activity:exposureHours>0&&points.length>=policy.min_intervals&&opportunities>=policy.min_observations&&observedHours>=policy.min_observed_hours?reductions/exposureHours:null,exposure_hours:exposureHours,first,last,elapsed_hours:hours,observed_hours:observedHours,price_first:q0?.date||null,price_last:q1?.date||null,price_daily_pct:priceDays>=1&&q1?.date===(r.available_end||comparison.end)?retention:null,payout:payout?.min??null,excluded,partial_period:points.length?points.reduce((a,b)=>a.from_day<b.from_day?a:b).from_day>comparison.start:true,confirmed_sales:null};
   }
   if(policy.activity_source==='review_sales')for(let r of comparison.rows){
     const v=r.funpay_rank,source=data.funpay_review_sales,valid=source&&comparison.end>=source.period_start&&comparison.end>=source.period_end,review=valid?source.rows[r.id]:null;
     v.activity_source='review_sales';v.review_sales=review?.review_sales??null;v.review_sellers=review?.eligible_sellers??0;v.review_sellers_with_sales=review?.sellers_with_reviews??0;v.review_incomplete_histories=review?.incomplete_histories??0;v.review_period=source?.period_label??null;
     v.activity=review&&review.eligible_sellers>0?review.review_sales/review.eligible_sellers:null;
     v.warnings=v.warnings.filter(x=>!x.includes('остатк')&&!x.includes('часов объявлений'));
     if(v.activity===null)v.warnings.push('Нет подходящей выборки отзывов на эту дату: этот показатель не считается, его вес перераспределён по остальным, продажи неизвестны');
     else {v.warnings.push('Продажи по отзывам: '+source.period_label+'; это не число продаж за выбранные дни');if(v.review_sellers<3)v.warnings.push('Малая выборка проверенных продавцов');if(v.review_incomplete_histories)v.warnings.push('Часть историй отзывов просмотрена не полностью');}
   }
   for(let region of (comparison.all_regions?['']:['EU','NA-EAST','NA-WEST']))for(let age of ['NRD / Early Access','Free / Launch']){
     let pool=comparison.rows.filter(r=>(!region||r.region===region)&&r.age===age&&!r.funpay_rank.problems.length);
     if(!pool.length)continue;
     const reference={best_income:Math.max(1,...pool.map(x=>x.funpay_rank.payout)),activity_median:median(pool.map(x=>x.funpay_rank.activity).filter(x=>known(x)&&(policy.activity_source!=='review_sales'||x>0)))||0,sales_median:median(pool.map(x=>x.funpay_rank.review_sales).filter(x=>known(x)&&x>0))||0,sellers_median:median(pool.map(x=>x.end.platforms.funpay.sellers))};
     for(let r of pool){let v=r.funpay_rank;v.reference=reference;v.factors=smoothFactors({...v,sellers:r.end.platforms.funpay.sellers,load:r.end.load24},reference,policy);
      const available=v.factors.map(x=>known(x));                                   // v6: неизвестная ликвидность не получает баллов — вес перераспределяется
      v.scores=policy.scenarios.map(w=>{const denom=w.reduce((s,a,i)=>s+(available[i]?a:0),0)||1;return w.reduce((s,a,i)=>s+(available[i]?a*v.factors[i]:0),0)/denom;});
      v.score=v.scores[0];v.contributions=v.factors.map((x,i)=>available[i]?x*policy.scenarios[0][i]:null);v.cohort=pool.length;}
   }
   return comparison.rows;
 }
 function boundIncome(data,ref){if(ref?.event_character_claims)return eventBoundIncome(data,ref);if(!ref||!data.bound_vendor)return null;const rows=data.bound_vendor.dungeons,a=rows.find(x=>x.dungeon===ref.main_dungeon),b=rows.find(x=>x.dungeon===ref.alts_dungeon),n=data.roster_alts??5;if(!a||(n>0&&!b))return null;const count=data.energy_shop?25:21,extra=data.energy_account?16:0,accounts=data.accounts??1,mainClaims=count+(ref.account_energy_recipient==='alt'?0:extra),altClaims=n*count+(ref.account_energy_recipient==='alt'?extra:0),earned=(mainClaims*a.per_reward_min+altClaims*(b?.per_reward_min||0))*accounts,cost=((data.energy_shop?400000*(n+1):0)+(data.energy_account?1600000:0))*accounts;return {earned,cost,balance:earned-cost};}
 function funpayGroup(rows,age,faction,risky=false){let pool=rows.filter(r=>r.age===age&&r.faction===faction&&known(r.funpay_rank?.score)&&(r.funpay_rank.activity_source==='review_sales'?(risky?!(r.funpay_rank.review_sales>0&&r.funpay_rank.review_sellers>0):r.funpay_rank.review_sales>0&&r.funpay_rank.review_sellers>0):(risky?(r.funpay_rank.reduction_sellers<3||r.funpay_rank.activity===null||r.funpay_rank.activity<=0):r.funpay_rank.activity!==null&&r.funpay_rank.activity>0&&r.funpay_rank.reduction_sellers>=3)));const sorted=(i=0)=>pool.slice().sort((a,b)=>(risky?b.funpay_rank.payout-a.funpay_rank.payout:b.funpay_rank.scores[i]-a.funpay_rank.scores[i])||b.funpay_rank.payout-a.funpay_rank.payout||a.server.localeCompare(b.server,'en'));return sorted().map(r=>{let positions=r.funpay_rank.scores.map((_,i)=>sorted(i).findIndex(x=>x.id===r.id)+1);return {...r,funpay_robust:{min:Math.min(...positions),max:Math.max(...positions),top5:positions.filter(x=>x<=5).length}};});}
 return {scenarios,known,percentile,dates,priceChange,priceMovement,order,compare,filter,group,union,availablePeriod,availableUnion,sampledLoad,movements,external,proceeds,rosterReference,boundIncome,income,funpayOrder,rankFunpay,funpayGroup,median,smoothFactors};
});
