const assert=require('node:assert/strict');
const core=require('../portfolio-core-v33.js');
const snapshotFix=require('../snapshot-format-v331.js');
snapshotFix.patchCore(core);

const spotText=`2026-01-01 10:00:00 ETHUSDT BUY 2000 0.0100ETH 20USDT 0.00001ETH
2026-01-01 10:00:00 ETHUSDT BUY 2000 0.0100ETH 20USDT 0.00001ETH
2026-01-02 10:00:00 BNBUSDT BUY 500 0.2BNB 100USDT 0.0002BNB`;
const spot=core.parseSpotText(spotText);
assert.equal(spot.length,3,'debe conservar fills idénticos legítimos');
assert.notEqual(spot[0].id,spot[1].id,'fills idénticos deben tener ordinal distinto');
let merged=core.mergeOperations([],spot);
assert.equal(merged.added.length,3);
merged=core.mergeOperations(merged.operations,core.parseSpotText(spotText));
assert.equal(merged.added.length,0,'reimportar el mismo historial no debe duplicar');
assert.equal(merged.duplicates,3);

const convertRows=[
 ['Hora','Billetera','Par','Tipo','Vender','Comprar','Precio','Precio inverso','Fecha actualizada','Estado'],
 ['2026-02-01 12:00:00','FUNDING','USDCUSDT','Instant','120 USDT','119.8 USDC','','','2026-02-01 12:00:01','Successful']
];
const withdrawalRows=[
 ['Hora','Moneda','Red','Cantidad','','Tarifa','','Dirección','ID de transacción (TXID)','Estado'],
 ['2026-02-02 12:00:00','USDC','BASE','19','','0.1','','addr','tx-1','Completed']
];
const c=core.parseConvertRows(convertRows),w=core.parseWithdrawalRows(withdrawalRows);
const a=core.aggregate([...c,...w],[]).rows.find(r=>r.asset==='USDC');
assert.ok(a);
assert.ok(Math.abs(a.qty-100.7)<1e-10,'retiro debe descontar cantidad + tarifa');
assert.ok(a.coverage>0.999999);

const depositRows=[
 ['Hora','Moneda','','Red','','Cantidad','','Dirección','ID de transacción (TXID)','Estado'],
 ['2026-03-01 12:00:00','BTC','','BTC','','0.01','','addr','tx-2','Completed']
];
const dep=core.parseDepositRows(depositRows);
const partial=core.aggregate(dep,[{asset:'BTC',qty:0.01,avg:50000}]).rows.find(r=>r.asset==='BTC');
assert.ok(partial);
assert.ok(partial.coverage>0.49&&partial.coverage<0.51,'depósito cripto sin costo debe quedar como cobertura parcial');
assert.equal(partial.avg,null,'no debe inventar precio medio con costo incompleto');

const snapshotRows=[
 ['ADOLFO | CRYPTO INTELLIGENCE — Portfolio Snapshot Binance'],
 ['Snapshot'],[],
 ['Fecha','Activo','Cantidad','Precio de costo (USD)','Costo total (USD)','Precio actual capturado (USD)','Valor capturado (USD)','PnL capturado (USD)','Observación'],
 ['2026-09-02 23:59:59','USDC','6,038.41808856','US$ 1.0045234','$6,065.73','$0.9998','$6,037.26','($28.47)',''],
 ['2026-09-02 23:59:59','BTC','0.03160597','$94,010.64','$2,971.30','$77,611.00','$2,452.97','-$518.33',''],
 ['2026-09-02 23:59:59','SOL','4.46369998','$111.83','$499.18','$100.33','$447.84','-$51.34',''],
 ['2026-09-02 23:59:59','ETH','0.17893066','$2,320.82','$415.27','$2,400.39','$429.50','$14.23',''],
 ['2026-09-02 23:59:59','BNB','0.50084903','$890.95','$446.23','$692.87','$347.02','-$99.21',''],
 ['2026-09-02 23:59:59','XRP','172.74241261','$1.73','$298.84','$1.36','$234.93','-$63.91','']
];
const snap=core.detectAndParseRows(snapshotRows);
assert.equal(snap.type,'snapshot');
assert.equal(snap.ops.length,6);
const snapAgg=core.aggregate(snap.ops,[]);
assert.equal(snapAgg.rows.length,6);
for(const row of snapAgg.rows){
  assert.ok(row.coverage>0.999999,`${row.asset} debe importar costo completo`);
  assert.ok(Number.isFinite(row.avg)&&row.avg>0,`${row.asset} debe tener precio medio`);
}
const usdc=snapAgg.rows.find(r=>r.asset==='USDC');
const btc=snapAgg.rows.find(r=>r.asset==='BTC');
assert.ok(Math.abs(usdc.avg-(6065.73/6038.41808856))<1e-10,'USDC debe conservar costo del snapshot formateado');
assert.ok(Math.abs(btc.avg-(2971.30/0.03160597))<1e-8,'BTC debe leer $ y separadores correctamente');
assert.equal(snapshotFix.currencyNumber('($1,234.56)'),-1234.56);
assert.equal(snapshotFix.currencyNumber('US$ 1.0045234'),1.0045234);

const historical=core.parseSpotText('2026-01-01 10:00:00 BTCUSDT BUY 50000 0.1BTC 5000USDT 0BTC');
const after=core.parseSpotText('2026-09-03 10:00:00 BTCUSDT BUY 80000 0.001BTC 80USDT 0BTC');
const snapPlus=core.aggregate([...historical,...snap.ops,...after],[]);
const btcPlus=snapPlus.rows.find(r=>r.asset==='BTC');
assert.ok(Math.abs(btcPlus.qty-0.03260597)<1e-10,'snapshot debe reemplazar historial previo y sumar movimientos posteriores');
assert.ok(Math.abs(btcPlus.cost-(2971.30+80))<1e-8);

console.log('portfolio-core v3.3.1 formatted snapshot OK');
