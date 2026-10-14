// Test (b) do F làm; test tồn kho (c) do E làm.
describe('Payments (idempotency)', () => {
  it.todo('gửi 2 lần cùng Idempotency-Key chỉ tạo 1 Payment');
});

// TODO(E): di chuyển test tồn kho sang orders/stock.spec.ts khi hiện thực.
describe('Stock (concurrent orders)', () => {
  it.todo('10 request đồng thời, stock=3 → tối đa 3 thành công');
});
