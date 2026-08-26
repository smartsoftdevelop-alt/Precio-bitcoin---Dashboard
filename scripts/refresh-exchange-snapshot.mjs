import {mkdir,writeFile} from 'node:fs/promises';

const ids={BTC:'bitcoin',ETH:'ethereum',SOL:'solana',BNB:'binancecoin',XRP:'ripple'};
const quotes=new Set(['USD','USDT','USDC','FDUSD','DAI','EUR']);
const api='https://api.coingecko.com/api/v3';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){
  let last;
  for(let i=0;i<4;i++){
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'crypto-dashboard-snapshot/1.0'}});
    if(r.ok)return r.json();
    last=new Error(`HTTP ${r.status}`);
    if(r.status===429||r.status>=500){await sleep(1500*(i+1));continue}
    throw last;
  }
  throw last;
}

const exchanges=await get(`${api}/exchanges?per_page=20&page=1`);
const wanted=new Set(exchanges.map(x=>x.id));
const markets={};
for(const [symbol,coinId] of Object.entries(ids)){
  const best=new Map();
  for(let page=1;page<=3;page++){
    const j=await get(`${api}/coins/${coinId}/tickers?include_exchange_logo=true&order=trust_score_desc&page=${page}`);
    const arr=Array.isArray(j?.tickers)?j.tickers:[];
    for(const t of arr){
      const exId=t?.market?.identifier;if(!wanted.has(exId))continue;
      const quote=String(t.target||'').toUpperCase();if(!quotes.has(quote))continue;
      const vol=Number(t?.converted_volume?.usd)||0;
      const row={pair:`${t.base}/${t.target}`,lastUsd:Number(t?.converted_last?.usd),spread:Number(t?.bid_ask_spread_percentage),volUsd:vol};
      const prev=best.get(exId);if(!prev||vol>prev.volUsd)best.set(exId,row);
    }
    if(arr.length<100)break;
    await sleep(1100);
  }
  markets[symbol]=Object.fromEntries(best);
  await sleep(1100);
}
const compactExchanges=exchanges.map(x=>({id:x.id,name:x.name,trust_score_rank:x.trust_score_rank,trust_score:x.trust_score,image:x.image,trade_volume_24h_btc:x.trade_volume_24h_btc,country:x.country,url:x.url}));
const out={schema:1,fetched_at:new Date().toISOString(),source:'CoinGecko Public API',exchanges:compactExchanges,markets};
await mkdir('data',{recursive:true});
await writeFile('data/exchange-snapshot.json',JSON.stringify(out));
console.log(`snapshot: ${compactExchanges.length} exchanges; ${Object.keys(markets).length} assets`);
