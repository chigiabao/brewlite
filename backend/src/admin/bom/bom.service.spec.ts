import { describe, it, expect, beforeEach } from 'vitest';
import { BomService } from './bom.service.js';

describe('BomService (Quản lý Nguyên vật liệu & Tính toán Nguồn)', () => {
  let service: BomService;

  beforeEach(() => {
    service = new BomService();
  });

  describe('Quản lý Tồn kho Nguyên vật liệu (Gram / ml / Cái)', () => {
    it('lấy đầy đủ danh sách nguyên vật liệu thô', () => {
      const list = service.getAllIngredients();
      expect(list.length).toBeGreaterThanOrEqual(8);
      const robusta = list.find((i) => i.id === 'ing_robusta');
      expect(robusta).toBeDefined();
      expect(robusta?.unit).toBe('GRAM');
      expect(robusta?.stock).toBe(5000); // 5000 gram
    });

    it('nhập thêm nguyên liệu thành công', () => {
      const updated = service.restockIngredient('ing_robusta', 1000);
      expect(updated.stock).toBe(6000); // 5000 + 1000
    });

    it('ném lỗi khi nhập số lượng <= 0', () => {
      expect(() => service.restockIngredient('ing_robusta', 0)).toThrow('lớn hơn 0');
      expect(() => service.restockIngredient('ing_robusta', -500)).toThrow('lớn hơn 0');
    });

    it('ném lỗi 404 khi nguyên liệu không tồn tại', () => {
      expect(() => service.restockIngredient('ing_khong_ton_tai', 100)).toThrow('Không tìm thấy');
    });
  });

  describe('Thuật toán Tính toán Nguồn (Capacity & Bottleneck Engine)', () => {
    it('tính toán số ly tối đa có thể pha được cho từng món', () => {
      const capacities = service.calculateCapacities();
      expect(capacities.length).toBeGreaterThan(0);

      // Cà phê sữa Size M: cần 20g Robusta, 45ml Sữa đặc, 20ml Sữa tươi, 1 Ly
      // Stock: 5000g Robusta (5000/20=250), 6000ml Sữa đặc (6000/45=133), 10000ml Sữa tươi (10000/20=500), 500 Ly (500)
      // Điểm nghẽn là Sữa đặc (133 ly)
      const capheSuaM = capacities.find((c) => c.productId === 1 && c.size === 'M');
      expect(capheSuaM).toBeDefined();
      expect(capheSuaM?.maxServings).toBe(133);
      expect(capheSuaM?.bottleneck.ingredientId).toBe('ing_condensed_milk');
    });

    it('cập nhật ngay số ly tối đa khi giảm tồn kho nguyên liệu', () => {
      // Giảm sữa đặc xuống chỉ còn 90ml
      const milk = service.getAllIngredients().find((i) => i.id === 'ing_condensed_milk')!;
      milk.stock = 90;

      const capacities = service.calculateCapacities();
      const capheSuaM = capacities.find((c) => c.productId === 1 && c.size === 'M');
      // 90ml / 45ml = 2 ly
      expect(capheSuaM?.maxServings).toBe(2);
      expect(capheSuaM?.bottleneck.ingredientName).toContain('Sữa đặc');
    });
  });

  describe('Thuật toán Tính Giá Vốn Hàng Bán (COGS) & Biên Lợi Nhuận', () => {
    it('tính chính xác chi phí nguyên liệu từng ly nước và tỷ suất lợi nhuận', () => {
      const cogsList = service.calculateCogs();
      expect(cogsList.length).toBeGreaterThan(0);

      // Cà phê sữa Size M:
      // Giá bán = 35.000 + 5.000 (M) = 40.000đ
      // Chi phí:
      // 20g Robusta * 250 = 5.000đ
      // 45ml Sữa đặc * 70 = 3.150đ
      // 20ml Sữa tươi * 40 = 800đ
      // 1 Ly = 800đ
      // Tổng COGS = 5000 + 3150 + 800 + 800 = 9.750đ
      // Lợi nhuận gộp = 40.000 - 9.750 = 30.250đ
      // Biên lợi nhuận = 30250 / 40000 = 75.6%
      const capheSuaM = cogsList.find((c) => c.productId === 1 && c.size === 'M');
      expect(capheSuaM).toBeDefined();
      expect(capheSuaM?.sellingPrice).toBe(40000);
      expect(capheSuaM?.cogs).toBe(9750);
      expect(capheSuaM?.grossProfit).toBe(30250);
      expect(capheSuaM?.marginPercent).toBeCloseTo(75.6, 1);
    });
  });

  describe('Khấu trừ Tồn kho Nguyên liệu khi Pha chế (Deduction)', () => {
    it('trừ chính xác số gram và ml khi pha chế 2 ly', () => {
      const robustaBefore = service.getAllIngredients().find((i) => i.id === 'ing_robusta')!.stock;
      const milkBefore = service.getAllIngredients().find((i) => i.id === 'ing_condensed_milk')!.stock;

      // Pha 2 ly Cà phê sữa size M (mỗi ly 20g cà phê, 45ml sữa đặc)
      service.deductIngredients(1, 'M', 2);

      const robustaAfter = service.getAllIngredients().find((i) => i.id === 'ing_robusta')!.stock;
      const milkAfter = service.getAllIngredients().find((i) => i.id === 'ing_condensed_milk')!.stock;

      expect(robustaAfter).toBe(robustaBefore - 40); // 20g * 2 = 40g
      expect(milkAfter).toBe(milkBefore - 90); // 45ml * 2 = 90ml
    });

    it('chặn và ném lỗi khi kho nguyên liệu không đủ để pha', () => {
      const milk = service.getAllIngredients().find((i) => i.id === 'ing_condensed_milk')!;
      milk.stock = 10; // Chỉ còn 10ml, không đủ pha ly cần 45ml

      expect(() => service.deductIngredients(1, 'M', 1)).toThrow('Không đủ nguyên liệu');
    });
  });
});
