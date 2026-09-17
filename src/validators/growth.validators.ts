import { body, param, query } from 'express-validator';

export const latLngQueryValidator = [
  query('lat').isFloat({ min: -90, max: 90 }).withMessage('lat должен быть от -90 до 90'),
  query('lng').isFloat({ min: -180, max: 180 }).withMessage('lng должен быть от -180 до 180'),
];

export const bboxZoomValidator = [
  query('swLat').isFloat({ min: -90, max: 90 }),
  query('swLng').isFloat({ min: -180, max: 180 }),
  query('neLat').isFloat({ min: -90, max: 90 }),
  query('neLng').isFloat({ min: -180, max: 180 }),
  query('zoom').isFloat({ min: 0, max: 22 }).withMessage('zoom обязателен'),
];

export const waitlistValidator = [
  body('lat').isFloat({ min: -90, max: 90 }),
  body('lng').isFloat({ min: -180, max: 180 }),
  body('email').isEmail(),
];

export const deviceValidator = [
  body('expoPushToken').isString().notEmpty(),
  body('platform').isIn(['ios', 'android']),
  body('deviceId').isString().notEmpty(),
  body('locale').optional().isIn(['ru', 'en']),
  body('timezone').isString().notEmpty(),
];

export const deviceIdValidator = [param('deviceId').isString().notEmpty()];

export const notificationSettingsValidator = [
  body('reactions').optional().isBoolean(),
  body('nearbyActivity').optional().isBoolean(),
  body('campaigns').optional().isBoolean(),
  body('expiringSting').optional().isBoolean(),
  body('inviteAccepted').optional().isBoolean(),
];

export const privacySettingsValidator = [
  body('allowEcho').optional().isBoolean(),
  body('allowSharing').optional().isBoolean(),
];

export const analyticsValidator = [
  body('deviceId').optional().isString(),
  body('events').isArray({ min: 1, max: 50 }),
  body('events.*.name').isString().notEmpty(),
  body('events.*.occurredAt').isISO8601(),
  body('events.*.zoneId').optional().isString(),
];

export const inviteCreateValidator = [
  body('lat').optional().isFloat({ min: -90, max: 90 }),
  body('lng').optional().isFloat({ min: -180, max: 180 }),
];

export const inviteCodeValidator = [param('code').isString().isLength({ min: 6, max: 16 })];

export const campaignCreateValidator = [
  body('kind').isIn(['hive_hour', 'event']),
  body('title').isString().notEmpty(),
  body('i18nKey').isString().notEmpty(),
  body('geo').isObject(),
  body('geo.type').isIn(['radius', 'zones']),
  body('startsAt').isISO8601(),
  body('endsAt').isISO8601(),
  body('recurrence').optional().isIn(['none', 'daily', 'weekly']),
  body('ttlBonusSec').optional().isInt({ min: 0, max: 259200 }),
  body('pushEnabled').optional().isBoolean(),
];

export const accountTypeValidator = [
  param('id').isMongoId(),
  body('accountType').isIn(['personal', 'partner', 'official']),
];

export const metricsQueryValidator = [
  query('zoneId').isString().notEmpty(),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('cohort').optional().isISO8601(),
];

export const growthMetricsValidator = [
  query('from').isISO8601(),
  query('to').isISO8601(),
];
