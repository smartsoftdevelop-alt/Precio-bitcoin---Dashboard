'use strict';

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const ids = {BTC:'bitcoin',ETH:'ethereum',SOL:'solana',BNB:'binancecoin',XRP:'ripple'};
const futuresSymbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT'];
const state = {
  theme: localStorage.getItem('dashboard_theme') || 'dark',
  loadedTabs: new Set(),
  exMeta: [],
  exTickers: new Map(),
  lastGlobal: null
};

function nowText(){return new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'medium'}).format(new Date())}
function ageText(ts){if(!ts)return 'sin actualizar';const s=Math.max(0,Math.round((Date.now()-ts)/1000));return s<60?`hace ${s}s`:s<3600?`hace ${Math.floor(s/60)} min`:`hace ${Math.floor(s/3600)} h`}
function fmt(n,d=2){return Number.isFinite(Number(n))?Number(n).toLocaleString('es-PE',{maximumFractionDigits:d}):'—'}
function fmtMoney(n,d=2){return Number.isFinite(Number(n))?'$'+Number(n).toLocaleString('es-PE',{maximumFractionDigits:d}):'—'}
function fmtCompact(n){return Number.isFinite(Number(n))?new Intl.NumberFormat('es-PE',{notation:'compact',maximumFractionDigits:2}).format(n):'—'}
function safeUrl(raw){
  try{const u=new URL(raw);return u.protocol==='https:'?u.href:null}catch{return null}
}
function setStatus(el, text, kind='neutral'){if(!el)return;el.textContent=text;el.className=`status ${kind}`}
function setMessage(el,text,kind=''){if(!el)return;el.textContent=text;el.className=`inline-message ${kind}`}

async function fetchJSON(url,{timeout=12000,retries=1,cacheMs=0,cacheKey=url}={}){
  if(cacheMs){
    try{const hit=JSON.parse(sessionStorage.getItem('cache:'+cacheKey)||'null');if(hit&&Date.now()-hit.ts<cacheMs)return hit.data}catch{}
  }
  let lastErr;
  for(let attempt=0;attempt<=retries;attempt++){
    const c=new AbortController();const timer=setTimeout(()=>c.abort(),timeout);
    try{
      const r=await fetch(url,{signal:c.signal,headers:{'Accept':'application/json'}});
      if(!r.ok){
        const e=new Error(`HTTP ${r.status}`);
        e.status=r.status;
        throw e;
      }
      const data=await r.json();
      if(cacheMs)sessionStorage.setItem('cache:'+cacheKey,JSON.stringify({ts:Date.now(),data}));
      return data;
    }catch(e){
      lastErr=e;
      if(attempt<retries && (e.status===429 || e.name==='AbortError' || e instanceof TypeError)){
        await new Promise(res=>setTimeout(res,650*(attempt+1)));
        continue;
      }
      throw e;
    }finally{clearTimeout(timer)}
  }
  throw lastErr;
}
function errorLabel(e){
  if(e?.name==='AbortError')return 'timeout';
  if(e?.status===429)return 'rate limit';
  if(e?.message?.startsWith('HTTP'))return e.message;
  return 'red/CORS/API';
}
function markGlobal(){
  state.lastGlobal=Date.now();
  $('#globalUpdated').textContent=`Última acción: ${nowText()}`;
}

function setTheme(theme){
  state.theme=theme;
  document.body.dataset.theme=theme;
  $('#themeBtn').textContent=`Tema: ${theme==='dark'?'oscuro':'claro'}`;
  localStorage.setItem('dashboard_theme',theme);
}
setTheme(state.theme);

function tvEmbed(target, src, config){
  const el=document.getElementById(target); if(!el)return;
  el.replaceChildren();
  const wrap=document.createElement('div');wrap.className='tradingview-widget-container';wrap.style.width='100%';wrap.style.height='100%';
  const inner=document.createElement('div');inner.className='tradingview-widget-container__widget';inner.style.width='100%';inner.style.height='100%';
  const script=document.createElement('script');script.async=true;script.src=src;script.textContent=JSON.stringify(config);
  wrap.append(inner,script);el.append(wrap);
}
function mini(target,symbol,range=$('#rangeSel').value){
  tvEmbed(target,'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js',{
    symbol,locale:'es',dateRange:range,colorTheme:state.theme,isTransparent:false,autosize:true
  });
}
function renderPrice(){
  setStatus($('#precioStatus'),'Cargando…','loading');
  mini('btc','COINBASE:BTCUSD');mini('eth','COINBASE:ETHUSD');mini('sol','COINBASE:SOLUSD');mini('bnb','BINANCE:BNBUSDT');mini('xrp','BITSTAMP:XRPUSD');
  tvEmbed('screener','https://s3.tradingview.com/external-embedding/embed-widget-screener.js',{
    width:'100%',height:420,defaultColumn:'overview',screener_type:'crypto_mkt',displayCurrency:'USD',colorTheme:state.theme,locale:'es'
  });
  setStatus($('#precioStatus'),`TradingView · ${nowText()}`,'ok');markGlobal();
}
function renderDerivCharts(){mini('btcperp','BINANCE:BTCUSDT.P');mini('ethperp','BINANCE:ETHUSDT.P');mini('solperp','BINANCE:SOLUSDT.P');mini('bnbperp','BINANCE:BNBUSDT.P');mini('xrpperp','BINANCE:XRPUSDT.P')}
function renderMacroCharts(){
  tvEmbed('calendar','https://s3.tradingview.com/external-embedding/embed-widget-events.js',{width:'100%',height:420,importanceFilter:'-1,0,1',colorTheme:state.theme,isTransparent:false,locale:'es'});
  mini('usdpen','FX:USDPEN','12M');mini('vix','CBOE:VIX','12M');mini('dxy','TVC:DXY','12M');
}

async function loadDerivatives(){
  setStatus($('#derivStatus'),'Cargando Binance Futures…','loading');
  renderDerivCharts();
  const box=$('#derivKpis');box.replaceChildren();
  const results=await Promise.all(futuresSymbols.map(async symbol=>{
    try{
      const [premium,oi]=await Promise.all([
        fetchJSON(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,{cacheMs:30000,retries:1}),
        fetchJSON(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,{cacheMs:30000,retries:1})
      ]);
      return {symbol,premium,oi,error:null};
    }catch(error){return {symbol,error}}
  }));
  results.forEach(r=>{
    const card=document.createElement('article');card.className='card metric';
    const h=document.createElement('h3');h.textContent=r.symbol.replace('USDT','/USDT');
    card.append(h);
    if(r.error){
      const p=document.createElement('p');p.className='bad';p.textContent=`Error: ${errorLabel(r.error)}`;card.append(p);
    }else{
      const funding=Number(r.premium.lastFundingRate)*100;
      const mark=Number(r.premium.markPrice);
      const oi=Number(r.oi.openInterest);
      const wrap=document.createElement('div');wrap.className='split-kpis';
      const a=document.createElement('div');const as=document.createElement('span');as.textContent='Funding';const av=document.createElement('strong');av.textContent=Number.isFinite(funding)?`${fmt(funding,4)}%`:'—';a.append(as,av);
      const b=document.createElement('div');const bs=document.createElement('span');bs.textContent='Mark price';const bv=document.createElement('strong');bv.textContent=fmtMoney(mark,2);b.append(bs,bv);
      wrap.append(a,b);card.append(wrap);
      const meta=document.createElement('div');meta.className='meta';meta.textContent=`Open interest: ${fmtCompact(oi)} ${r.symbol.replace('USDT','')} · Binance Futures · ${nowText()}`;card.append(meta);
    }
    box.append(card);
  });
  const errors=results.filter(x=>x.error).length;
  setStatus($('#derivStatus'),errors?`${results.length-errors}/${results.length} fuentes OK`:`Actualizado · ${nowText()}`,errors?'loading':'ok');
  markGlobal();
}

async function refreshOnchain(){
  const health=[];
  const setLoading=(meta,src)=>{meta.textContent=`${src} · cargando…`};
  setLoading($('#btcAddrMeta'),'Blockchain.com');setLoading($('#stableMeta'),'CoinGecko');setLoading($('#mempoolMeta'),'mempool.space');
  const jobs=[
    (async()=>{try{
      const j=await fetchJSON('https://api.blockchain.info/charts/activeaddresses?timespan=7days&format=json&cors=true',{cacheMs:120000,retries:1});
      const v=j?.values?.at?.(-1)?.y; if(!Number.isFinite(Number(v)))throw new Error('dato inválido');
      $('#btcAddr').textContent=Number(v).toLocaleString('es-PE');$('#btcAddrMeta').textContent=`Blockchain.com · ${nowText()}`;health.push('✓ Blockchain.com');
    }catch(e){$('#btcAddr').textContent='—';$('#btcAddrMeta').textContent=`Blockchain.com · Error: ${errorLabel(e)}`;health.push('✕ Blockchain.com')}})(),
    (async()=>{try{
      const j=await fetchJSON('https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin&vs_currencies=usd&include_market_cap=true',{cacheMs:120000,retries:1});
      const a=Number(j?.tether?.usd_market_cap),b=Number(j?.['usd-coin']?.usd_market_cap);if(!Number.isFinite(a)||!Number.isFinite(b))throw new Error('dato inválido');
      $('#usdtCap').textContent=fmtMoney(a,0);$('#usdcCap').textContent=fmtMoney(b,0);$('#stableMeta').textContent=`CoinGecko · ${nowText()}`;health.push('✓ CoinGecko');
    }catch(e){$('#usdtCap').textContent='—';$('#usdcCap').textContent='—';$('#stableMeta').textContent=`CoinGecko · Error: ${errorLabel(e)}`;health.push('✕ CoinGecko')}})(),
    (async()=>{try{
      const j=await fetchJSON('https://mempool.space/api/mempool',{cacheMs:30000,retries:1});const count=Number(j?.count);if(!Number.isFinite(count))throw new Error('dato inválido');
      $('#btcMempool').textContent=count.toLocaleString('es-PE');$('#mempoolMeta').textContent=`mempool.space · ${nowText()}`;health.push('✓ mempool.space');
    }catch(e){$('#btcMempool').textContent='—';$('#mempoolMeta').textContent=`mempool.space · Error: ${errorLabel(e)}`;health.push('✕ mempool.space')}})()
  ];
  await Promise.all(jobs);$('#sourceHealth').textContent=health.join('\n');markGlobal();
}

async function fetchPenRate(){
  const j=await fetchJSON('https://api.frankfurter.dev/v2/rate/USD/PEN',{cacheMs:3600000,retries:1});
  const rate=Number(j?.rate ?? j?.value ?? j?.rates?.PEN);
  if(!Number.isFinite(rate)||rate<=0)throw new Error('dato inválido');
  return rate;
}
async function loadMacro(){
  setStatus($('#macroStatus'),'Cargando…','loading');renderMacroCharts();
  try{
    const rate=await fetchPenRate();$('#penRate').textContent=`S/ ${fmt(rate,4)}`;$('#penRateMeta').textContent=`Frankfurter · tasa referencial · ${nowText()}`;setStatus($('#macroStatus'),`Actualizado · ${nowText()}`,'ok');
  }catch(e){$('#penRate').textContent='—';$('#penRateMeta').textContent=`Frankfurter · Error: ${errorLabel(e)}`;setStatus($('#macroStatus'),'Gráficos OK · PEN con error','loading')}
  markGlobal();
}

const PTF_KEY='portfolio_v3';
const PTF_PEN_KEY='portfolio_v3_pen';
function loadPtf(){
  try{
    const raw=localStorage.getItem(PTF_KEY);
    if(raw){const v=JSON.parse(raw);return Array.isArray(v)?v:[]}
    const old=JSON.parse(localStorage.getItem('portfolio_v2_4')||'[]');
    if(Array.isArray(old)&&old.length){localStorage.setItem(PTF_KEY,JSON.stringify(old));return old}
  }catch{}
  return [];
}
function savePtf(rows){localStorage.setItem(PTF_KEY,JSON.stringify(rows))}
async function cryptoPrices(){
  const q=Object.values(ids).join(',');
  const j=await fetchJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${q}&vs_currencies=usd`,{cacheMs:30000,retries:1});
  return j;
}
function cell(text,cls=''){const td=document.createElement('td');td.textContent=text;if(cls)td.className=cls;return td}
async function renderPtf(){
  setStatus($('#ptfStatus'),'Actualizando precios…','loading');
  const body=$('#ptfTable tbody');body.replaceChildren();const rows=loadPtf();
  let prices={};try{prices=await cryptoPrices()}catch(e){setStatus($('#ptfStatus'),`Error de precios: ${errorLabel(e)}`,'bad')}
  const pen=Number($('#penInp').value);let total=0,cost=0;
  rows.forEach((r,i)=>{
    const price=Number(prices?.[ids[r.asset]]?.usd);const qty=Number(r.qty),avg=Number(r.avg);
    const value=Number.isFinite(price)?qty*price:NaN;const c=qty*avg;const pnl=value-c;const pct=c>0?pnl/c*100:NaN;
    if(Number.isFinite(value))total+=value;cost+=c;
    const tr=document.createElement('tr');
    tr.append(cell(r.asset),cell(fmt(qty,8)),cell(fmtMoney(avg,4)),cell(Number.isFinite(price)?fmtMoney(price,4):'—'),cell(Number.isFinite(value)?fmtMoney(value,2):'—'),cell(Number.isFinite(value)&&pen>0?`S/ ${fmt(value*pen,2)}`:'—'),cell(Number.isFinite(pnl)?fmtMoney(pnl,2):'—',pnl>=0?'good':'bad'),cell(Number.isFinite(pct)?`${fmt(pct,2)}%`:'—',pct>=0?'good':'bad'));
    const td=document.createElement('td');const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='Eliminar';b.addEventListener('click',()=>{const a=loadPtf();a.splice(i,1);savePtf(a);renderPtf()});td.append(b);tr.append(td);body.append(tr);
  });
  $('#totUsd').textContent=fmtMoney(total,2);$('#totPen').textContent=pen>0?`S/ ${fmt(total*pen,2)}`:'—';
  const pnl=total-cost,pct=cost>0?pnl/cost*100:NaN;$('#totPnlUsd').textContent=fmtMoney(pnl,2);$('#totPnlUsd').className=pnl>=0?'good':'bad';$('#totPnlPct').textContent=Number.isFinite(pct)?`${fmt(pct,2)}%`:'—';$('#totPnlPct').className=pct>=0?'good':'bad';
  if(rows.length && Object.keys(prices).length)setStatus($('#ptfStatus'),`CoinGecko · ${nowText()}`,'ok');else if(!rows.length)setStatus($('#ptfStatus'),'Sin posiciones','neutral');
  markGlobal();
}
$('#addBtn').addEventListener('click',()=>{
  const asset=$('#assetSel').value,qty=Number($('#qtyInp').value),avg=Number($('#avgInp').value);
  if(!asset||!Number.isFinite(qty)||!Number.isFinite(avg)||qty<=0||avg<=0){setMessage($('#ptfMessage'),'Cantidad y precio medio deben ser números mayores que cero.','error');return}
  const rows=loadPtf();rows.push({asset,qty,avg});savePtf(rows);$('#qtyInp').value='';$('#avgInp').value='';setMessage($('#ptfMessage'),'Posición agregada.','success');renderPtf();
});
$('#clearBtn').addEventListener('click',()=>{if(confirm('¿Borrar todas las posiciones guardadas en este navegador?')){savePtf([]);setMessage($('#ptfMessage'),'Portafolio borrado.','success');renderPtf()}});
$('#exportBtn').addEventListener('click',()=>{
  const rows=loadPtf();const csv=['asset,qty,avg_usd',...rows.map(r=>[r.asset,r.qty,r.avg].join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='portafolio-v3.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
});
$('#penAutoBtn').addEventListener('click',async()=>{
  setMessage($('#ptfMessage'),'Consultando USD/PEN…');
  try{const rate=await fetchPenRate();$('#penInp').value=rate.toFixed(4);localStorage.setItem(PTF_PEN_KEY,String(rate));setMessage($('#ptfMessage'),`USD/PEN referencial actualizado: ${rate.toFixed(4)}.`,'success');renderPtf()}catch(e){setMessage($('#ptfMessage'),`No se pudo obtener USD/PEN: ${errorLabel(e)}.`,'error')}
});
$('#penInp').addEventListener('change',()=>{const v=Number($('#penInp').value);if(v>0)localStorage.setItem(PTF_PEN_KEY,String(v));renderPtf()});
$('#penInp').value=localStorage.getItem(PTF_PEN_KEY)||'';

async function fetchExchangeMeta(){
  const list=await fetchJSON('https://api.coingecko.com/api/v3/exchanges?per_page=20&page=1',{cacheMs:120000,retries:1});
  if(!Array.isArray(list))throw new Error('respuesta inválida');
  state.exMeta=list;
}
async function fetchExchangeTickers(){
  const symbol=$('#coinSel').value,coinId=ids[symbol],wanted=new Set(state.exMeta.map(x=>x.id));state.exTickers=new Map();
  for(let page=1;page<=3;page++){
    const j=await fetchJSON(`https://api.coingecko.com/api/v3/coins/${coinId}/tickers?include_exchange_logo=true&order=trust_score_desc&page=${page}`,{cacheMs:120000,retries:1,cacheKey:`tickers:${coinId}:${page}`});
    const arr=Array.isArray(j?.tickers)?j.tickers:[];
    for(const t of arr){
      const exId=t?.market?.identifier;if(!wanted.has(exId))continue;
      const quote=String(t.target||'').toUpperCase();if(!['USD','USDT','USDC','FDUSD','DAI','EUR'].includes(quote))continue;
      const vol=Number(t?.converted_volume?.usd)||0;
      const candidate={pair:`${t.base}/${t.target}`,lastUsd:Number(t?.converted_last?.usd),spread:Number(t?.bid_ask_spread_percentage),volUsd:vol};
      const prev=state.exTickers.get(exId);if(!prev||vol>prev.volUsd)state.exTickers.set(exId,candidate);
    }
    if(state.exTickers.size>=Math.min(15,wanted.size))break;
    if(arr.length<100)break;
  }
}
function exchangeRows(){
  const rows=state.exMeta.map(x=>{
    const t=state.exTickers.get(x.id);
    return {
      id:x.id,name:x.name||'N/D',rank:Number(x.trust_score_rank),trust:Number.isFinite(Number(x.trust_score))?Number(x.trust_score):null,
      logo:safeUrl(x.image),pair:t?.pair||'—',lastUsd:Number.isFinite(t?.lastUsd)?t.lastUsd:null,spread:Number.isFinite(t?.spread)?t.spread:null,
      pairVolume:Number.isFinite(t?.volUsd)?t.volUsd:null,totalBtc:Number(x.trade_volume_24h_btc),country:x.country||'N/D',url:safeUrl(x.url)
    }
  });
  const mode=$('#exchangeSort').value;
  if(mode==='pairVolume')rows.sort((a,b)=>(b.pairVolume??-1)-(a.pairVolume??-1));
  else if(mode==='trust')rows.sort((a,b)=>(b.trust??-1)-(a.trust??-1)||(a.rank||999)-(b.rank||999));
  else rows.sort((a,b)=>(a.rank||999)-(b.rank||999));
  return rows;
}
function addLinkCell(tr,url,label){
  const td=document.createElement('td');
  if(url){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.className='link';a.textContent=label;td.append(a)}else td.textContent='—';
  tr.append(td);
}
function renderExchanges(){
  const body=$('#exTable tbody');body.replaceChildren();const cards=$('#exList');cards.replaceChildren();
  exchangeRows().forEach(r=>{
    const tr=document.createElement('tr');
    tr.append(cell(Number.isFinite(r.rank)?String(r.rank):'N/D'));
    const nameTd=document.createElement('td');if(r.logo){const img=document.createElement('img');img.src=r.logo;img.alt='';img.loading='lazy';img.className='logo';img.referrerPolicy='no-referrer';nameTd.append(img)}nameTd.append(document.createTextNode(r.name));tr.append(nameTd);
    tr.append(cell(r.trust===null?'N/D':`${r.trust}/10`),cell(r.pair),cell(r.lastUsd===null?'—':fmtMoney(r.lastUsd,4)),cell(r.spread===null?'—':`${fmt(r.spread,3)}%`),cell(r.pairVolume===null?'—':fmtMoney(r.pairVolume,0)),cell(Number.isFinite(r.totalBtc)?`${fmt(r.totalBtc,0)} BTC`:'—'),cell(r.country),cell('Verificar'),cell('Consultar oficial'));addLinkCell(tr,r.url,'Abrir');body.append(tr);
    const d=document.createElement('article');d.className='ex-card';
    const head=document.createElement('div');head.className='ex-card-head';const left=document.createElement('strong');left.textContent=`#${Number.isFinite(r.rank)?r.rank:'N/D'} ${r.name}`;head.append(left);
    if(r.url){const a=document.createElement('a');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';a.className='btn link';a.textContent='Sitio oficial';head.append(a)}d.append(head);
    const lines=[['Trust Score',r.trust===null?'N/D':`${r.trust}/10`],['Par',r.pair],['Precio',r.lastUsd===null?'—':fmtMoney(r.lastUsd,4)],['Spread',r.spread===null?'—':`${fmt(r.spread,3)}%`],['Volumen 24h par',r.pairVolume===null?'—':fmtMoney(r.pairVolume,0)],['Perú','Verificar'],['Tarifas','Consultar oficial']];
    lines.forEach(([k,v])=>{const line=document.createElement('div');line.className='ex-line';const s=document.createElement('span');s.textContent=k;const b=document.createElement('b');b.textContent=v;line.append(s,b);d.append(line)});cards.append(d);
  });
}
async function loadExchanges(){
  setMessage($('#exStatus'),'Cargando ranking dinámico de CoinGecko…');
  try{await fetchExchangeMeta();setMessage($('#exStatus'),`Ranking cargado. Buscando mercados de ${$('#coinSel').value}…`);await fetchExchangeTickers();renderExchanges();setMessage($('#exStatus'),`Actualizado ${nowText()} · ${state.exMeta.length} exchanges · ${state.exTickers.size} con mercado encontrado.`,'success')}
  catch(e){setMessage($('#exStatus'),`Error al actualizar: ${errorLabel(e)}. No se sustituyeron datos con estimaciones.`,'error')}
  markGlobal();
}

async function loadTab(name,force=false){
  if(state.loadedTabs.has(name)&&!force)return;
  if(name==='precio')renderPrice();
  if(name==='derivados')await loadDerivatives();
  if(name==='onchain')await refreshOnchain();
  if(name==='macro')await loadMacro();
  if(name==='portafolio')await renderPtf();
  if(name==='exchanges')await loadExchanges();
  state.loadedTabs.add(name);
}
function activateTab(name){
  $$('.tab').forEach(t=>{const on=t.dataset.tab===name;t.classList.toggle('active',on);t.setAttribute('aria-selected',String(on))});
  $$('.view').forEach(v=>{const on=v.id===name;v.hidden=!on;v.classList.toggle('active',on)});
  loadTab(name);
}
$$('.tab').forEach(tab=>tab.addEventListener('click',()=>activateTab(tab.dataset.tab)));
$('.tabs').addEventListener('keydown',e=>{
  const tabs=$$('.tab');const i=tabs.indexOf(document.activeElement);if(i<0)return;
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();
  let n=i;if(e.key==='ArrowRight')n=(i+1)%tabs.length;if(e.key==='ArrowLeft')n=(i-1+tabs.length)%tabs.length;if(e.key==='Home')n=0;if(e.key==='End')n=tabs.length-1;tabs[n].focus();activateTab(tabs[n].dataset.tab);
});
$('#themeBtn').addEventListener('click',()=>{
  setTheme(state.theme==='dark'?'light':'dark');
  const active=$('.view.active')?.id;
  state.loadedTabs.delete(active);
  loadTab(active,true);
});
$('#rangeSel').addEventListener('change',()=>{
  const active=$('.view.active')?.id;
  if(active==='precio'){state.loadedTabs.delete('precio');loadTab('precio',true)}
  if(active==='derivados'){renderDerivCharts()}
});
$('#reloadBtn').addEventListener('click',()=>{const active=$('.view.active')?.id;if(active)loadTab(active,true)});
$('#onchainRefresh').addEventListener('click',()=>loadTab('onchain',true));
$('#refreshEx').addEventListener('click',()=>loadTab('exchanges',true));
$('#coinSel').addEventListener('change',()=>loadTab('exchanges',true));
$('#exchangeSort').addEventListener('change',renderExchanges);

window.addEventListener('load',()=>loadTab('precio'));
