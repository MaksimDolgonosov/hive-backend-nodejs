import { body, param, query } from 'express-validator';

export const nearbyValidator = [
  query('swLat').isFloat({ min: -90, max: 90 }).withMessage('swLat должен быть от -90 до 90'),
  query('swLng').isFloat({ min: -180, max: 180 }).withMessage('swLng должен быть от -180 до 180'),
  query('neLat').isFloat({ min: -90, max: 90 }).withMessage('neLat должен быть от -90 до 90'),
  query('neLng').isFloat({ min: -180, max: 180 }).withMessage('neLng должен быть от -180 до 180'),
];

export const createStingValidator = [
  body('lat').isFloat({ min: -90, max: 90 }).withMessage('lat должен быть от -90 до 90'),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('lng должен быть от -180 до 180'),
  body('accuracy')
    .isFloat({ min: 0 })
    .withMessage('accuracy обязателен и должен быть неотрицательным'),
  body('capturedAt').isISO8601().withMessage('capturedAt должен быть ISO8601'),
  body('comment')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 280 })
    .withMessage('comment не должен превышать 280 символов'),
];

export const stingIdValidator = [
  param('id').isMongoId().withMessage('Некорректный id жала'),
];

export const reactionValidator = [
  body('type').equals('like').withMessage('Поддерживается только type=like'),
];
