import {mkdir,writeFile} from 'node:fs/promises';

async function getText(url){
  const r=await fetch(url,{headers:{Accept:'text/csv,text/plain,*/*','User-Agent':'adolfo-crypto-intelligence/3.2'}});
  if(!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.text();
}
async function getJson(url){
  const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'adolfo-crypto-intelligence/3.2'}});
  if(!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}
function parseFredCsv(text){
  const lines=text.trim().split(/\r?\n/).slice(1);
  const rows=[];
  for(const line of lines){
    const i=line.indexOf(',');if(i<0)continue;
    const date=line.slice(0,i).trim();const raw=line.slice(i+1).trim();const value=Number(raw);
    if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(value))rows.push({date,value});
  }
  if(!rows.length)throw new Error('FRED sin observaciones numéricas');
  return {latest:rows.at(-1),history:rows.slice(-60)};
}

const [vixCsv,dollarCsv,penJson]=await Promise.all([
  getText('https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS'),
  getText('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTWEXBGS'),
  getJson('https://api.frankfurter.dev/v2/rate/USD/PEN')
]);
const penRate=Number(penJson?.rate ?? penJson?.value ?? penJson?.rates?.PEN);
const pen=Number.isFinite(penRate)&&penRate>0?{date:penJson?.date||null,value:penRate}:null;
const out={
  schema:1,
  fetched_at:new Date().toISOString(),
  sources:{
    vix:'FRED VIXCLS',
    usd_broad:'FRED DTWEXBGS',
    usd_pen:'Frankfurter USD/PEN'
  },
  series:{vix:parseFredCsv(vixCsv),usd_broad:parseFredCsv(dollarCsv),usd_pen:{latest:pen}}
};
await mkdir('data',{recursive:true});
await writeFile('data/macro-snapshot.json',JSON.stringify(out));
console.log(`macro snapshot: VIX ${out.series.vix.latest.date}; USD broad ${out.series.usd_broad.latest.date}; PEN ${pen?.date||'N/D'}`);
