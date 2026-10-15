import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,localParts,stockholmStamp,dueEvents} from '../src/schedule.mjs';
import worker,{MatchScheduler,dispatch} from '../src/worker.mjs';
const csv='Speldatum;Tid;Veckodag;Matchnr;Omgång;Hemma;Borta;Arena;Serie\r\n2026-10-17;17:15;Lördag;123;1;Sollentuna HC;Lidingö Vikings HC;CYLOQ;U18H Allettan Östra [95752]\r\n2026-10-17;18:00;Lördag;124;1;Annat lag;Sollentuna HC;Borta;U20 Herr Nationell Norra\r\n2026-10-17;16:00;Lördag;125;1;Sollentuna HC;Hudiksvalls HC;CYLOQ;Hockeyettan Norra';
const games=parseCSV(csv),at=t=>stockholmStamp('2026-10-17',t),done={'2026-10-17|schedule':at('02:00')};
test('three teams, home/away and quoted CSV',()=>{
 assert.equal(games.length,3);assert.equal(games[1].home,false);
 assert.equal(parseCSV(csv.replace('Lidingö Vikings HC','"Lidingö; Vikings HC"')).length,3);
 assert.equal(parseCSV(csv.split('\r\n').slice(1).join('\n')).length,3);
 assert.throws(()=>parseCSV('date;time\nwrong;data'));
 assert.throws(()=>parseCSV(csv+'\r\n'+csv.split('\r\n')[1]),/Duplicate/);
});
test('Stockholm summer and winter times and DST transition',()=>{
 assert.equal(new Date(stockholmStamp('2026-10-17','17:15')).toISOString(),'2026-10-17T15:15:00.000Z');
 assert.equal(new Date(stockholmStamp('2026-11-01','17:15')).toISOString(),'2026-11-01T16:15:00.000Z');
 assert.equal(localParts(stockholmStamp('2026-10-25','02:00')).time,'02:00');
 assert.equal(localParts(stockholmStamp('2027-03-28','17:15')).time,'17:15');
});
test('all eleven home lineup checkpoints 55 to 5 minutes',()=>{
 const game=games[0];
 for(let m=55;m>=5;m-=5){const due=dueEvents([game],game.start-m*60000,done);assert.equal(due.filter(x=>x.kind==='lineup').length,1,'minutes '+m);}
 assert.equal(dueEvents([game],game.start-60*60000,done).filter(x=>x.kind==='lineup').length,0);
 assert.equal(dueEvents([game],game.start,done).filter(x=>x.kind==='lineup').length,0);
});
test('player checks at 06,12,90,45,30 on matchday, including away game',()=>{
 const game=games[1];
 for(const t of [at('06:00'),at('12:00'),game.start-90*60000,game.start-45*60000,game.start-30*60000])assert.equal(dueEvents([game],t,done).filter(x=>x.kind==='players').length,1);
 assert.equal(dueEvents([game],game.start-55*60000,done).length,0);
 assert.equal(dueEvents([game],stockholmStamp('2026-10-16','12:00'),{'2026-10-16|schedule':1}).length,0);
});
test('idle night, daily at 02, delayed recovery and deduplication',()=>{
 assert.equal(dueEvents(games,at('01:59')).length,0);
 assert.equal(dueEvents(games,at('02:00')).filter(x=>x.kind==='schedule').length,1);
 assert.equal(dueEvents(games,at('03:00')).filter(x=>x.kind==='schedule').length,1);
 assert.equal(dueEvents(games,at('03:00'),done).length,0);
 const events=dueEvents([games[0]],games[0].start-55*60000+2*60000,done);assert.equal(events.length,1);
 assert.equal(dueEvents([games[0]],games[0].start-55*60000+3*60000,{...done,[events[0].key]:1}).length,0);
});
class MemoryState {
 constructor(){this.data=new Map();this.queue=Promise.resolve();this.storage={get:async k=>structuredClone(this.data.get(k)),put:async(k,v)=>this.data.set(k,structuredClone(v))};}
 blockConcurrencyWhile(fn){const next=this.queue.then(fn);this.queue=next.catch(()=>{});return next;}
}
test('actual worker: simultaneous cron ticks dispatch once, false force, persistent restart',async()=>{
 const oldFetch=globalThis.fetch,oldNow=Date.now;let calls=0,downloads=0;
 Date.now=()=>at('16:20');
 globalThis.fetch=async(url,opts)=>{
  if(String(url).includes('raw.githubusercontent.com')){downloads++;return new Response(csv);}
  calls++;const body=JSON.parse(opts.body);assert.equal(body.inputs.force,false);assert.equal(body.ref,'main');return new Response(null,{status:204});
 };
 try{
  const state=new MemoryState(),scheduler=new MatchScheduler(state,{GITHUB_TOKEN:'test-only'});
  const tick=()=>scheduler.fetch(new Request('https://internal/tick',{method:'POST'}));
  const responses=await Promise.all([tick(),tick()]);assert.ok(responses.every(r=>r.ok));assert.equal(calls,1);assert.equal(downloads,1);
  const restarted=new MatchScheduler(state,{GITHUB_TOKEN:'test-only'});await restarted.fetch(new Request('https://internal/tick',{method:'POST'}));assert.equal(calls,1);
  const status=await(await restarted.fetch(new Request('https://internal/status'))).json();assert.equal(status.state,'ok');assert.equal(status.matchCount,3);
 }finally{globalThis.fetch=oldFetch;Date.now=oldNow;}
});
test('failed GitHub request stays retryable; secret never appears in status',async()=>{
 const oldFetch=globalThis.fetch,oldNow=Date.now;Date.now=()=>at('16:20');let fail=true,calls=0;
 globalThis.fetch=async url=>{if(String(url).includes('raw.githubusercontent.com'))return new Response(csv);calls++;return new Response(null,{status:fail?503:204});};
 try{
  const s=new MatchScheduler(new MemoryState(),{GITHUB_TOKEN:'must-not-leak'}),request=()=>new Request('https://internal/tick',{method:'POST'});
  assert.equal((await s.fetch(request())).status,503);const status=await(await s.fetch(new Request('https://internal/status'))).text();assert.ok(!status.includes('must-not-leak'));
  fail=false;assert.equal((await s.fetch(request())).status,200);assert.equal(calls,2);
 }finally{globalThis.fetch=oldFetch;Date.now=oldNow;}
});
test('public interface cannot initiate dispatch',async()=>{
 assert.equal((await worker.fetch(new Request('https://worker/tick'),{})).status,404);
 await assert.rejects(dispatch({},[]),/Missing GITHUB_TOKEN/);
});
