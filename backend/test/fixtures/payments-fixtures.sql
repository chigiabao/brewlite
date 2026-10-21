INSERT INTO "User"(id,email,"passwordHash") VALUES (1,'api-fixture@brewlite.test','x') ON CONFLICT (id) DO NOTHING;
INSERT INTO "User"(id,email,"passwordHash") VALUES (2,'api-fixture-2@brewlite.test','x') ON CONFLICT (id) DO NOTHING;

DELETE FROM "Payment" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "userId" IN (1,2));
DELETE FROM "Order" WHERE "userId" IN (1,2);

INSERT INTO "Order"(id,"userId",total,status) VALUES
  (1001,1,85000,'PENDING'),
  (1002,1,50000,'PENDING'),
  (1003,1,42000,'PENDING'),
  (1004,1,55000,'PENDING'),
  (1005,1,61000,'PENDING'),
  (1006,1,77000,'PENDING'),
  (1007,1,30000,'PENDING'),
  (1008,1,33000,'PENDING'),
  (1009,1,36000,'PENDING'),
  (1010,1,39000,'PENDING'),
  (1011,1,45000,'CANCELLED'),
  (1012,2,45000,'PENDING');

SELECT setval(pg_get_serial_sequence('"Order"','id'), (SELECT MAX(id) FROM "Order"));

SELECT id, "userId", total, status FROM "Order" WHERE id >= 1001 ORDER BY id;
