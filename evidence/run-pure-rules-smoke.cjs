/* Bộ smoke thực thi thực sự bằng Node 22, không yêu cầu NestJS/DB.
 * Dùng compiled JS từ TypeScript source gốc của file-change-only. */
const assert = require('node:assert/strict');
const r = require('./compiled/reward-rules.js');
const now = new Date('2026-10-21T00:00:00Z');
const sample = {code:'GIAM10',discountPercent:10,discountAmount:null,minOrderValue:50000,maxUses:100,usedCount:0,expiresAt:new Date('2099-12-31T00:00:00Z'),active:true};
const tests = [
 ['normalize trim uppercase',()=>assert.equal(r.normalizeCouponCode(' gIaM10 '),'GIAM10')],
 ['valid 10% discount',()=>assert.equal(r.calculateCouponDiscount(sample,100000),10000)],
 ['fixed discount',()=>assert.equal(r.calculateCouponDiscount({...sample,discountPercent:null,discountAmount:15000},100000),15000)],
 ['fixed capped subtotal',()=>assert.equal(r.calculateCouponDiscount({...sample,discountPercent:null,discountAmount:15000},10000),10000)],
 ['inactive',()=>assert.equal(r.checkCouponEligibility({...sample,active:false},100000,now),'INACTIVE')],
 ['expired exact time',()=>assert.equal(r.checkCouponEligibility({...sample,expiresAt:now},100000,now),'EXPIRED')],
 ['min spend',()=>assert.equal(r.checkCouponEligibility(sample,49999,now),'MIN_ORDER_VALUE')],
 ['quota exhausted',()=>assert.equal(r.checkCouponEligibility({...sample,usedCount:100},100000,now),'QUOTA_EXHAUSTED')],
 ['valid rule',()=>assert.equal(r.checkCouponEligibility(sample,100000,now),null)],
 ['bad percent',()=>assert.throws(()=>r.assertCouponConfiguration({...sample,discountPercent:101}))],
 ['both types',()=>assert.throws(()=>r.assertCouponConfiguration({...sample,discountAmount:100}))],
 ['no types',()=>assert.throws(()=>r.assertCouponConfiguration({...sample,discountPercent:null}))],
 ['negative subtotal',()=>assert.throws(()=>r.calculateCouponDiscount(sample,-1))],
 ['invalid money decimals',()=>assert.throws(()=>r.calculateRewardsQuote(5000,2500.5,100))],
 ['correct points quote',()=>assert.deepEqual(r.calculateRewardsQuote(110000,11000,5000), {couponDiscount:11000,pointsDiscount:5000,totalDiscount:16000,total:94000})],
 ['points cap remaining',()=>assert.equal(r.calculateRewardsQuote(10000,4000,8000).total,0)],
 ['earn floor at 1%',()=>assert.equal(r.calculateEarnedPoints(94099),940)],
];
let passed=0;
for(const [label,fn] of tests){try{fn(); console.log('PASS '+label);passed++;}catch(e){console.error('FAIL '+label,e.message);process.exitCode=1;}}
console.log(`SMOKE: ${passed}/${tests.length} passed`);
