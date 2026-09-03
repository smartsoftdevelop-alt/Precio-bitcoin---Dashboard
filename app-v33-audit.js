(() => {
  'use strict';
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
    if(!card||card.dataset.auditClarified)return;
    card.dataset.auditClarified='1';
    card.append(document.createTextNode(' Si existen ventas, la reducción del costo usa costo promedio proporcional; no es contabilidad fiscal FIFO/LIFO.'));
  }
  function applyAuditCorrections(){correctCoverage();clarifyMethodology()}
  const target=document.getElementById('portafolio');
  if(target){new MutationObserver(applyAuditCorrections).observe(target,{subtree:true,childList:true,characterData:true});}
  applyAuditCorrections();
})();
