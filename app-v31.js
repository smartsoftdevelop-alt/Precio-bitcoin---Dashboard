(() => {
  const V31='3.1';
  const oldFetchExchangeMeta=fetchExchangeMeta;
  const oldFetchExchangeTickers=fetchExchangeTickers;
  let verification=null;
  let snapshot=null;

  function daysOld(date){const t=Date.parse(date);return Number.isFinite(t)?(Date.now()-t)/86400000:Infinity}
  function verifiedFresh(){return verification && daysOld(verification.verified_at)<=Number(verification.expires_days||30)}
  function domainAllowed(url,domains=[]){
    const safe=safeUrl(url);if(!safe)return null;
    try{const h=new URL(safe).hostname.toLowerCase().replace(/^www\./,'');return domains.some(d=>h===d||h.endsWith('.'+d))?safe:null}catch{return null}
  }
  async function loadVerification(){
    if(verification)return verification;
    try{verification=await fetchJSON('data/exchange-verification.json',{cacheMs:3600000,retries:0});return verification}catch{return null}
  }
  async function loadSnapshot(){
    try{
      const s=await fetchJSON('data/exchange-snapshot.json',{cacheMs:300000,retries:0});
      if(!Array.isArray(s?.exchanges)||!s?.markets||daysOld(s.fetched_at)>2)throw new Error('snapshot ausente o vencido');
      snapshot=s;return s;
    }catch{snapshot=null;return null}
  }

  fetchExchangeMeta=async function(){
    const s=await loadSnapshot();
    if(s){state.exMeta=s.exchanges;state.exchangeDataSource=`Snapshot CoinGecko · ${new Date(s.fetched_at).toLocaleString('es-PE')}`;return}
    await oldFetchExchangeMeta();state.exchangeDataSource='CoinGecko API directa';
  };
  fetchExchangeTickers=async function(){
    const symbol=$('#coinSel').value;
    if(snapshot?.markets?.[symbol]){
      state.exTickers=new Map(Object.entries(snapshot.markets[symbol]));
      return;
    }
    await oldFetchExchangeTickers();
  };

  function peruStatus(id){
    if(!verification)return {text:'N/D',kind:'neutral'};
    if(!verifiedFresh())return {text:'Revalidar',kind:'warn'};
    return verification.peru_listed_ids?.includes(id)
      ? {text:'Listado CoinGecko Perú',kind:'good'}
      : {text:'No listado CoinGecko Perú',kind:'neutral'};
  }
  function feeStatus(id){
    if(!verification)return {label:'N/D',source:null};
    if(!verifiedFresh())return {label:'Revalidar',source:null};
    const f=verification.fees?.[id];return f?{label:f.label,source:safeUrl(f.source),note:f.note}:{label:'Sin tarifa base verificada',source:null};
  }
  function exchangeOfficialUrl(r){
    const domains=verification?.allowed_exchange_domains?.[r.id]||[];
    return domainAllowed(r.url,domains);
  }
  function appendFeeCell(tr,fee){
    const td=document.createElement('td');td.textContent=fee.label;
    if(fee.source){const a=document.createElement('a');a.href=fee.source;a.target='_blank';a.rel='noopener noreferrer';a.className='source-link';a.textContent=' fuente';td.append(a)}
    tr.append(td);
  }

  renderExchanges=function(){
    const body=$('#exTable tbody');body.replaceChildren();const cards=$('#exList');cards.replaceChildren();
    exchangeRows().forEach(r=>{
      const peru=peruStatus(r.id),fee=feeStatus(r.id),official=exchangeOfficialUrl(r);
      const tr=document.createElement('tr');
      tr.append(cell(Number.isFinite(r.rank)?String(r.rank):'N/D'));
      const nameTd=document.createElement('td');
      if(r.logo){const img=document.createElement('img');img.src=r.logo;img.alt='';img.loading='lazy';img.className='logo';img.referrerPolicy='no-referrer';nameTd.append(img)}
      nameTd.append(document.createTextNode(r.name));tr.append(nameTd);
      tr.append(cell(r.trust===null?'N/D':`${r.trust}/10`),cell(r.pair),cell(r.lastUsd===null?'—':fmtMoney(r.lastUsd,4)),cell(r.spread===null?'—':`${fmt(r.spread,3)}%`),cell(r.pairVolume===null?'—':fmtMoney(r.pairVolume,0)),cell(Number.isFinite(r.totalBtc)?`${fmt(r.totalBtc,0)} BTC`:'—'),cell(r.country),cell(peru.text,peru.kind));
      appendFeeCell(tr,fee);addLinkCell(tr,official,'Abrir');body.append(tr);

      const d=document.createElement('article');d.className='ex-card';
      const head=document.createElement('div');head.className='ex-card-head';const left=document.createElement('strong');left.textContent=`#${Number.isFinite(r.rank)?r.rank:'N/D'} ${r.name}`;head.append(left);
      if(official){const a=document.createElement('a');a.href=official;a.target='_blank';a.rel='noopener noreferrer';a.className='btn link';a.textContent='Sitio oficial';head.append(a)}d.append(head);
      const lines=[['Trust Score',r.trust===null?'N/D':`${r.trust}/10`],['Par',r.pair],['Precio',r.lastUsd===null?'—':fmtMoney(r.lastUsd,4)],['Spread',r.spread===null?'—':`${fmt(r.spread,3)}%`],['Volumen 24h par',r.pairVolume===null?'—':fmtMoney(r.pairVolume,0)],['Perú',peru.text],['Tarifa base',fee.label]];
      lines.forEach(([k,v])=>{const line=document.createElement('div');line.className='ex-line';const s=document.createElement('span');s.textContent=k;const b=document.createElement('b');b.textContent=v;line.append(s,b);d.append(line)});cards.append(d);
    });
  };

  loadExchanges=async function(){
    setMessage($('#exStatus'),'Cargando ranking y verificaciones…');
    await loadVerification();
    try{
      await fetchExchangeMeta();setMessage($('#exStatus'),`Ranking cargado. Buscando mercados de ${$('#coinSel').value}…`);await fetchExchangeTickers();renderExchanges();
      const ver=verification?` · verificación ${verification.verified_at}${verifiedFresh()?'':' (REVALIDAR)'}`:'';
      setMessage($('#exStatus'),`Actualizado ${nowText()} · ${state.exMeta.length} exchanges · ${state.exTickers.size} mercados · ${state.exchangeDataSource||'fuente dinámica'}${ver}`,'success');
    }catch(e){setMessage($('#exStatus'),`Error al actualizar: ${errorLabel(e)}. No se sustituyeron datos con estimaciones.`,'error')}
    markGlobal();
  };

  loadDerivatives=async function(){
    setStatus($('#derivStatus'),'Cargando Binance Futures…','loading');renderDerivCharts();
    const box=$('#derivKpis');box.replaceChildren();
    const results=await Promise.all(futuresSymbols.map(async symbol=>{
      try{
        const [premium,oi,ratio]=await Promise.all([
          fetchJSON(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,{cacheMs:30000,retries:1}),
          fetchJSON(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,{cacheMs:30000,retries:1}),
          fetchJSON(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=5m&limit=1`,{cacheMs:30000,retries:1})
        ]);
        return {symbol,premium,oi,ratio:Array.isArray(ratio)?ratio[0]:null,error:null};
      }catch(error){return {symbol,error}}
    }));
    results.forEach(r=>{
      const card=document.createElement('article');card.className='card metric';const h=document.createElement('h3');h.textContent=r.symbol.replace('USDT','/USDT');card.append(h);
      if(r.error){const p=document.createElement('p');p.className='bad';p.textContent=`Error: ${errorLabel(r.error)}`;card.append(p);box.append(card);return}
      const funding=Number(r.premium.lastFundingRate)*100,mark=Number(r.premium.markPrice),index=Number(r.premium.indexPrice),oi=Number(r.oi.openInterest),ratio=Number(r.ratio?.longShortRatio),basis=(mark-index)/index*100,oiUsd=oi*mark;
      const metrics=[['Funding',Number.isFinite(funding)?`${fmt(funding,4)}%`:'—'],['Basis mark/index',Number.isFinite(basis)?`${fmt(basis,4)}%`:'—'],['Long/Short global',Number.isFinite(ratio)?fmt(ratio,3):'—'],['OI estimado USD',Number.isFinite(oiUsd)?fmtMoney(oiUsd,0):'—']];
      const wrap=document.createElement('div');wrap.className='deriv-grid';metrics.forEach(([k,v])=>{const d=document.createElement('div');const s=document.createElement('span');s.textContent=k;const b=document.createElement('strong');b.textContent=v;d.append(s,b);wrap.append(d)});card.append(wrap);
      const meta=document.createElement('div');meta.className='meta';meta.textContent=`Mark ${fmtMoney(mark,2)} · OI ${fmtCompact(oi)} ${r.symbol.replace('USDT','')} · Liquidaciones 24h: N/D (sin agregado histórico público fiable en esta arquitectura) · Binance Futures · ${nowText()}`;card.append(meta);box.append(card);
    });
    const errors=results.filter(x=>x.error).length;setStatus($('#derivStatus'),errors?`${results.length-errors}/${results.length} fuentes OK`:`Actualizado · ${nowText()}`,errors?'loading':'ok');markGlobal();
  };

  document.querySelector('.title').textContent='Crypto Dashboard v3.1';
  document.title='Crypto Dashboard v3.1';
  const footer=document.querySelector('footer span');if(footer)footer.textContent='Crypto Dashboard v3.1';
  const methodCards=$$('#metodologia .card');
  const exchCard=methodCards.find(c=>c.querySelector('h3')?.textContent==='Perú y comisiones');
  if(exchCard){exchCard.querySelector('p').textContent='Perú usa la lista específica de CoinGecko para exchanges que soportan depósitos PEN o están incorporados en Perú; no significa que todos sus productos estén disponibles. Las tarifas base solo se muestran cuando existe fuente oficial verificada, con fecha y caducidad de 30 días.'}
})();
