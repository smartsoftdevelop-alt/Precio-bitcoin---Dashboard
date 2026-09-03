(() => {
  const oldFetchExchangeMetaV31 = fetchExchangeMeta;

  function parseDateLabel(raw){
    if(!raw) return 'N/D';
    const d = new Date(`${raw}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString('es-PE');
  }
  function parseUnixLabel(raw){
    const n=Number(raw);if(!Number.isFinite(n))return 'N/D';
    return new Date(n*1000).toLocaleString('es-PE');
  }
  function sparkline(target, series){
    const el=document.getElementById(target); if(!el) return;
    el.replaceChildren();
    const vals=(series||[]).map(x=>Number(x.value)).filter(Number.isFinite);
    if(vals.length<2){el.textContent='Sin historial suficiente';el.className='sparkline empty';return}
    const w=320,h=90,p=5,min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
    const pts=vals.map((v,i)=>`${p+(i/(vals.length-1))*(w-2*p)},${h-p-((v-min)/range)*(h-2*p)}`).join(' ');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','Tendencia reciente');
    const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',pts);line.setAttribute('fill','none');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','2.5');line.setAttribute('vector-effect','non-scaling-stroke');
    svg.append(line);el.className='sparkline';el.append(svg);
  }
  function setMacroMetric(id,value,meta,series){
    const valueEl=document.getElementById(id);const metaEl=document.getElementById(id+'Meta');
    if(valueEl)valueEl.textContent=value;if(metaEl)metaEl.textContent=meta;
    if(series)sparkline(id+'Spark',series);
  }
  async function getMacroSnapshot(){
    const snap=await fetchJSON('data/macro-snapshot.json',{cacheMs:300000,retries:0});
    if(!snap?.series||!snap?.fetched_at)throw new Error('snapshot inválido');
    const age=(Date.now()-Date.parse(snap.fetched_at))/3600000;
    if(!Number.isFinite(age)||age>72)throw new Error('snapshot vencido');
    return snap;
  }
  async function fetchPenQuote(){
    try{
      const j=await fetchJSON('https://api.frankfurter.dev/v2/rate/USD/PEN',{cacheMs:3600000,retries:1});
      const rate=Number(j?.rate ?? j?.value ?? j?.rates?.PEN);
      if(!Number.isFinite(rate)||rate<=0)throw new Error('dato inválido');
      return {rate,date:j?.date||null,source:'Frankfurter API directa',fallback:false};
    }catch(primaryError){
      const snap=await getMacroSnapshot();const p=snap?.series?.usd_pen?.latest;const rate=Number(p?.value);
      if(!Number.isFinite(rate)||rate<=0)throw primaryError;
      return {rate,date:p.date||null,source:`Frankfurter snapshot ${new Date(snap.fetched_at).toLocaleString('es-PE')}`,fallback:true};
    }
  }
  fetchPenRate=async function(){return (await fetchPenQuote()).rate};

  renderMacroCharts=function(){
    tvEmbed('calendar','https://s3.tradingview.com/external-embedding/embed-widget-events.js',{width:'100%',height:420,importanceFilter:'-1,0,1',colorTheme:state.theme,isTransparent:false,locale:'es'});
  };
  loadMacro=async function(){
    setStatus($('#macroStatus'),'Cargando fuentes macro…','loading');renderMacroCharts();
    const checks=[];
    try{
      const q=await fetchPenQuote();
      setMacroMetric('penRate',`S/ ${fmt(q.rate,4)}`,`${q.source} · dato ${parseDateLabel(q.date)} · consultado ${nowText()}`);
      checks.push('USD/PEN');
    }catch(e){setMacroMetric('penRate','—',`Frankfurter · Error: ${errorLabel(e)}`)}
    try{
      const snap=await getMacroSnapshot();const v=snap.series.vix,b=snap.series.usd_broad;
      if(v?.latest?.value!=null){setMacroMetric('vixValue',fmt(v.latest.value,2),`FRED VIXCLS · dato ${parseDateLabel(v.latest.date)} · snapshot ${new Date(snap.fetched_at).toLocaleString('es-PE')}`,v.history);checks.push('VIX')}
      else setMacroMetric('vixValue','—','FRED VIXCLS · N/D');
      if(b?.latest?.value!=null){setMacroMetric('dollarValue',fmt(b.latest.value,2),`FRED DTWEXBGS · dato ${parseDateLabel(b.latest.date)} · snapshot ${new Date(snap.fetched_at).toLocaleString('es-PE')}`,b.history);checks.push('USD broad')}
      else setMacroMetric('dollarValue','—','FRED DTWEXBGS · N/D');
    }catch(e){
      setMacroMetric('vixValue','—',`FRED VIXCLS · ${errorLabel(e)}`);setMacroMetric('dollarValue','—',`FRED DTWEXBGS · ${errorLabel(e)}`);
    }
    setStatus($('#macroStatus'),checks.length===3?`3/3 fuentes de datos OK · ${nowText()}`:`${checks.length}/3 fuentes de datos OK · calendario TradingView separado`,checks.length===3?'ok':'loading');markGlobal();
  };

  refreshOnchain=async function(){
    const health=[];
    $('#btcAddrMeta').textContent='Blockchain.com · cargando…';$('#stableMeta').textContent='CoinGecko · cargando…';$('#mempoolMeta').textContent='mempool.space · cargando…';
    await Promise.all([
      (async()=>{try{
        const j=await fetchJSON('https://api.blockchain.info/charts/activeaddresses?timespan=7days&format=json&cors=true',{cacheMs:120000,retries:1});
        const row=j?.values?.at?.(-1),v=Number(row?.y);if(!Number.isFinite(v))throw new Error('dato inválido');
        $('#btcAddr').textContent=v.toLocaleString('es-PE');$('#btcAddrMeta').textContent=`Blockchain.com · dato ${parseUnixLabel(row?.x)} · consultado ${nowText()}`;health.push('✓ Blockchain.com');
      }catch(e){$('#btcAddr').textContent='—';$('#btcAddrMeta').textContent=`Blockchain.com · Error: ${errorLabel(e)}`;health.push('✕ Blockchain.com')}})(),
      (async()=>{try{
        const j=await fetchJSON('https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin&vs_currencies=usd&include_market_cap=true',{cacheMs:120000,retries:1});
        const a=Number(j?.tether?.usd_market_cap),b=Number(j?.['usd-coin']?.usd_market_cap);if(!Number.isFinite(a)||!Number.isFinite(b))throw new Error('dato inválido');
        $('#usdtCap').textContent=fmtMoney(a,0);$('#usdcCap').textContent=fmtMoney(b,0);$('#stableMeta').textContent=`CoinGecko · consultado ${nowText()} · endpoint sin fecha de observación`;health.push('✓ CoinGecko');
      }catch(e){$('#usdtCap').textContent='—';$('#usdcCap').textContent='—';$('#stableMeta').textContent=`CoinGecko · Error: ${errorLabel(e)}`;health.push('✕ CoinGecko')}})(),
      (async()=>{try{
        const j=await fetchJSON('https://mempool.space/api/mempool',{cacheMs:30000,retries:1});const count=Number(j?.count);if(!Number.isFinite(count))throw new Error('dato inválido');
        $('#btcMempool').textContent=count.toLocaleString('es-PE');$('#mempoolMeta').textContent=`mempool.space · estado actual consultado ${nowText()}`;health.push('✓ mempool.space');
      }catch(e){$('#btcMempool').textContent='—';$('#mempoolMeta').textContent=`mempool.space · Error: ${errorLabel(e)}`;health.push('✕ mempool.space')}})()
    ]);
    $('#sourceHealth').textContent=health.join('\n');markGlobal();
  };

  async function loadExchangeSnapshotMeta(){
    try{
      const s=await fetchJSON('data/exchange-snapshot.json',{cacheMs:300000,retries:0});
      if(!Array.isArray(s?.exchanges)||!s?.fetched_at)throw new Error('snapshot inválido');
      const age=(Date.now()-Date.parse(s.fetched_at))/3600000;
      if(!Number.isFinite(age)||age>36)throw new Error('snapshot vencido');
      return s;
    }catch{return null}
  }
  fetchExchangeMeta=async function(){
    const s=await loadExchangeSnapshotMeta();
    if(s){state.exMeta=s.exchanges;state.exchangeDataSource=`Metadata CoinGecko snapshot · ${new Date(s.fetched_at).toLocaleString('es-PE')}`;return}
    await oldFetchExchangeMetaV31();
  };
  fetchExchangeTickers=async function(){
    const symbol=$('#coinSel').value,coinId=ids[symbol],wanted=new Set(state.exMeta.map(x=>x.id));state.exTickers=new Map();
    for(let page=1;page<=3;page++){
      const j=await fetchJSON(`https://api.coingecko.com/api/v3/coins/${coinId}/tickers?include_exchange_logo=true&order=trust_score_desc&page=${page}`,{cacheMs:30000,retries:1,cacheKey:`live-tickers:${coinId}:${page}`});
      const arr=Array.isArray(j?.tickers)?j.tickers:[];
      for(const t of arr){
        const exId=t?.market?.identifier;if(!wanted.has(exId))continue;
        const quote=String(t.target||'').toUpperCase();if(!['USD','USDT','USDC','FDUSD','DAI','EUR'].includes(quote))continue;
        const vol=Number(t?.converted_volume?.usd)||0;
        const candidate={pair:`${t.base}/${t.target}`,lastUsd:Number(t?.converted_last?.usd),spread:Number(t?.bid_ask_spread_percentage),volUsd:vol};
        const prev=state.exTickers.get(exId);if(!prev||vol>prev.volUsd)state.exTickers.set(exId,candidate);
      }
      if(state.exTickers.size>=Math.min(15,wanted.size)||arr.length<100)break;
    }
    state.exchangeMarketSource='CoinGecko API directa · caché máxima 30 s';
  };

  const oldLoadExchanges=loadExchanges;
  loadExchanges=async function(){
    await oldLoadExchanges();
    const el=$('#exStatus');
    if(el?.classList.contains('success'))el.textContent+=` · ${state.exchangeMarketSource||'mercados API directa'}`;
  };

  const oldLoadDerivatives=loadDerivatives;
  loadDerivatives=async function(){
    await oldLoadDerivatives();
    $$('#derivKpis .deriv-grid span').forEach(el=>{if(el.textContent==='Long/Short global')el.textContent='Long/Short ratio de cuentas'});
  };

  const oldRenderPrice=renderPrice;
  renderPrice=function(){oldRenderPrice();setStatus($('#precioStatus'),`TradingView embebido · ${nowText()}`,'neutral')};

  document.title='ADOLFO | CRYPTO INTELLIGENCE · v3.2';
  const footer=document.querySelector('footer span');if(footer)footer.textContent='ADOLFO | CRYPTO INTELLIGENCE · v3.2';
  const audit33=document.createElement('script');audit33.src='app-v33-audit.js?v=33';audit33.defer=true;document.body.append(audit33);
  const v33=document.createElement('script');v33.src='app-v33.js?v=33';v33.defer=true;document.body.append(v33);
})();
