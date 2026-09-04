export interface Order {
  id: string;
  item: string;
  quantity: number;
  status: 'pending' | 'completed';
}

export function createOrder(item: string, quantity: number): Order {
  return {
    id: `ord-${Date.now()}`,
    item,
    quantity,
    status: 'completed',
  };
}
