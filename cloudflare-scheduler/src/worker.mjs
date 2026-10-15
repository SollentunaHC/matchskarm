import {dueEvents,parseCSV,localParts} from './schedule.mjs';
const VERSION='1.0.1';
const CSV='https://raw.githubusercontent.com/SollentunaHC/matchskarm/main/Spelschema_2627.csv';
export async function dispatch(env,events) {
  if(!env.GITHUB_TOKEN)throw new Error('Missing GITHUB_TOKEN secret');
  const response=await fetch('https://api.github.com/repos/SollentunaHC/matchskarm/actions/workflows/laguppstallning.yml/dispatches',{
    method:'POST',headers:{'User-Agent':'SollentunaHC-lineup-scheduler','Accept':'application/vnd.github+json','Authorization':`Bearer ${env.GITHUB_TOKEN}`,'X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json'},
    body:JSON.stringify({ref:'main',inputs:{force:false,trigger_reason:[...new Set(events.map(e=>e.kind))].join(', ')}}),signal:AbortSignal.timeout(12000)
  });
  // GitHub returns 200 with run details or 204 without a response body.
  if(response.status!==200&&response.status!==204)throw new Error(`GitHub dispatch HTTP ${response.status}`);
}
export class MatchScheduler {
  constructor(state,env){this.state=state;this.env=env;}
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/status')return Response.json(await this.state.storage.get('status')||{state:'waiting_for_first_tick'});
    if(url.pathname!=='/tick'||request.method!=='POST')return new Response('Not found',{status:404});
    return this.state.blockConcurrencyWhile(async()=>{
      const now=Date.now();
      let record=await this.state.storage.get('record')||{done:{}};
      try {
        const local=localParts(now);
        // One schedule fetch per day at/after 02:00; initial install also needs a CSV.
        if(!record.games||(local.time>='02:00'&&record.csvDate!==local.date)) {
          const response=await fetch(CSV,{signal:AbortSignal.timeout(12000),headers:{'Cache-Control':'no-cache'}});
          if(!response.ok)throw new Error(`Schedule HTTP ${response.status}`);
          const games=parseCSV(await response.text());
          record.games=games;record.csvDate=local.date;record.csvCheckedAt=new Date(now).toISOString();
          await this.state.storage.put('record',record);
        }
        const events=dueEvents(record.games,now,record.done);
        // One persistent coordinator serializes overlapping ticks. Record only accepted dispatches.
        if(events.length){
          await dispatch(this.env,events);
          for(const event of events)record.done[event.key]=now;
          record.lastDispatchAt=new Date(now).toISOString();record.lastKinds=[...new Set(events.map(e=>e.kind))];
        }
        record.done=Object.fromEntries(Object.entries(record.done).filter(([,time])=>now-time<3*86400000));
        await this.state.storage.put('record',record);
        await this.state.storage.put('status',{service:'SHC uppdateringsstyrning',version:VERSION,state:'ok',configured:Boolean(this.env.GITHUB_TOKEN),lastTickAt:new Date(now).toISOString(),scheduleCheckedAt:record.csvCheckedAt,matchCount:record.games.length,lastDispatchAt:record.lastDispatchAt||null,lastKinds:record.lastKinds||[],dispatchedNow:events.length});
        return Response.json({ok:true,events:events.length});
      }catch(error){
        // Store only controlled messages; no token or response body is logged or exposed.
        const message=String(error.message).slice(0,180);
        await this.state.storage.put('status',{service:'SHC uppdateringsstyrning',version:VERSION,state:'error',lastTickAt:new Date(now).toISOString(),error:message});
        console.error(message);return Response.json({ok:false,error:message},{status:503});
      }
    });
  }
}
export default {
  async scheduled(_event,env,ctx){
    ctx.waitUntil((async()=>{
      const id=env.SCHEDULER.idFromName('sollentuna-matchskarm');
      const result=await env.SCHEDULER.get(id).fetch('https://internal/tick',{method:'POST'});
      if(!result.ok)throw new Error(`Scheduler tick HTTP ${result.status}`);
    })());
  },
  async fetch(request,env){
    const path=new URL(request.url).pathname;
    if(path==='/status')return env.SCHEDULER.get(env.SCHEDULER.idFromName('sollentuna-matchskarm')).fetch('https://internal/status');
    if(path==='/')return Response.json({service:'SHC uppdateringsstyrning',version:VERSION,configured:Boolean(env.GITHUB_TOKEN),status:'/status'});
    return new Response('Not found',{status:404});
  }
};
