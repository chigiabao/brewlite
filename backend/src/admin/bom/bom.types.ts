export type UnitType = 'GRAM' | 'ML' | 'PIECE';

export interface Ingredient {
  id: string;
  name: string;
  unit: UnitType;
  stock: number; // gram, ml, hoặc cái
  minThreshold: number; // ngưỡng cảnh báo sắp hết
  costPerUnit: number; // VND trên 1 đơn vị
}

export interface RecipeItem {
  ingredientId: string;
  amount: number; // số lượng gram/ml/cái tiêu hao
}

export interface ProductRecipe {
  productId: number;
  productName: string;
  size: 'S' | 'M' | 'L';
  items: RecipeItem[];
}

export interface CapacityItem {
  productId: number;
  productName: string;
  size: 'S' | 'M' | 'L';
  maxServings: number;
  bottleneck: {
    ingredientId: string;
    ingredientName: string;
    unit: UnitType;
    currentStock: number;
    amountPerCup: number;
  };
}

export interface CogsItem {
  productId: number;
  productName: string;
  size: 'S' | 'M' | 'L';
  sellingPrice: number;
  cogs: number; // Giá vốn hàng bán (VND)
  grossProfit: number; // Lợi nhuận gộp (VND)
  marginPercent: number; // % biên lợi nhuận
  breakdown: Array<{
    ingredientName: string;
    amount: number;
    unit: UnitType;
    cost: number;
  }>;
}
