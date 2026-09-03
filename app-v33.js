(() => {
  'use strict';
  const V='3.3';
  const STATE_KEY='portfolio_v33_state';
  const OLD_KEY='portfolio_v3';
  const PEN_KEY='portfolio_v3_pen';
  const XLSX_URL='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const PDF_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
  const PDF_WORKER_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  const MAX_FILE_BYTES=12*1024*1024;
  const ASSET_IDS={USDC:'usd-coin',USDT:'tether'};
  let corePromise=null,xlsxPromise=null,pdfPromise=null,lastView=[];

  Object.assign(ids,ASSET_IDS);

  function ensureStyle(){
    if(document.querySelector('link[data-v33-style]'))return;
    const l=document.createElement('link');l.rel='stylesheet';l.href='styles-v33.css?v=33';l.dataset.v33Style='1';document.head.append(l);
  }
  function loadScript(src,key){
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector(`script[data-loader="${key}"]`);
      if(existing){if(existing.dataset.loaded==='1')resolve();else{existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error(`No se pudo cargar ${key}`)),{once:true})}return}
      const s=document.createElement('script');s.src=src;s.async=true;s.dataset.loader=key;s.addEventListener('load',()=>{s.dataset.loaded='1';resolve()},{once:true});s.addEventListener('error',()=>reject(new Error(`No se pudo cargar ${key}`)),{once:true});document.head.append(s);
    });
  }
  function ensureCore(){
    if(globalThis.PortfolioCore)return Promise.resolve(globalThis.PortfolioCore);
    if(!corePromise)corePromise=loadScript('portfolio-core-v33.js?v=33','portfolio-core').then(()=>{if(!globalThis.PortfolioCore)throw new Error('Motor de portafolio no disponible');return globalThis.PortfolioCore});
    return corePromise;
  }
  function ensureXlsx(){
    if(globalThis.XLSX)return Promise.resolve(globalThis.XLSX);
    if(!xlsxPromise)xlsxPromise=loadScript(XLSX_URL,'sheetjs').then(()=>{if(!globalThis.XLSX)throw new Error('SheetJS no disponible');return globalThis.XLSX});
    return xlsxPromise;
  }
  async function ensurePdf(){
    if(pdfPromise)return pdfPromise;
    pdfPromise=import(PDF_URL).then(m=>{m.GlobalWorkerOptions.workerSrc=PDF_WORKER_URL;return m});
    return pdfPromise;
  }
  function el(tag,attrs={},children=[]){
    const n=document.createElement(tag);
    for(const [k,v] of Object.entries(attrs)){
      if(v==null)continue;
      if(k==='class')n.className=v;else if(k==='text')n.textContent=v;else if(k==='for')n.htmlFor=v;else if(k==='dataset')Object.assign(n.dataset,v);else if(k in n&&k!=='style')n[k]=v;else n.setAttribute(k,String(v));
    }
    const arr=Array.isArray(children)?children:[children];for(const c of arr){if(c==null)continue;n.append(c.nodeType?c:document.createTextNode(String(c)))}return n;
  }
  function field(labelText,control){const l=el('label');l.append(el('span',{text:labelText}),control);return l}
  function btn(id,text,cls='btn'){return el('button',{id,type:'button',class:cls,text})}
  function input(id,type,attrs={}){return el('input',{id,type,...attrs})}
  function option(v,t=v){return el('option',{value:v,text:t})}
  function buildUI(){
    ensureStyle();
    const s=$('#portafolio');if(!s)return;
    const head=el('div',{class:'section-head'},[
      el('div',{},[el('h2',{text:'Portafolio — Manual + Binance'}),el('p',{text:'Carga manual o importa tus reportes de Binance. Todo se procesa y guarda únicamente en este navegador.'})]),
      el('span',{id:'ptfStatus',class:'status neutral',text:'Listo'})
    ]);
    const assetSel=el('select',{id:'assetSel'},['BTC','ETH','SOL','BNB','XRP','USDC','USDT'].map(x=>option(x)));
    const manual=el('article',{class:'card portfolio-panel'},[
      el('div',{class:'panel-title'},[el('h3',{text:'Agregar manualmente'}),el('span',{class:'source-chip',text:'Manual'})]),
      el('p',{class:'source-note',text:'Úsalo para posiciones que no estén en los reportes importados.'}),
      el('div',{class:'form-grid'},[
        field('Activo',assetSel),
        field('Cantidad',input('qtyInp','number',{min:'0',step:'0.00000001',inputMode:'decimal',placeholder:'Ej. 0.05'})),
        field('Precio medio (USD)',input('avgInp','number',{min:'0',step:'0.0001',inputMode:'decimal',placeholder:'Ej. 95000'})),
        btn('addBtn','Agregar posición','btn primary align-end')
      ])
    ]);
    const fileInput=input('binanceFiles','file',{multiple:true,accept:'.pdf,.xlsx,.xls'});
    const importer=el('article',{class:'card portfolio-panel'},[
      el('div',{class:'panel-title'},[el('h3',{text:'Importar Binance'}),el('span',{class:'source-chip',text:'Automático'})]),
      el('p',{class:'source-note',text:'Soporta Historial Spot (PDF/XLSX), Convert, Depósitos y Retiros (XLSX). Los datos personales del encabezado se ignoran.'}),
      el('div',{class:'import-row'},[fileInput,btn('importBinanceBtn','Importar archivos','btn primary')]),
      el('div',{id:'importSummary',class:'import-summary',text:'Aún no hay reportes importados.'}),
      el('div',{class:'privacy-note',text:'Privacidad: el importador no sube tus archivos al repositorio ni a un servidor del dashboard; solo persiste movimientos normalizados en localStorage.'})
    ]);
    const pen=input('penInp','number',{min:'0',step:'0.0001',inputMode:'decimal',placeholder:'Tipo de cambio'});
    const backupInput=input('restoreBackup','file',{accept:'application/json,.json'});backupInput.hidden=true;
    const restoreLabel=el('label',{class:'btn align-end file-label',for:'restoreBackup',text:'Restaurar copia'});restoreLabel.append(backupInput);
    const controls=el('article',{class:'card portfolio-controls'},[
      el('div',{class:'form-grid secondary'},[
        field('USD → PEN',pen),btn('penAutoBtn','Obtener PEN','btn align-end'),btn('exportBtn','Exportar CSV','btn align-end'),btn('backupBtn','Copia de seguridad','btn align-end')
      ]),
      el('div',{class:'action-row'},[restoreLabel,btn('clearImportedBtn','Borrar importados','btn'),btn('clearBtn','Borrar todo','btn danger')]),
      el('div',{id:'ptfMessage',class:'inline-message','aria-live':'polite'})
    ]);
    const stats=el('div',{class:'portfolio-stats'},[
      el('div',{},[el('span',{text:'Operaciones importadas'}),el('strong',{id:'ptfOpCount',text:'0'})]),
      el('div',{},[el('span',{text:'Último movimiento'}),el('strong',{id:'ptfLastMovement',text:'—'})]),
      el('div',{},[el('span',{text:'Archivos registrados'}),el('strong',{id:'ptfImportCount',text:'0'})]),
      el('div',{},[el('span',{text:'Cobertura de costo'}),el('strong',{id:'ptfCoverage',text:'—'})])
    ]);
    const table=el('table',{id:'ptfTable'});
    const thead=el('thead');const hr=el('tr');['Activo','Cant.','Costo importado','Precio medio','Precio actual','Valor USD','Valor PEN','PnL USD','PnL %','Origen / costo','Acción'].forEach(h=>hr.append(el('th',{text:h})));thead.append(hr);
    const tbody=el('tbody');const tfoot=el('tfoot');const fr=el('tr');fr.append(el('td',{colSpan:5,text:'Total'}),el('td',{id:'totUsd',text:'—'}),el('td',{id:'totPen',text:'—'}),el('td',{id:'totPnlUsd',text:'—'}),el('td',{id:'totPnlPct',text:'—'}),el('td',{id:'totCostNote',text:'—'}),el('td'));tfoot.append(fr);table.append(thead,tbody,tfoot);
    const history=el('details',{class:'import-history'},[el('summary',{text:'Detalle de importaciones y advertencias'}),el('div',{id:'importHistory',class:'history-list'})]);
    const summaryCard=el('article',{class:'card'},[stats,el('div',{class:'table-wrap'},table),history]);
    s.replaceChildren(head,el('div',{class:'portfolio-mode-grid'},[manual,importer]),controls,summaryCard);
    pen.value=localStorage.getItem(PEN_KEY)||'';
  }
  function defaultState(){return {schema:1,manualLots:[],operations:[],imports:[]}}
  function loadState(){
    try{
      const raw=localStorage.getItem(STATE_KEY);if(raw){const s=JSON.parse(raw);if(s&&s.schema===1&&Array.isArray(s.manualLots)&&Array.isArray(s.operations)&&Array.isArray(s.imports))return s}
      const old=JSON.parse(localStorage.getItem(OLD_KEY)||'[]');
      if(Array.isArray(old)&&old.length){const s=defaultState();s.manualLots=old.filter(r=>r&&r.asset&&Number(r.qty)>0&&Number(r.avg)>0).map((r,i)=>({id:`legacy-${i}-${Date.now()}`,asset:String(r.asset).toUpperCase(),qty:Number(r.qty),avg:Number(r.avg),createdAt:new Date().toISOString()}));saveState(s);return s}
    }catch{}
    return defaultState();
  }
  function saveState(s){localStorage.setItem(STATE_KEY,JSON.stringify(s))}
  function hashHex(buf){return crypto.subtle.digest('SHA-256',buf).then(b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''))}
  function ext(name){return String(name||'').split('.').pop().toLowerCase()}
  function opRange(ops){const times=(ops||[]).map(o=>o.time).filter(Boolean).sort();return {from:times[0]||null,to:times.at(-1)||null}}
  async function parseFile(file,core){
    if(file.size>MAX_FILE_BYTES)throw new Error('archivo mayor de 12 MB');
    const bytes=await file.arrayBuffer(),hash=await hashHex(bytes),e=ext(file.name);let parsed;
    if(e==='pdf'){const pdfjs=await ensurePdf();const doc=await pdfjs.getDocument({data:new Uint8Array(bytes)}).promise;const pages=[];for(let p=1;p<=doc.numPages;p++){const pg=await doc.getPage(p),c=await pg.getTextContent();pages.push(c.items.map(x=>x.str).join(' '))}const ops=core.parseSpotText(pages.join(' '));parsed={type:'spot',ops};}
    else if(e==='xlsx'||e==='xls'){const XLSX=await ensureXlsx();const wb=XLSX.read(bytes,{type:'array',raw:false});const sh=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(sh,{header:1,raw:false,defval:''});parsed=core.detectAndParseRows(rows)}
    else throw new Error('formato no soportado');
    if(parsed.type==='unknown')throw new Error('no se reconoció el reporte Binance');
    if(parsed.type==='spot'&&!parsed.ops.length)throw new Error('no se encontraron operaciones Spot en el PDF/XLSX');
    return {hash,type:parsed.type,ops:parsed.ops,range:opRange(parsed.ops)};
  }
  function fmtQty(n){return Number(n).toLocaleString('es-PE',{maximumFractionDigits:10})}
  function originLabel(r){const o=r.hasImported&&r.hasManual?'Binance + Manual':r.hasImported?'Binance':'Manual';return r.coverage>=0.999999?`${o} · costo completo`:`${o} · costo ${fmt(r.coverage*100,1)}%`}
  function updateMeta(s,agg){
    $('#ptfOpCount').textContent=String(s.operations.length);$('#ptfImportCount').textContent=String(s.imports.length);
    const latest=s.operations.map(o=>o.time).filter(Boolean).sort().at(-1);$('#ptfLastMovement').textContent=latest||'—';
    const totalQty=agg.rows.reduce((a,r)=>a+r.qty,0),known=agg.rows.reduce((a,r)=>a+r.knownQty,0);$('#ptfCoverage').textContent=totalQty>0?`${fmt(known/totalQty*100,1)}%`:'—';
    const counts={};s.operations.forEach(o=>counts[o.source]=(counts[o.source]||0)+1);const labels=Object.entries(counts).map(([k,v])=>`${k.replace('binance-','')}: ${v}`).join(' · ');
    $('#importSummary').textContent=labels?`${labels}. Última actualización local: ${s.imports.at(-1)?.importedAt?new Date(s.imports.at(-1).importedAt).toLocaleString('es-PE'):'—'}`:'Aún no hay reportes importados.';
    const box=$('#importHistory');box.replaceChildren();
    s.imports.slice(-10).reverse().forEach(x=>box.append(el('div',{class:'history-item',text:`${x.type.toUpperCase()} · ${x.from||'sin movimientos'} → ${x.to||'—'} · nuevas ${x.added} · repetidas ${x.duplicates}`})));
    agg.warnings.slice(0,12).forEach(w=>box.append(el('div',{class:'history-item warn',text:`Advertencia: ${w}`})));
    if(!s.imports.length&&!agg.warnings.length)box.append(el('div',{class:'history-item',text:'Sin importaciones ni advertencias.'}));
  }
  async function priceMap(){
    const q=Object.values(ids).join(',');const j=await fetchJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${q}&vs_currencies=usd`,{cacheMs:30000,retries:1});const out={};for(const [asset,id] of Object.entries(ids))out[asset]=Number(j?.[id]?.usd);return out;
  }
  renderPtf=async function(){
    const core=await ensureCore(),s=loadState(),agg=core.aggregate(s.operations,s.manualLots);const body=$('#ptfTable tbody');if(!body)return;body.replaceChildren();setStatus($('#ptfStatus'),'Actualizando precios…','loading');
    let prices={};try{prices=await priceMap()}catch(e){setStatus($('#ptfStatus'),`Error de precios: ${errorLabel(e)}`,'bad')}
    const pen=Number($('#penInp').value),view=[];let totalValue=0,totalCost=0;let allComplete=true,allPriced=true;
    for(const r of agg.rows){
      const price=Number(prices[r.asset]),value=Number.isFinite(price)?price*r.qty:null,complete=r.coverage>=0.999999,cost=complete?r.cost:null,pnl=complete&&value!=null?value-r.cost:null,pct=complete&&r.cost>0&&pnl!=null?pnl/r.cost*100:null;
      if(value!=null)totalValue+=value;else allPriced=false;if(complete)totalCost+=r.cost;else allComplete=false;
      const tr=el('tr');tr.append(cell(r.asset),cell(fmtQty(r.qty)),cell(complete?fmtMoney(r.cost,2):`Conocido ${fmtMoney(r.cost,2)}`),cell(complete&&r.avg!=null?fmtMoney(r.avg,4):'N/D'),cell(Number.isFinite(price)?fmtMoney(price,4):'N/D'),cell(value!=null?fmtMoney(value,2):'N/D'),cell(value!=null&&pen>0?`S/ ${fmt(value*pen,2)}`:'—'),cell(pnl!=null?fmtMoney(pnl,2):'N/D',pnl==null?'':pnl>=0?'good':'bad'),cell(pct!=null?`${fmt(pct,2)}%`:'N/D',pct==null?'':pct>=0?'good':'bad'),cell(originLabel(r)));
      const action=el('td');if(r.hasManual){const b=btn('','Quitar manual','btn tiny');b.addEventListener('click',()=>{const st=loadState();st.manualLots=st.manualLots.filter(x=>String(x.asset).toUpperCase()!==r.asset);saveState(st);setMessage($('#ptfMessage'),`Se quitaron las posiciones manuales de ${r.asset}.`,'success');renderPtf()});action.append(b)}else action.textContent='—';tr.append(action);body.append(tr);view.push({...r,price,value,cost,pnl,pct,origin:originLabel(r)});
    }
    $('#totUsd').textContent=fmtMoney(totalValue,2);$('#totPen').textContent=pen>0?`S/ ${fmt(totalValue*pen,2)}`:'—';
    if(allComplete&&allPriced&&agg.rows.length){const pnl=totalValue-totalCost,pct=totalCost>0?pnl/totalCost*100:null;$('#totPnlUsd').textContent=fmtMoney(pnl,2);$('#totPnlUsd').className=pnl>=0?'good':'bad';$('#totPnlPct').textContent=pct==null?'—':`${fmt(pct,2)}%`;$('#totPnlPct').className=pct!=null&&pct>=0?'good':'bad';$('#totCostNote').textContent='Costo completo'}else{$('#totPnlUsd').textContent='N/D';$('#totPnlUsd').className='';$('#totPnlPct').textContent='N/D';$('#totPnlPct').className='';$('#totCostNote').textContent=agg.rows.length?'Costo/precio incompleto':'—'}
    updateMeta(s,agg);lastView=view;
    if(!agg.rows.length)setStatus($('#ptfStatus'),'Sin posiciones','neutral');else if(Object.keys(prices).length)setStatus($('#ptfStatus'),`CoinGecko · ${nowText()}`,'ok');markGlobal();
  };
  async function importFiles(){
    const files=[...$('#binanceFiles').files];if(!files.length){setMessage($('#ptfMessage'),'Selecciona uno o más archivos de Binance.','error');return}
    const core=await ensureCore(),s=loadState();setMessage($('#ptfMessage'),`Procesando ${files.length} archivo(s)…`);
    let addedTotal=0,dupTotal=0,ok=0,failed=0;
    for(const file of files){
      try{
        const parsed=await parseFile(file,core);const prior=s.imports.find(x=>x.hash===parsed.hash);if(prior){dupTotal+=parsed.ops.length;ok++;continue}
        const merged=core.mergeOperations(s.operations,parsed.ops);s.operations=merged.operations;addedTotal+=merged.added.length;dupTotal+=merged.duplicates;ok++;
        s.imports.push({hash:parsed.hash,type:parsed.type,importedAt:new Date().toISOString(),added:merged.added.length,duplicates:merged.duplicates,from:parsed.range.from,to:parsed.range.to});
      }catch(e){failed++;setMessage($('#ptfMessage'),`${file.name}: ${e.message}`,'error')}
    }
    saveState(s);$('#binanceFiles').value='';await renderPtf();
    if(!failed)setMessage($('#ptfMessage'),`Importación completada: ${addedTotal} operaciones nuevas, ${dupTotal} ya existentes. Puedes volver a importar archivos solapados sin duplicar movimientos.`,'success');
    else setMessage($('#ptfMessage'),`Importación parcial: ${ok} archivo(s) OK, ${failed} con error; ${addedTotal} operaciones nuevas.`,'error');
  }
  function backup(){const s=loadState(),blob=new Blob([JSON.stringify(s,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`portafolio-backup-v33-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
  async function restore(file){try{const s=JSON.parse(await file.text());if(!s||s.schema!==1||!Array.isArray(s.manualLots)||!Array.isArray(s.operations)||!Array.isArray(s.imports))throw new Error('copia incompatible');saveState(s);setMessage($('#ptfMessage'),'Copia restaurada correctamente.','success');await renderPtf()}catch(e){setMessage($('#ptfMessage'),`No se pudo restaurar: ${e.message}.`,'error')}}
  function exportCsv(){
    const head=['asset','qty','known_cost_usd','avg_cost_usd','price_usd','value_usd','pnl_usd','pnl_pct','cost_coverage','origin'];const esc=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    const rows=lastView.map(r=>[r.asset,r.qty,r.cost??'',r.avg??'',r.price??'',r.value??'',r.pnl??'',r.pct??'',r.coverage,r.origin]);const csv=[head,...rows].map(r=>r.map(esc).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='portafolio-v33.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }
  function bind(){
    $('#addBtn').addEventListener('click',()=>{const asset=$('#assetSel').value,qty=Number($('#qtyInp').value),avg=Number($('#avgInp').value);if(!asset||!Number.isFinite(qty)||!Number.isFinite(avg)||qty<=0||avg<=0){setMessage($('#ptfMessage'),'Cantidad y precio medio deben ser números mayores que cero.','error');return}const s=loadState();s.manualLots.push({id:`manual-${Date.now()}-${Math.random().toString(16).slice(2)}`,asset,qty,avg,createdAt:new Date().toISOString()});saveState(s);$('#qtyInp').value='';$('#avgInp').value='';setMessage($('#ptfMessage'),'Posición manual agregada.','success');renderPtf()});
    $('#importBinanceBtn').addEventListener('click',importFiles);$('#backupBtn').addEventListener('click',backup);$('#restoreBackup').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)restore(f);e.target.value=''});$('#exportBtn').addEventListener('click',exportCsv);
    $('#penAutoBtn').addEventListener('click',async()=>{setMessage($('#ptfMessage'),'Consultando USD/PEN…');try{const rate=await fetchPenRate();$('#penInp').value=rate.toFixed(4);localStorage.setItem(PEN_KEY,String(rate));setMessage($('#ptfMessage'),`USD/PEN referencial actualizado: ${rate.toFixed(4)}.`,'success');renderPtf()}catch(e){setMessage($('#ptfMessage'),`No se pudo obtener USD/PEN: ${errorLabel(e)}.`,'error')}});
    $('#penInp').addEventListener('change',()=>{const v=Number($('#penInp').value);if(v>0)localStorage.setItem(PEN_KEY,String(v));renderPtf()});
    $('#clearImportedBtn').addEventListener('click',()=>{if(confirm('¿Borrar solamente las operaciones importadas de Binance?')){const s=loadState();s.operations=[];s.imports=[];saveState(s);setMessage($('#ptfMessage'),'Operaciones importadas eliminadas. Las posiciones manuales se conservaron.','success');renderPtf()}});
    $('#clearBtn').addEventListener('click',()=>{if(confirm('¿Borrar TODO el portafolio local, manual e importado?')){saveState(defaultState());setMessage($('#ptfMessage'),'Portafolio local borrado.','success');renderPtf()}});
  }
  function patchMethodology(){
    const grid=$('#metodologia .grid');if(!grid||grid.querySelector('[data-v33-method]'))return;
    const c=el('article',{class:'card',dataset:{v33Method:'1'}},[el('h3',{text:'Portafolio Binance'}),el('p',{text:'El importador procesa Spot, Convert, depósitos y retiros. Las compras contra stablecoins usan el importe pagado como costo; las comisiones en el activo reducen la cantidad neta y las comisiones en BNB reducen la posición BNB. Un retiro reduce cantidad + tarifa, consistente con el reporte Binance. Depósitos cripto sin costo de origen se marcan con costo incompleto y el PnL queda N/D. El “precio medio importado” puede diferir del “precio de costo” interno de Binance porque Binance no documenta aquí la misma metodología de costo.'})]);grid.append(c);
  }
  buildUI();bind();patchMethodology();
  document.title='ADOLFO | CRYPTO INTELLIGENCE · v3.3';const footer=document.querySelector('footer span');if(footer)footer.textContent='ADOLFO | CRYPTO INTELLIGENCE · v3.3';const meta=document.querySelector('meta[name="description"]');if(meta)meta.content='ADOLFO | CRYPTO INTELLIGENCE v3.3: precios, derivados, on-chain, macro, portafolio manual + importación Binance y exchanges con fuentes, fechas y estados de actualización.';
})();
