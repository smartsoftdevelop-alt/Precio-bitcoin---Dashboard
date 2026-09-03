const assert=require('node:assert/strict');
const core=require('../portfolio-core-v33.js');

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
 ['2026-09-02 23:59:59','USDC',6038.41808856,'','','1','6039.81','',''],
 ['2026-09-02 23:59:59','BTC',0.03160597,94010.64,2971.2974675208,77084.2,2436.32,-534.98,'']
];
const snap=core.detectAndParseRows(snapshotRows);
assert.equal(snap.type,'snapshot');
assert.equal(snap.ops.length,2);
const historical=core.parseSpotText('2026-01-01 10:00:00 BTCUSDT BUY 50000 0.1BTC 5000USDT 0BTC');
const after=core.parseSpotText('2026-09-03 10:00:00 BTCUSDT BUY 80000 0.001BTC 80USDT 0BTC');
const snapAgg=core.aggregate([...historical,...snap.ops,...after],[]);
const btc=snapAgg.rows.find(r=>r.asset==='BTC');
const usdc=snapAgg.rows.find(r=>r.asset==='USDC');
assert.ok(Math.abs(btc.qty-0.03260597)<1e-10,'snapshot debe reemplazar historial previo y sumar movimientos posteriores');
assert.ok(Math.abs(btc.cost-(2971.2974675208+80))<1e-8);
assert.equal(usdc.avg,null,'snapshot sin costo visible debe conservar costo N/D');
assert.equal(usdc.coverage,0);

console.log('portfolio-core v3.3 snapshot OK');
