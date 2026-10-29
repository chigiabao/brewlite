import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsService } from './products.service.js';

describe('ProductsService', () => {
  let service: ProductsService;

  const prisma = {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProductsService(prisma as never);
  });

  describe('findAll', () => {
    it('trả về danh sách sản phẩm sắp xếp theo tên tăng dần', async () => {
      const mockProducts = [
        { id: 1, name: 'Americano', price: 40000, imageUrl: '/img/americano.jpg', stock: 20 },
        { id: 2, name: 'Cà phê sữa', price: 35000, imageUrl: '/img/caphesua.jpg', stock: 20 },
      ];

      prisma.product.findMany.mockResolvedValue(mockProducts);

      const result = await service.findAll();

      expect(result).toEqual(mockProducts);
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          price: true,
          imageUrl: true,
          stock: true,
        },
      });
    });

    it('trả về mảng rỗng [] nếu chưa có sản phẩm nào (không ném lỗi)', async () => {
      prisma.product.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(prisma.product.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('trả về thông tin chi tiết của sản phẩm khi tìm thấy', async () => {
      const mockProduct = {
        id: 1,
        name: 'Cà phê sữa',
        price: 35000,
        imageUrl: '/img/caphesua.jpg',
        stock: 20,
      };

      prisma.product.findUnique.mockResolvedValue(mockProduct);

      const result = await service.findOne(1);

      expect(result).toEqual(mockProduct);
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: {
          id: true,
          name: true,
          price: true,
          imageUrl: true,
          stock: true,
        },
      });
    });

    it('ném NotFoundException khi không tìm thấy sản phẩm', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(999)).rejects.toThrow('Product not found');
    });
  });
});

