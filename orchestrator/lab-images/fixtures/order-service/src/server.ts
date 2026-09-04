import express from 'express';
import { orderRouter } from './api/order-routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', orderRouter);

app.get('/', (_req, res) => {
  res.json({ service: 'order-service', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`Order service listening on port ${PORT}`);
});
