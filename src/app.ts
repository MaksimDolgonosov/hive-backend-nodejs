import cors from 'cors';
import express from 'express';
import env from './config/env';
import errorMiddleware from './middleware/error.middleware';
import adminRoutes from './routes/admin.routes';
import analyticsRoutes from './routes/analytics.routes';
import authRoutes from './routes/auth.routes';
import campaignsRoutes from './routes/campaigns.routes';
import devicesRoutes from './routes/devices.routes';
import hivesRoutes from './routes/hives.routes';
import invitesRoutes from './routes/invites.routes';
import mapRoutes from './routes/map.routes';
import notificationsRoutes from './routes/notifications.routes';
import partnerRoutes from './routes/partner.routes';
import placesRoutes from './routes/places.routes';
import shareRoutes from './routes/share.routes';
import stingsRoutes from './routes/stings.routes';
import usersRoutes from './routes/users.routes';
import waitlistRoutes from './routes/waitlist.routes';
import zonesRoutes from './routes/zones.routes';

const app = express();

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(env.uploadDir));

app.use('/share', shareRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/stings', stingsRoutes);
app.use('/api/v1/places', placesRoutes);
app.use('/api/v1/partner/applications', partnerRoutes);
app.use('/api/v1/hives', hivesRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/zones', zonesRoutes);
app.use('/api/v1/campaigns', campaignsRoutes);
app.use('/api/v1/invites', invitesRoutes);
app.use('/api/v1/waitlist', waitlistRoutes);
app.use('/api/v1/devices', devicesRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/map', mapRoutes);
app.use('/api/v1/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Маршрут не найден' } });
});

app.use(errorMiddleware);

export default app;
