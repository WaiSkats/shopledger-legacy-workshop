'use strict';

var assert = require('node:assert/strict');
var test = require('node:test');

var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

// Mirrors the line-item fields persisted by routes/orders.js. The order flow
// stores HSN but does not store gstRate, so these tests intentionally omit it.
function exampleOrder() {
  var items = [{
    id: 1,
    sku: 'GRN-001',
    name: 'Rice',
    hsn: '1006',
    price: 100,
    qty: 2
  }];
  var totals = pricing.computeTotals(items, 'WELCOME');

  return {
    id: 1001,
    date: '22/11/2026',
    customer: 'Walk-in',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: 'WELCOME',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('CURRENT BEHAVIOUR: order pricing applies HSN GST after coupon discount', function () {
  var order = exampleOrder();
  var totals = pricing.computeTotals(order.items, order.coupon);

  assert.equal(totals.subtotal, 200);
  assert.equal(totals.discount, 10);
  assert.deepEqual({
    gstPercent: totals.lines[0].gstPercent,
    taxable: totals.lines[0].taxable,
    tax: totals.tax,
    cgst: totals.cgst,
    sgst: totals.sgst,
    total: totals.total
  }, {
    gstPercent: 5,
    taxable: 190,
    tax: 9.5,
    cgst: 4.75,
    sgst: 4.75,
    total: 199.5
  });
});

test('CORRECT BEHAVIOUR: invoice GST breakdown and total match the saved billed order', function () {
  var order = exampleOrder();
  var figures = invoice.computeInvoiceFigures(order);
  var html = invoice.render(order);

  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.rows[0].lineTax, 9.5);
  assert.equal(figures.tax, order.tax);
  assert.equal(figures.cgst, 4.75);
  assert.equal(figures.sgst, 4.75);
  assert.equal(figures.discount, order.discount);
  assert.equal(figures.total, order.total);
  assert.match(html, /5%/);
  assert.match(html, /199\.50/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('CORRECT BEHAVIOUR: GST reconciliation matches invoice and saved order', function () {
  var order = exampleOrder();
  var reconciliation = reports.getGstReconciliation({ orders: [order] });

  assert.equal(reconciliation.totalChecked, 1);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.deepEqual({
    ledgerTax: reconciliation.rows[0].ledgerTax,
    invoiceTax: reconciliation.rows[0].invoiceTax,
    ledgerTotal: reconciliation.rows[0].ledgerTotal,
    invoiceTotal: reconciliation.rows[0].invoiceTotal,
    delta: reconciliation.rows[0].delta,
    matched: reconciliation.rows[0].matched
  }, {
    ledgerTax: 9.5,
    invoiceTax: 9.5,
    ledgerTotal: 199.5,
    invoiceTotal: 199.5,
    delta: 0,
    matched: true
  });
});
