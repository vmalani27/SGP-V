import { Router, Request, Response } from 'express';
import { createOrder } from '../domain/order-service';

export const orderRouter = Router();

orderRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

orderRouter.post('/orders', (req: Request, res: Response) => {
  const { item = 'cloud-server', quantity = 1 } = req.body || {};
  const order = createOrder(item, quantity);
  res.status(201).json({ message: 'Order processed successfully', order });
});
