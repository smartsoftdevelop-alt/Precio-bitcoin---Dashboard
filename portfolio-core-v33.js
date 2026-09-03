(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PortfolioCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STABLE=new Set(['USD','USDT','USDC','FDUSD','BUSD','DAI','TUSD']);
  const EPS=1e-12;
  const num=v=>{const n=Number(String(v??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:NaN};
  const text=v=>String(v??'').trim();
  function amountToken(raw){
    const m=text(raw).replace(/,/g,'').match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[Ee][+-]?\d+)?)\s*([A-Za-z0-9._-]+)$/);
    return m?{qty:Number(m[1]),asset:m[2].toUpperCase()}:null;
  }
  function rowMap(headers,row){const o={};headers.forEach((h,i)=>{o[text(h)]=row[i]});return o}
  function findHeader(rows,required){
    for(let i=0;i<rows.length;i++){
      const vals=(rows[i]||[]).map(text);
      if(required.every(k=>vals.includes(k)))return {index:i,headers:vals};
    }
    return null;
  }
  function baseFingerprint(op){
    const keys=['source','kind','time','side','baseAsset','quoteAsset','asset','soldAsset','boughtAsset','qty','quoteQty','soldQty','boughtQty','feeAsset','feeQty','txid','network'];
    return keys.map(k=>`${k}=${op[k]??''}`).join('|');
  }
  function hash32(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
  function assignIds(ops){
    const seen=new Map();
    return ops.map(op=>{const base=baseFingerprint(op);const n=(seen.get(base)||0)+1;seen.set(base,n);const clean={...op,id:`${hash32(base)}-${n}`};delete clean.txid;return clean});
  }
  function parseSpotText(raw){
    const normalized=text(raw).replace(/\s+/g,' ');
    const N='[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[Ee][+-]?\\d+)?';
    const re=new RegExp(`(\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2})\\s+([A-Z0-9]+)\\s+(BUY|SELL)\\s+(${N})\\s+(${N})\\s*([A-Z0-9]+)\\s+(${N})\\s*([A-Z0-9]+)\\s+(${N})\\s*([A-Z0-9]+)`,'g');
    const ops=[];let m;
    while((m=re.exec(normalized))){
      const price=num(m[4]),qty=num(m[5]),quoteQty=num(m[7]),feeQty=num(m[9]);
      if(![price,qty,quoteQty,feeQty].every(Number.isFinite))continue;
      ops.push({source:'binance-spot',kind:'spot',time:m[1],pair:m[2],side:m[3],price,qty,baseAsset:m[6].toUpperCase(),quoteQty,quoteAsset:m[8].toUpperCase(),feeQty,feeAsset:m[10].toUpperCase()});
    }
    return assignIds(ops);
  }
  function parseSpotRows(rows){
    const hit=findHeader(rows,['Hora','Par','Lado','Precio','Ejecutado','Cantidad','Tarifa']);if(!hit)return [];
    const ops=[];
    for(let i=hit.index+1;i<rows.length;i++){
      const o=rowMap(hit.headers,rows[i]||[]);if(!text(o.Hora)||!text(o.Par)||!text(o.Lado))continue;
      const ex=amountToken(o.Ejecutado),q=amountToken(o.Cantidad),f=amountToken(o.Tarifa),price=num(o.Precio);
      if(!ex||!q||!f||!Number.isFinite(price))continue;
      ops.push({source:'binance-spot',kind:'spot',time:text(o.Hora),pair:text(o.Par).toUpperCase(),side:text(o.Lado).toUpperCase(),price,qty:ex.qty,baseAsset:ex.asset,quoteQty:q.qty,quoteAsset:q.asset,feeQty:f.qty,feeAsset:f.asset});
    }
    return assignIds(ops);
  }
  function parseConvertRows(rows){
    const hit=findHeader(rows,['Hora','Par','Vender','Comprar','Estado']);if(!hit)return [];
    const ops=[];
    for(let i=hit.index+1;i<rows.length;i++){
      const o=rowMap(hit.headers,rows[i]||[]);if(!text(o.Hora))continue;
      const status=text(o.Estado).toLowerCase();if(status&&!['successful','success','completed','completado','exitoso'].includes(status))continue;
      const sold=amountToken(o.Vender),bought=amountToken(o.Comprar);if(!sold||!bought)continue;
      ops.push({source:'binance-convert',kind:'convert',time:text(o.Hora),pair:text(o.Par).toUpperCase(),soldAsset:sold.asset,soldQty:sold.qty,boughtAsset:bought.asset,boughtQty:bought.qty});
    }
    return assignIds(ops);
  }
  function parseDepositRows(rows){
    const hit=findHeader(rows,['Hora','Moneda','Cantidad','Estado']);if(!hit)return [];
    if(hit.headers.includes('Tarifa'))return [];
    const ops=[];
    for(let i=hit.index+1;i<rows.length;i++){
      const o=rowMap(hit.headers,rows[i]||[]);if(!text(o.Hora)||!text(o.Moneda))continue;
      const q=num(o.Cantidad);if(!Number.isFinite(q)||q<=0)continue;
      const status=text(o.Estado).toLowerCase();if(status&&/fail|reject|cancel|pend/.test(status))continue;
      ops.push({source:'binance-deposit',kind:'deposit',time:text(o.Hora),asset:text(o.Moneda).toUpperCase(),qty:q,network:text(o.Red),txid:text(o['ID de transacción (TXID)'])});
    }
    return assignIds(ops);
  }
  function parseWithdrawalRows(rows){
    const hit=findHeader(rows,['Hora','Moneda','Cantidad','Tarifa','Estado']);if(!hit)return [];
    const ops=[];
    for(let i=hit.index+1;i<rows.length;i++){
      const o=rowMap(hit.headers,rows[i]||[]);if(!text(o.Hora)||!text(o.Moneda))continue;
      const q=num(o.Cantidad),fee=num(o.Tarifa)||0;if(!Number.isFinite(q)||q<=0)continue;
      const status=text(o.Estado).toLowerCase();if(status&&/fail|reject|cancel|pend/.test(status))continue;
      ops.push({source:'binance-withdrawal',kind:'withdrawal',time:text(o.Hora),asset:text(o.Moneda).toUpperCase(),qty:q,feeQty:fee,feeAsset:text(o.Moneda).toUpperCase(),network:text(o.Red),txid:text(o['ID de transacción (TXID)'])});
    }
    return assignIds(ops);
  }
  function detectAndParseRows(rows){
    const parsers=[['spot',parseSpotRows],['convert',parseConvertRows],['withdrawal',parseWithdrawalRows],['deposit',parseDepositRows]];
    for(const [type,fn] of parsers){const ops=fn(rows);if(ops.length)return {type,ops}}
    const flat=rows.flat().map(text);
    if(flat.includes('Historial de transacciones en Spot'))return {type:'spot',ops:[]};
    if(flat.includes('Historial de órdenes de Convert'))return {type:'convert',ops:[]};
    if(flat.includes('Historial de retiros'))return {type:'withdrawal',ops:[]};
    if(flat.includes('Historial de depósitos'))return {type:'deposit',ops:[]};
    return {type:'unknown',ops:[]};
  }
  function mergeOperations(existing,incoming){
    const ids=new Set((existing||[]).map(x=>x.id));const added=[];let duplicates=0;
    for(const op of incoming||[]){if(ids.has(op.id)){duplicates++;continue}ids.add(op.id);added.push(op)}
    return {operations:[...(existing||[]),...added],added,duplicates};
  }
  function entry(map,asset){asset=text(asset).toUpperCase();if(!map.has(asset))map.set(asset,{asset,knownQty:0,unknownQty:0,knownCost:0,warnings:[]});return map.get(asset)}
  function normalizeEntry(e){
    if(Math.abs(e.knownQty)<EPS)e.knownQty=0;if(Math.abs(e.unknownQty)<EPS)e.unknownQty=0;if(Math.abs(e.knownCost)<EPS)e.knownCost=0;
    if(e.knownQty<0&&e.knownQty>-1e-9)e.knownQty=0;if(e.unknownQty<0&&e.unknownQty>-1e-9)e.unknownQty=0;if(e.knownCost<0&&e.knownCost>-1e-7)e.knownCost=0;
  }
  function addKnown(map,asset,qty,cost){if(!(qty>0))return;const e=entry(map,asset);e.knownQty+=qty;e.knownCost+=Math.max(0,Number(cost)||0);normalizeEntry(e)}
  function addUnknown(map,asset,qty){if(!(qty>0))return;const e=entry(map,asset);e.unknownQty+=qty;normalizeEntry(e)}
  function removeQty(map,asset,qty,reason='salida',silentShortfall=false){
    qty=Number(qty)||0;if(!(qty>0))return {knownQty:0,unknownQty:0,knownCost:0,shortfall:0};
    const e=entry(map,asset),total=Math.max(0,e.knownQty)+Math.max(0,e.unknownQty);
    if(total<=EPS){if(!silentShortfall)e.warnings.push(`${reason}: salida ${qty} sin saldo previo importado`);return {knownQty:0,unknownQty:0,knownCost:0,shortfall:qty}}
    const take=Math.min(qty,total),knownShare=e.knownQty/total,knownTake=Math.min(e.knownQty,take*knownShare),unknownTake=Math.min(e.unknownQty,take-knownTake);
    const unitKnown=e.knownQty>EPS?e.knownCost/e.knownQty:0,removedCost=knownTake*unitKnown;
    e.knownQty-=knownTake;e.unknownQty-=unknownTake;e.knownCost-=removedCost;normalizeEntry(e);
    const shortfall=Math.max(0,qty-take);if(shortfall>EPS&&!silentShortfall)e.warnings.push(`${reason}: faltan ${shortfall} ${asset} en el historial importado`);
    return {knownQty:knownTake,unknownQty:unknownTake,knownCost:removedCost,shortfall};
  }
  function chronological(ops){return [...(ops||[])].sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')))}
  function aggregateImported(ops){
    const map=new Map(),warnings=[];
    for(const op of chronological(ops)){
      try{
        if(op.kind==='spot'){
          if(op.side==='BUY'){
            let net=op.qty;
            let usdCost=STABLE.has(op.quoteAsset)?op.quoteQty:null;
            if(op.feeAsset===op.baseAsset)net=Math.max(0,net-op.feeQty);
            if(op.feeAsset===op.quoteAsset&&STABLE.has(op.quoteAsset))usdCost=(usdCost??0)+op.feeQty;
            if(usdCost!=null)addKnown(map,op.baseAsset,net,usdCost);else addUnknown(map,op.baseAsset,net);
            if(op.feeAsset&&op.feeQty>0&&op.feeAsset!==op.baseAsset&&op.feeAsset!==op.quoteAsset)removeQty(map,op.feeAsset,op.feeQty,'comisión Spot');
            if(op.quoteAsset)removeQty(map,op.quoteAsset,op.quoteQty+(op.feeAsset===op.quoteAsset?op.feeQty:0),'compra Spot',STABLE.has(op.quoteAsset));
          }else if(op.side==='SELL'){
            removeQty(map,op.baseAsset,op.qty+(op.feeAsset===op.baseAsset?op.feeQty:0),'venta Spot');
            let netQuote=op.quoteQty-(op.feeAsset===op.quoteAsset?op.feeQty:0);if(netQuote<0)netQuote=0;
            if(STABLE.has(op.quoteAsset))addKnown(map,op.quoteAsset,netQuote,netQuote);else addUnknown(map,op.quoteAsset,netQuote);
            if(op.feeAsset&&op.feeQty>0&&op.feeAsset!==op.baseAsset&&op.feeAsset!==op.quoteAsset)removeQty(map,op.feeAsset,op.feeQty,'comisión Spot');
          }
        }else if(op.kind==='convert'){
          const removed=removeQty(map,op.soldAsset,op.soldQty,'Convert',STABLE.has(op.soldAsset));
          if(STABLE.has(op.soldAsset))addKnown(map,op.boughtAsset,op.boughtQty,op.soldQty);
          else if(removed.shortfall<=EPS&&removed.unknownQty<=EPS&&removed.knownQty>EPS)addKnown(map,op.boughtAsset,op.boughtQty,removed.knownCost);
          else addUnknown(map,op.boughtAsset,op.boughtQty);
        }else if(op.kind==='deposit'){
          if(STABLE.has(op.asset))addKnown(map,op.asset,op.qty,op.qty);else addUnknown(map,op.asset,op.qty);
        }else if(op.kind==='withdrawal'){
          removeQty(map,op.asset,op.qty+(op.feeQty||0),'retiro');
        }
      }catch(e){warnings.push(`No se pudo procesar ${op.kind||'operación'} ${op.time||''}`)}
    }
    for(const e of map.values())warnings.push(...e.warnings.map(w=>`${e.asset}: ${w}`));
    return {map,warnings};
  }
  function aggregateManual(lots){
    const map=new Map();
    for(const r of lots||[]){const qty=num(r.qty),avg=num(r.avg),asset=text(r.asset).toUpperCase();if(asset&&qty>0&&avg>0)addKnown(map,asset,qty,qty*avg)}
    return map;
  }
  function combine(importedMap,manualMap){
    const assets=new Set([...importedMap.keys(),...manualMap.keys()]),out=[];
    for(const asset of assets){
      const a=importedMap.get(asset)||{knownQty:0,unknownQty:0,knownCost:0},m=manualMap.get(asset)||{knownQty:0,unknownQty:0,knownCost:0};
      const knownQty=a.knownQty+m.knownQty,unknownQty=a.unknownQty+m.unknownQty,qty=knownQty+unknownQty,cost=a.knownCost+m.knownCost;
      if(qty<=EPS)continue;
      const coverage=qty>0?Math.max(0,Math.min(1,knownQty/qty)):0;
      out.push({asset,qty,knownQty,unknownQty,cost,avg:unknownQty<=EPS&&knownQty>EPS?cost/knownQty:null,coverage,hasImported:(a.knownQty+a.unknownQty)>EPS,hasManual:(m.knownQty+m.unknownQty)>EPS});
    }
    return out.sort((a,b)=>a.asset.localeCompare(b.asset));
  }
  function aggregate(ops,manualLots){const imported=aggregateImported(ops),manual=aggregateManual(manualLots);return {rows:combine(imported.map,manual),warnings:imported.warnings}}
  return {STABLE,amountToken,assignIds,parseSpotText,parseSpotRows,parseConvertRows,parseDepositRows,parseWithdrawalRows,detectAndParseRows,mergeOperations,aggregateImported,aggregateManual,aggregate};
});
