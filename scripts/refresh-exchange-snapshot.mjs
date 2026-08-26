import {mkdir,writeFile} from 'node:fs/promises';

const api='https://api.coingecko.com/api/v3';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){
  let last;
  for(let i=0;i<5;i++){
    const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'adolfo-crypto-intelligence/3.2'}});
    if(r.ok)return r.json();
    last=new Error(`HTTP ${r.status}`);
    if(r.status===429||r.status>=500){await sleep(2000*(i+1));continue}
    throw last;
  }
  throw last;
}

const exchanges=await get(`${api}/exchanges?per_page=20&page=1`);
if(!Array.isArray(exchanges)||!exchanges.length)throw new Error('CoinGecko devolvió ranking vacío');
const compactExchanges=exchanges.map(x=>({
  id:x.id,name:x.name,trust_score_rank:x.trust_score_rank,trust_score:x.trust_score,
  image:x.image,trade_volume_24h_btc:x.trade_volume_24h_btc,country:x.country,url:x.url
}));
const out={schema:2,fetched_at:new Date().toISOString(),source:'CoinGecko Public API /exchanges',exchanges:compactExchanges};
await mkdir('data',{recursive:true});
await writeFile('data/exchange-snapshot.json',JSON.stringify(out));
console.log(`exchange metadata snapshot: ${compactExchanges.length} exchanges`);
