export const ZONE = 'Europe/Stockholm';
const formatter = new Intl.DateTimeFormat('en-CA', {timeZone: ZONE, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
export function localParts(stamp) {
  const p=Object.fromEntries(formatter.formatToParts(new Date(stamp)).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
export function stockholmStamp(date,time) {
  const naive=Date.parse(`${date}T${time}:00Z`);
  let result=naive;
  for(let i=0;i<4;i++) {
    const p=localParts(result);
    const delta=naive-Date.parse(`${p.date}T${p.time}:00Z`);
    if(!delta) return result;
    result+=delta;
  }
  throw new Error('Unrepresentable local match time');
}
export function parseCSV(source) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(c==='"') {if(quoted&&source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===';'&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('Invalid CSV quoting');
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  if(!rows.length)throw new Error('Empty schedule');
  let headers=rows[0].map(x=>x.replace(/^\uFEFF/,'').trim());
  if(/^\d{4}-\d{2}-\d{2}$/.test(headers[0]))headers=['Speldatum','Tid','Veckodag','Matchnr','Omgång','Hemma','Borta','Arena','Serie'];
  else rows.shift();
  if(!['Speldatum','Tid','Matchnr','Hemma','Borta','Serie'].every(x=>headers.includes(x)))throw new Error('Schedule columns changed');
  const games=[];const ids=new Set();
  for(const values of rows){
    const r=Object.fromEntries(headers.map((h,i)=>[h,(values[i]||'').trim()]));
    if(r.Hemma!=='Sollentuna HC'&&r.Borta!=='Sollentuna HC')continue;
    const series=r.Serie.toLowerCase();
    const team=/hockeyettan.*norra/.test(series)?'A':/u20.*nationell.*norra/.test(series)?'U20':/u18h?\s*allettan.*östra/.test(series)?'U18':null;
    if(!team)continue;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.Speldatum)||!/^\d{2}:\d{2}$/.test(r.Tid)||!/^\d+$/.test(r.Matchnr))throw new Error('Invalid match identity or time');
    if(ids.has(r.Matchnr))throw new Error('Duplicate match number');ids.add(r.Matchnr);
    const start=stockholmStamp(r.Speldatum,r.Tid);
    if(localParts(start).date!==r.Speldatum||localParts(start).time!==r.Tid)throw new Error('Invalid calendar date');
    games.push({team,date:r.Speldatum,time:r.Tid,number:r.Matchnr,home:r.Hemma==='Sollentuna HC',start});
  }
  if(!games.length)throw new Error('No supported team games in CSV');
  return games;
}
export function dueEvents(games,now,done={}) {
  const local=localParts(now);const events=[];
  const daily=`${local.date}|schedule`;
  // A delayed/missed daily tick is recovered once that day, including first install.
  if(local.time>='02:00'&&!done[daily])events.push({key:daily,kind:'schedule',at:stockholmStamp(local.date,'02:00')});
  for(const g of games){
    if(g.date!==local.date)continue;
    const kinds=[['players',[stockholmStamp(g.date,'06:00'),stockholmStamp(g.date,'12:00'),... [90,45,30].map(m=>g.start-m*60000)]]];
    if(g.home)kinds.push(['lineup',Array.from({length:11},(_,i)=>g.start-(55-i*5)*60000)]);
    for(const [kind,times] of kinds){
      if(kind==='lineup'&&now>=g.start)continue;
      // Recover a brief delay, combine simultaneous checkpoints into one workflow.
      const eligible=times.filter(t=>t<=now&&now-t<5*60000).sort((a,b)=>b-a);
      if(!eligible.length)continue;
      const at=eligible[0],key=`${g.number}|${g.start}|${kind}|${at}`;
      if(!done[key])events.push({key,kind,at,team:g.team});
    }
  }
  return events;
}
