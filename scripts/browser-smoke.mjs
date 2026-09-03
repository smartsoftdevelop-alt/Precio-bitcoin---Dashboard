import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';

const base=process.env.DASHBOARD_URL||'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(e.message));
await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForSelector('#importBinanceBtn',{state:'attached',timeout:15000});

const title=await page.title();
if(!title.includes('ADOLFO | CRYPTO INTELLIGENCE')||!title.includes('v3.3'))throw new Error(`Título inesperado: ${title}`);

for(const tab of ['precio','derivados','onchain','macro','portafolio','exchanges','metodologia']){
  await page.click(`#tab-${tab}`);
  const visible=await page.locator(`#${tab}`).isVisible();
  if(!visible)throw new Error(`La pestaña ${tab} no se hizo visible`);
}

await page.click('#tab-macro');
for(const id of ['calendar','penRate','vixValue','dollarValue']){
  if(await page.locator(`#${id}`).count()!==1)throw new Error(`Falta componente Macro #${id}`);
}
for(const oldId of ['usdpen','vix','dxy']){
  if(await page.locator(`#${oldId}`).count()!==0)throw new Error(`Persistió widget Macro obsoleto #${oldId}`);
}

await page.click('#tab-portafolio');
for(const id of ['importBinanceBtn','binanceFiles','backupBtn','restoreBackup','ptfOpCount','ptfCoverage']){
  if(await page.locator(`#${id}`).count()!==1)throw new Error(`Falta componente Portafolio v3.3 #${id}`);
}
if(!await page.locator('#importBinanceBtn').isVisible())throw new Error('Importar Binance no quedó visible al abrir Portafolio');
await page.waitForTimeout(100);
const coverageLabel=await page.locator('#ptfCoverage').evaluate(el=>el.parentElement?.querySelector('span')?.textContent||'');
if(coverageLabel!=='Activos con costo completo')throw new Error(`Métrica de cobertura no corregida: ${coverageLabel}`);
await page.fill('#qtyInp','-1');
await page.fill('#avgInp','10');
await page.click('#addBtn');
const msg=await page.locator('#ptfMessage').textContent();
if(!msg?.includes('mayores que cero'))throw new Error('La validación de portafolio no rechazó cantidad negativa');

const [app,app31,app32,app33,audit33,core]=await Promise.all([
  readFile('app.js','utf8'),readFile('app-v31.js','utf8'),readFile('app-v32.js','utf8'),readFile('app-v33.js','utf8'),readFile('app-v33-audit.js','utf8'),readFile('portfolio-core-v33.js','utf8')
]);
const source=app+app31+app32+app33+audit33+core;
if(/\.innerHTML\s*=/.test(source))throw new Error('Se detectó asignación innerHTML en código de aplicación');
if(/1171169894|adolfo\.huacoto@gmail\.com|CALLE LAS GEMAS/i.test(source))throw new Error('Se detectaron datos personales incrustados en el código');
if(!/delete clean\.txid/.test(core))throw new Error('El núcleo no descarta TXID antes de persistir operaciones');
if(pageErrors.length)throw new Error(`Errores JS no capturados: ${pageErrors.join(' | ')}`);

console.log('Browser smoke test OK: 7 tabs, Macro v3.2 preserved, Portfolio v3.3, audit corrections, privacy checks, safe DOM');
await browser.close();
