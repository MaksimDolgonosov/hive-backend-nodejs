import cors from 'cors';
import express from 'express';
import env from './config/env';
import errorMiddleware from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import stingsRoutes from './routes/stings.routes';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(env.uploadDir));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/stings', stingsRoutes);
// app.use('/api/v1/hives', hivesRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Маршрут не найден' } });
});

app.use(errorMiddleware);

export default app;
