(() => {
  'use strict';

  function ensureSnapshotFix(){
    if(globalThis.PortfolioSnapshotFix){globalThis.PortfolioSnapshotFix.install(globalThis);return}
    if(document.querySelector('script[data-snapshot-fix]'))return;
    const s=document.createElement('script');
    s.src='snapshot-format-v331.js?v=331';
    s.async=true;
    s.dataset.snapshotFix='1';
    s.addEventListener('load',()=>globalThis.PortfolioSnapshotFix?.install(globalThis),{once:true});
    document.head.append(s);
  }

  function correctCoverage(){
    const value=document.getElementById('ptfCoverage');
    const tbody=document.querySelector('#ptfTable tbody');
    if(!value||!tbody)return;
    const label=value.parentElement?.querySelector('span');
    const wantedLabel='Activos con costo completo';
    if(label&&label.textContent!==wantedLabel)label.textContent=wantedLabel;
    const rows=[...tbody.querySelectorAll('tr')];
    const wantedValue=rows.length?`${rows.filter(r=>(r.cells[9]?.textContent||'').includes('costo completo')).length}/${rows.length}`:'—';
    if(value.textContent!==wantedValue)value.textContent=wantedValue;
  }
  function clarifyMethodology(){
    const card=document.querySelector('[data-v33-method] p');
    if(card&&!card.dataset.auditClarified){
      card.dataset.auditClarified='1';
      card.append(document.createTextNode(' Si existen ventas, la reducción del costo usa costo promedio proporcional; no es contabilidad fiscal FIFO/LIFO. El formato Portfolio Snapshot establece un saldo base en su fecha de corte: operaciones anteriores quedan reemplazadas por el snapshot y las posteriores se aplican encima.'));
    }
    const importBtn=document.getElementById('importBinanceBtn');
    const note=importBtn?.closest('.portfolio-panel')?.querySelector('.source-note');
    const wanted='Soporta Portfolio Snapshot (XLSX), Historial Spot (PDF/XLSX), Convert, Depósitos y Retiros (XLSX). Un Snapshot fija el saldo base de la fecha indicada y evita duplicar el historial anterior.';
    if(note&&note.textContent!==wanted)note.textContent=wanted;
  }
  function applyAuditCorrections(){ensureSnapshotFix();correctCoverage();clarifyMethodology()}
  const target=document.getElementById('portafolio');
  if(target){new MutationObserver(applyAuditCorrections).observe(target,{subtree:true,childList:true,characterData:true});}
  applyAuditCorrections();
})();
