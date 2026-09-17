import { body, param, query } from 'express-validator';

export const nearbyValidator = [
  query('swLat').isFloat({ min: -90, max: 90 }).withMessage('swLat должен быть от -90 до 90'),
  query('swLng').isFloat({ min: -180, max: 180 }).withMessage('swLng должен быть от -180 до 180'),
  query('neLat').isFloat({ min: -90, max: 90 }).withMessage('neLat должен быть от -90 до 90'),
  query('neLng').isFloat({ min: -180, max: 180 }).withMessage('neLng должен быть от -180 до 180'),
  query('includeEchoes').optional().isBoolean().withMessage('includeEchoes должен быть boolean'),
  query('includeSeeds').optional().isBoolean().withMessage('includeSeeds должен быть boolean'),
  query('minResults').optional().isInt({ min: 0, max: 50 }).withMessage('minResults должен быть от 0 до 50'),
  query('maxRadiusM').optional().isInt({ min: 1, max: 200000 }).withMessage('maxRadiusM слишком большой'),
];

export const nearestValidator = [
  query('lat').isFloat({ min: -90, max: 90 }).withMessage('lat должен быть от -90 до 90'),
  query('lng').isFloat({ min: -180, max: 180 }).withMessage('lng должен быть от -180 до 180'),
  query('limit').optional().isInt({ min: 1, max: 10 }).withMessage('limit должен быть от 1 до 10'),
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
