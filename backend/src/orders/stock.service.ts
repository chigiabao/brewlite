// TODO(E – Task 10.3): kiểm soát tồn kho khi đặt đồng thời.
// Trong transaction của POST /orders: đọc Product (stock, version), rồi
// updateMany({ where: { id, version }, data: { stock: { decrement }, version: { increment: 1 } } }).
// count = 0 nghĩa là có người khác vừa đổi → thử lại hoặc báo hết hàng.
export {};
