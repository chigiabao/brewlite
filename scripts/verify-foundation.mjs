import fs from 'fs';
import path from 'path';

console.log('🔍 [BrewLite] Running Foundation Guard verification...\n');

let failed = false;

function check(name, fn) {
  try {
    const ok = fn();
    if (ok) {
      console.log(`  ✅ [PASS] ${name}`);
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
      failed = true;
    }
  } catch (err) {
    console.error(`  ❌ [ERROR] ${name}:`, err.message);
    failed = true;
  }
}

// 1. Node runtime
check('Node.js runtime >= 20', () => {
  const version = parseInt(process.versions.node.split('.')[0], 10);
  return version >= 20;
});

// 2. Core owned files existence
const requiredFiles = [
  'frontend/store/cart.ts',
  'frontend/lib/pricing.ts',
  'frontend/app/cart/page.tsx',
  'frontend/components/cart-link.tsx',
  'BrewLite_GUIDE-V2_C-Cart_2026-10-15.manifest.json',
];

for (const relPath of requiredFiles) {
  check(`File exists: ${relPath}`, () => {
    return fs.existsSync(path.resolve(process.cwd(), relPath));
  });
}

// 3. Security & Anti-pattern guard
check('Ownership guard: Cart must NOT create backend cart API', () => {
  const badEndpoint1 = path.resolve(process.cwd(), 'backend/src/cart');
  return !fs.existsSync(badEndpoint1);
});

check('Ownership guard: Cart must NOT create cart table in Prisma schema', () => {
  const prismaPath = path.resolve(process.cwd(), 'backend/prisma/schema.prisma');
  if (!fs.existsSync(prismaPath)) return true; // not created
  const content = fs.readFileSync(prismaPath, 'utf8');
  return !content.toLowerCase().includes('model cart');
});

// 4. Cart store contract check
check('Contract guard: Cart store uses brewlite-cart-v1', () => {
  const cartStorePath = path.resolve(process.cwd(), 'frontend/store/cart.ts');
  const content = fs.readFileSync(cartStorePath, 'utf8');
  return content.includes('brewlite-cart-v1') && content.includes('useCartStore');
});

console.log('\n----------------------------------------');
if (failed) {
  console.error('❌ FOUNDATION GUARD FAILED. Do not modify guard to bypass; report to team leader.');
  process.exit(1);
} else {
  console.log('🎉 ALL FOUNDATION GUARDS PASSED. Stack ready for Task 5 implementation!');
  process.exit(0);
}
