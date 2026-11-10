import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Ingredient, ProductRecipe, CapacityItem, CogsItem, UnitType } from './bom.types.js';

@Injectable()
export class BomService {
  // 1. Kho nguyên vật liệu thực tế ban đầu (Gram / ml / Cái)
  private ingredients: Map<string, Ingredient> = new Map([
    [
      'ing_robusta',
      {
        id: 'ing_robusta',
        name: 'Hạt cà phê Robusta Buôn Ma Thuột',
        unit: 'GRAM',
        stock: 5000, // 5kg
        minThreshold: 1000,
        costPerUnit: 250, // 250.000đ / kg = 250đ / g
      },
    ],
    [
      'ing_arabica',
      {
        id: 'ing_arabica',
        name: 'Hạt cà phê Arabica Cầu Đất',
        unit: 'GRAM',
        stock: 4000, // 4kg
        minThreshold: 800,
        costPerUnit: 400, // 400.000đ / kg = 400đ / g
      },
    ],
    [
      'ing_condensed_milk',
      {
        id: 'ing_condensed_milk',
        name: 'Sữa đặc Ông Thọ',
        unit: 'ML',
        stock: 6000, // 6 lít
        minThreshold: 1500,
        costPerUnit: 70, // 70đ / ml
      },
    ],
    [
      'ing_fresh_milk',
      {
        id: 'ing_fresh_milk',
        name: 'Sữa tươi thanh trùng DalatMilk',
        unit: 'ML',
        stock: 10000, // 10 lít
        minThreshold: 2000,
        costPerUnit: 40, // 40.000đ / lít = 40đ / ml
      },
    ],
    [
      'ing_tea_leaves',
      {
        id: 'ing_tea_leaves',
        name: 'Cốt trà Oolong Lộc Phát',
        unit: 'GRAM',
        stock: 2000, // 2kg
        minThreshold: 400,
        costPerUnit: 350, // 350đ / g
      },
    ],
    [
      'ing_peach_syrup',
      {
        id: 'ing_peach_syrup',
        name: 'Siro đào Monin Pháp',
        unit: 'ML',
        stock: 2500, // 2.5 lít
        minThreshold: 500,
        costPerUnit: 180, // 180đ / ml
      },
    ],
    [
      'ing_peach_slices',
      {
        id: 'ing_peach_slices',
        name: 'Đào ngâm miếng Kronos Hy Lạp',
        unit: 'PIECE',
        stock: 120, // 120 miếng
        minThreshold: 30,
        costPerUnit: 3000, // 3.000đ / miếng
      },
    ],
    [
      'ing_matcha',
      {
        id: 'ing_matcha',
        name: 'Bột Matcha Uji Nhật Bản',
        unit: 'GRAM',
        stock: 1000, // 1kg
        minThreshold: 200,
        costPerUnit: 1200, // 1.200đ / g
      },
    ],
    [
      'ing_cup_package',
      {
        id: 'ing_cup_package',
        name: 'Bộ Ly nhựa PP + Nắp + Ống hút giấy',
        unit: 'PIECE',
        stock: 500, // 500 bộ
        minThreshold: 100,
        costPerUnit: 800, // 800đ / bộ
      },
    ],
  ]);

  // 2. Định mức công thức chuẩn (BOM - Recipe)
  private recipes: ProductRecipe[] = [
    // 1: Cà phê sữa
    {
      productId: 1,
      productName: 'Cà phê sữa',
      size: 'S',
      items: [
        { ingredientId: 'ing_robusta', amount: 16 }, // 16g
        { ingredientId: 'ing_condensed_milk', amount: 35 }, // 35ml
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },
    {
      productId: 1,
      productName: 'Cà phê sữa',
      size: 'M',
      items: [
        { ingredientId: 'ing_robusta', amount: 20 }, // 20g
        { ingredientId: 'ing_condensed_milk', amount: 45 }, // 45ml
        { ingredientId: 'ing_fresh_milk', amount: 20 }, // 20ml
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },
    {
      productId: 1,
      productName: 'Cà phê sữa',
      size: 'L',
      items: [
        { ingredientId: 'ing_robusta', amount: 25 }, // 25g
        { ingredientId: 'ing_condensed_milk', amount: 55 }, // 55ml
        { ingredientId: 'ing_fresh_milk', amount: 30 }, // 30ml
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },

    // 2: Americano
    {
      productId: 2,
      productName: 'Americano',
      size: 'S',
      items: [
        { ingredientId: 'ing_arabica', amount: 16 },
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },
    {
      productId: 2,
      productName: 'Americano',
      size: 'M',
      items: [
        { ingredientId: 'ing_arabica', amount: 20 },
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },
    {
      productId: 2,
      productName: 'Americano',
      size: 'L',
      items: [
        { ingredientId: 'ing_arabica', amount: 25 },
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },

    // 3: Cappuccino
    {
      productId: 3,
      productName: 'Cappuccino',
      size: 'S',
      items: [
        { ingredientId: 'ing_arabica', amount: 16 },
        { ingredientId: 'ing_fresh_milk', amount: 120 }, // 120ml
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },
    {
      productId: 3,
      productName: 'Cappuccino',
      size: 'M',
      items: [
        { ingredientId: 'ing_arabica', amount: 20 },
        { ingredientId: 'ing_fresh_milk', amount: 160 }, // 160ml
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },
    {
      productId: 3,
      productName: 'Cappuccino',
      size: 'L',
      items: [
        { ingredientId: 'ing_arabica', amount: 25 },
        { ingredientId: 'ing_fresh_milk', amount: 220 }, // 220ml
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },

    // 4: Trà đào
    {
      productId: 4,
      productName: 'Trà đào',
      size: 'S',
      items: [
        { ingredientId: 'ing_tea_leaves', amount: 10 },
        { ingredientId: 'ing_peach_syrup', amount: 30 },
        { ingredientId: 'ing_peach_slices', amount: 1 },
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },
    {
      productId: 4,
      productName: 'Trà đào',
      size: 'M',
      items: [
        { ingredientId: 'ing_tea_leaves', amount: 12 },
        { ingredientId: 'ing_peach_syrup', amount: 45 },
        { ingredientId: 'ing_peach_slices', amount: 2 },
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },
    {
      productId: 4,
      productName: 'Trà đào',
      size: 'L',
      items: [
        { ingredientId: 'ing_tea_leaves', amount: 15 },
        { ingredientId: 'ing_peach_syrup', amount: 60 },
        { ingredientId: 'ing_peach_slices', amount: 3 },
        { ingredientId: 'ing_cup_package', amount: 1 },
      ],
    },
  ];

  // Giá bán cơ sở phục vụ tính COGS
  private basePrices: Record<number, number> = {
    1: 35000, // Cà phê sữa
    2: 40000, // Americano
    3: 45000, // Cappuccino
    4: 39000, // Trà đào
  };

  private sizeExtra: Record<'S' | 'M' | 'L', number> = {
    S: 0,
    M: 5000,
    L: 10000,
  };

  // ==================== CÁC PHƯƠNG THỨC NGHIỆP VỤ ====================

  /**
   * Lấy toàn bộ kho nguyên vật liệu
   */
  getAllIngredients(): Ingredient[] {
    return Array.from(this.ingredients.values());
  }

  /**
   * Nhập kho thêm nguyên vật liệu (Restock)
   */
  restockIngredient(ingredientId: string, amount: number): Ingredient {
    if (amount <= 0) {
      throw new BadRequestException('Số lượng nhập kho phải lớn hơn 0');
    }
    const ing = this.ingredients.get(ingredientId);
    if (!ing) {
      throw new NotFoundException(`Không tìm thấy nguyên liệu có mã ${ingredientId}`);
    }
    ing.stock += amount;
    return ing;
  }

  /**
   * THUẬT TOÁN TÍNH TOÁN NGUỒN (CAPACITY & BOTTLENECK ENGINE)
   * Tính số ly tối đa có thể pha được cho từng công thức dựa vào kho gram/ml hiện tại,
   * đồng thời phát hiện nguyên liệu nào đang là ĐIỂM NGHẼN (Bottleneck).
   */
  calculateCapacities(): CapacityItem[] {
    return this.recipes.map((recipe) => {
      let maxServings = Number.POSITIVE_INFINITY;
      let bottleneck = {
        ingredientId: '',
        ingredientName: '',
        unit: 'GRAM' as UnitType,
        currentStock: 0,
        amountPerCup: 0,
      };

      for (const item of recipe.items) {
        const ing = this.ingredients.get(item.ingredientId);
        if (!ing) continue;

        const possibleServings = Math.floor(ing.stock / item.amount);
        if (possibleServings < maxServings) {
          maxServings = possibleServings;
          bottleneck = {
            ingredientId: ing.id,
            ingredientName: ing.name,
            unit: ing.unit,
            currentStock: ing.stock,
            amountPerCup: item.amount,
          };
        }
      }

      return {
        productId: recipe.productId,
        productName: recipe.productName,
        size: recipe.size,
        maxServings: Number.isFinite(maxServings) ? maxServings : 0,
        bottleneck,
      };
    });
  }

  /**
   * THUẬT TOÁN TÍNH GIÁ VỐN HÀNG BÁN (COGS) & BIÊN LỢI NHUẬN GỘP
   */
  calculateCogs(): CogsItem[] {
    return this.recipes.map((recipe) => {
      const basePrice = this.basePrices[recipe.productId] ?? 40000;
      const sellingPrice = basePrice + this.sizeExtra[recipe.size];

      let cogs = 0;
      const breakdown = recipe.items.map((item) => {
        const ing = this.ingredients.get(item.ingredientId);
        const cost = ing ? Math.round(item.amount * ing.costPerUnit) : 0;
        cogs += cost;
        return {
          ingredientName: ing?.name ?? item.ingredientId,
          amount: item.amount,
          unit: ing?.unit ?? 'GRAM',
          cost,
        };
      });

      const grossProfit = sellingPrice - cogs;
      const marginPercent = Math.round((grossProfit / sellingPrice) * 1000) / 10;

      return {
        productId: recipe.productId,
        productName: recipe.productName,
        size: recipe.size,
        sellingPrice,
        cogs,
        grossProfit,
        marginPercent,
        breakdown,
      };
    });
  }

  /**
   * Trừ kho nguyên liệu khi pha chế thành công một ly nước
   */
  deductIngredients(productId: number, size: 'S' | 'M' | 'L', qty = 1): void {
    const recipe = this.recipes.find((r) => r.productId === productId && r.size === size);
    if (!recipe) return;

    // Kiểm tra xem có đủ nguyên liệu không
    for (const item of recipe.items) {
      const ing = this.ingredients.get(item.ingredientId);
      if (ing && ing.stock < item.amount * qty) {
        throw new BadRequestException(
          `Không đủ nguyên liệu ${ing.name} (còn ${ing.stock}${ing.unit}, cần ${item.amount * qty}${ing.unit})`,
        );
      }
    }

    // Trừ kho nguyên liệu
    for (const item of recipe.items) {
      const ing = this.ingredients.get(item.ingredientId);
      if (ing) {
        ing.stock -= item.amount * qty;
      }
    }
  }
}
