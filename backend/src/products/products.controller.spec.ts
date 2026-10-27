import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsController } from './products.controller.js';
import type { ProductsService } from './products.service.js';

describe('ProductsController', () => {
  let controller: ProductsController;
  let service: ProductsService;

  beforeEach(() => {
    service = {
      findAll: vi.fn(),
      findOne: vi.fn(),
    } as unknown as ProductsService;

    controller = new ProductsController(service);
  });

  describe('findAll', () => {
    it('gọi service.findAll() và trả về danh sách sản phẩm', async () => {
      const mockProducts = [
        { id: 1, name: 'Americano', price: 40000, imageUrl: '/img/americano.jpg', stock: 20 },
      ];
      vi.mocked(service.findAll).mockResolvedValue(mockProducts as never);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalledOnce();
      expect(result).toEqual(mockProducts);
    });
  });

  describe('findOne', () => {
    it('gọi service.findOne(id) với id tương ứng và trả về sản phẩm', async () => {
      const mockProduct = {
        id: 1,
        name: 'Americano',
        price: 40000,
        imageUrl: '/img/americano.jpg',
        stock: 20,
      };
      vi.mocked(service.findOne).mockResolvedValue(mockProduct as never);

      const result = await controller.findOne(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockProduct);
    });
  });
});

