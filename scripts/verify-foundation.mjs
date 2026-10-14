// A – Chạy bằng: node scripts/verify-foundation.mjs (không cần npm install).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root,p), 'utf8');
const spec = JSON.parse(read('contracts/brewlite-v1.json'));
const schema = read('backend/prisma/schema.prisma');
const a = read('backend/src/common/pricing.ts');
const b = read('frontend/lib/pricing.ts');
const modules = ['auth','orders','payments','products','rewards'];
// Không chỉ tìm tên rời rạc trong comment: kiểm tra đúng danh sách enum trong Prisma schema.
const enumValues = (name) => {
  const m = schema.match(new RegExp(`enum\\s+${name}\\s*\\{([^}]+)\\}`));
  assert.ok(m, `Thiếu enum ${name}`);
  return m[1].split('\n').map(x => x.trim()).filter(x => x && !x.startsWith('//'));
};
assert.deepEqual(enumValues('OrderStatus'), spec.orderStatus, 'OrderStatus lệch contract');
assert.deepEqual(enumValues('PaymentMethod'), spec.paymentMethods, 'PaymentMethod lệch contract');
for (const fragment of ['idempotencyKey String', 'requestHash', 'payments        Payment[]', 'loyaltyEntries', 'toppings  String[]'])
  assert.ok(schema.includes(fragment), `Thiếu nền schema: ${fragment}`);
assert.match(read('backend/Dockerfile'), /FROM node:24/);
assert.match(read('frontend/Dockerfile'), /FROM node:24/);
for (const status of spec.orderStatus) {
  assert.match(schema, new RegExp(`\\b${status}\\b`), `Schema thiếu trạng thái ${status}`);
  assert.match(read('backend/src/contracts/public.ts'), new RegExp(`'${status}'`));
}
for (const [size,value] of Object.entries(spec.pricing.sizeExtra)) {
  for (const [name,src] of [['backend',a],['frontend',b]])
    assert.match(src, new RegExp(`\\b${size}:\\s*${value}\\b`), `${name} sai giá size ${size}`);
}
for (const [name,src] of [['backend',a],['frontend',b]])
  assert.match(src, new RegExp(`TOPPING_PRICE\\s*=\\s*${spec.pricing.toppingPrice}\\b`), `${name} sai giá topping`);
for (const [mod, owner] of Object.entries({auth:'D',products:'B',orders:'E',payments:'F',rewards:'G'})) {
  assert.ok(spec.owners[owner], `Thiếu owner ${owner}`);
  assert.ok(fs.existsSync(path.join(root,'backend/src',mod,`${mod}.module.ts`)), `Thiếu module ${mod}`);
  assert.ok(fs.existsSync(path.join(root,'backend/src',mod,'public.ts')), `Thiếu public contract của ${mod}`);
}
// Quy tắc biên: không cho feature này nhập implementation nội bộ của feature khác.
for (const module of modules) {
  const dir=path.join(root,'backend/src',module);
  const stack=[dir];
  while(stack.length) {
    const d=stack.pop();
    for(const e of fs.readdirSync(d,{withFileTypes:true})) {
      const p=path.join(d,e.name);
      if(e.isDirectory()) {stack.push(p); continue;}
      if(!e.name.endsWith('.ts'))continue;
      const src=fs.readFileSync(p,'utf8');
      for(const other of modules.filter(x=>x!==module)) {
        assert.doesNotMatch(src,new RegExp(`from\\s*['"](?:\\.\\./)+${other}/(?!public\\.js)`),
          `${module} không được import nội bộ ${other}: ${path.relative(root,p)}`);
      }
    }
  }
}
assert.ok(fs.existsSync(path.join(root,'backend/prisma/migrations/20261014000100_foundation_v1/migration.sql')));
console.log('PASS FOUNDATION V1: contract, giá, module và ranh giới import nhất quán.');
