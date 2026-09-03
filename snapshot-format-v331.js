(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PortfolioSnapshotFix=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  function currencyNumber(value){
    if(typeof value==='number')return Number.isFinite(value)?value:NaN;
    let s=String(value??'').replace(/\u00a0/g,' ').trim();
    if(!s)return NaN;
    let negative=false;
    if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1)}
    s=s.replace(/US\$|USD|\$/gi,'').replace(/,/g,'').replace(/\s+/g,'');
    const n=Number(s);
    return Number.isFinite(n)?(negative?-n:n):NaN;
  }
  function snapshotHeader(rows){
    const required=['Fecha','Activo','Cantidad','Precio de costo (USD)','Costo total (USD)'];
    for(let i=0;i<(rows||[]).length;i++){
      const row=Array.isArray(rows[i])?rows[i]:[];
      const vals=row.map(v=>String(v??'').trim());
      if(required.every(k=>vals.includes(k)))return {index:i,headers:vals};
    }
    return null;
  }
  function sanitizeSnapshotRows(rows){
    const hit=snapshotHeader(rows);
    if(!hit)return rows;
    const indices=['Cantidad','Precio de costo (USD)','Costo total (USD)','Precio actual capturado (USD)','Valor capturado (USD)','PnL capturado (USD)']
      .map(name=>hit.headers.indexOf(name)).filter(i=>i>=0);
    return (rows||[]).map((row,ri)=>{
      if(!Array.isArray(row)||ri<=hit.index)return row;
      const copy=row.slice();
      for(const ci of indices){
        const n=currencyNumber(copy[ci]);
        if(Number.isFinite(n))copy[ci]=n;
      }
      return copy;
    });
  }
  function patchCore(core){
    if(!core||core.__snapshotCurrencyV331)return core;
    const original=core.detectAndParseRows;
    if(typeof original!=='function')return core;
    core.detectAndParseRows=function(rows){return original.call(core,sanitizeSnapshotRows(rows))};
    Object.defineProperty(core,'__snapshotCurrencyV331',{value:true,enumerable:false});
    return core;
  }
  function install(target){
    if(!target)return;
    if(target.PortfolioCore){patchCore(target.PortfolioCore);return}
    const desc=Object.getOwnPropertyDescriptor(target,'PortfolioCore');
    if(!desc||desc.configurable){
      let current;
      Object.defineProperty(target,'PortfolioCore',{
        configurable:true,enumerable:true,
        get(){return current},
        set(v){
          current=patchCore(v);
          Object.defineProperty(target,'PortfolioCore',{value:current,writable:true,configurable:true,enumerable:true});
        }
      });
    }
  }
  if(root&&typeof document!=='undefined')install(root);
  return {currencyNumber,sanitizeSnapshotRows,patchCore,install};
});
