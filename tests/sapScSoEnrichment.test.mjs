import assert from 'node:assert/strict';
import {
  parseSapCreateDate,
  formatSapCreateTime,
  mapSql10ServiceCallRow,
  mapSql05SalesOrderRow,
  buildSql05ParamList,
} from '../lib/integrations/sapScSoEnrichment.js';

assert.equal(parseSapCreateDate('20250806'), '2025-08-06');
assert.equal(formatSapCreateTime(1142), '1142');

const sc = mapSql10ServiceCallRow({
  ServiceCallID: 15050,
  Subject: 'Quarterly',
  CustomerName: 'ZHU XIAORUI',
  CreateDate: '20250806',
  CreateTime: 1142,
  Description: null,
});
assert.equal(sc.serviceCallId, '15050');
assert.equal(sc.customerName, 'ZHU XIAORUI');

const so = mapSql05SalesOrderRow({ DocNum: 3004252, DocStatus: 'C', DocTotal: 872.0 });
assert.equal(so.docNum, '3004252');
assert.equal(so.docStatus, 'C');
assert.equal(so.docTotal, 872);

assert.ok(buildSql05ParamList('C001079', '15050').includes("ServiceCallID='15050'"));

console.log('sapScSoEnrichment.test.mjs: ok');
