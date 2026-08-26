(() => {
  const oldFetchExchangeMetaV31 = fetchExchangeMeta;
  const oldFetchExchangeTickersV31 = fetchExchangeTickers;

  function parseDateLabel(raw){
    if(!raw) return 'N/D';
    const d = new Date(`${raw}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString('es-PE');
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
  async function fetchPenQuote(){
    const j=await fetchJSON('https://api.frankfurter.dev/v2/rate/USD/PEN',{cacheMs:3600000,retries:1});
    const rate=Number(j?.rate ?? j?.value ?? j?.rates?.PEN);
    if(!Number.isFinite(rate)||rate<=0)throw new Error('dato inválido');
    return {rate,date:j?.date||null,source:'Frankfurter'};
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
      const snap=await fetchJSON('data/macro-snapshot.json',{cacheMs:300000,retries:0});
      if(!snap?.series)throw new Error('snapshot inválido');
      const v=snap.series.vix,b=snap.series.usd_broad;
      if(v?.latest?.value!=null){setMacroMetric('vixValue',fmt(v.latest.value,2),`FRED VIXCLS · dato ${parseDateLabel(v.latest.date)} · snapshot ${new Date(snap.fetched_at).toLocaleString('es-PE')}`,v.history);checks.push('VIX')}
      else setMacroMetric('vixValue','—','FRED VIXCLS · N/D');
      if(b?.latest?.value!=null){setMacroMetric('dollarValue',fmt(b.latest.value,2),`FRED DTWEXBGS · índice amplio USD · dato ${parseDateLabel(b.latest.date)} · snapshot ${new Date(snap.fetched_at).toLocaleString('es-PE')}`,b.history);checks.push('USD broad')}
      else setMacroMetric('dollarValue','—','FRED DTWEXBGS · N/D');
    }catch(e){
      setMacroMetric('vixValue','—',`FRED VIXCLS · ${errorLabel(e)}`);setMacroMetric('dollarValue','—',`FRED DTWEXBGS · ${errorLabel(e)}`);
    }
    setStatus($('#macroStatus'),checks.length===3?`3/3 fuentes de datos OK · ${nowText()}`:`${checks.length}/3 fuentes de datos OK · calendario TradingView separado`,checks.length===3?'ok':'loading');markGlobal();
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
    await oldFetchExchangeTickersV31();
    state.exchangeMarketSource='CoinGecko API directa (mercados recientes)';
  };

  const oldLoadExchanges=loadExchanges;
  loadExchanges=async function(){
    await oldLoadExchanges();
    const el=$('#exStatus');
    if(el?.classList.contains('success')) el.textContent += ` · ${state.exchangeMarketSource||'mercados API directa'}`;
  };

  const oldLoadDerivatives=loadDerivatives;
  loadDerivatives=async function(){
    await oldLoadDerivatives();
    $$('#derivKpis .deriv-grid span').forEach(el=>{if(el.textContent==='Long/Short global')el.textContent='Long/Short ratio de cuentas'});
  };

  const oldRenderPrice=renderPrice;
  renderPrice=function(){oldRenderPrice();setStatus($('#precioStatus'),`TradingView embebido · ${nowText()}`,'neutral')};

  const methodCards=$$('#metodologia .card');
  const macroCard=document.createElement('article');macroCard.className='card';macroCard.innerHTML='<h3>Macro</h3><p>VIX usa FRED VIXCLS y dólar usa FRED DTWEXBGS (índice amplio ponderado por comercio), con fecha del dato separada de la hora de consulta. El calendario económico sigue siendo un widget independiente de TradingView.</p>';
  const grid=$('#metodologia .grid');if(grid&&!methodCards.some(c=>c.querySelector('h3')?.textContent==='Macro'))grid.append(macroCard);

  document.title='ADOLFO | CRYPTO INTELLIGENCE · v3.2';
  const footer=document.querySelector('footer span');if(footer)footer.textContent='ADOLFO | CRYPTO INTELLIGENCE · v3.2';
})();
