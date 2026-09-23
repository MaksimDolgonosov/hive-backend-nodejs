import { body, param } from 'express-validator';

const CATEGORIES = ['cafe', 'bar', 'restaurant', 'other'];

function optionalPhone(value: unknown): true {
  if (value == null || value === '') {
    return true;
  }
  const raw = String(value).trim().replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{6,14}$/.test(raw)) {
    throw new Error('Телефон должен быть в формате E.164');
  }
  return true;
}

export const applicationBodyValidator = [
  body('brandName').optional().isString().isLength({ min: 2, max: 80 }),
  body('category').optional().isIn(CATEGORIES),
  body('address.formatted').optional().isString().isLength({ min: 4, max: 200 }),
  body('address.lat').optional().isFloat({ min: -90, max: 90 }),
  body('address.lng').optional().isFloat({ min: -180, max: 180 }),
  body('address.city').optional({ nullable: true }).isString().isLength({ max: 80 }),
  body('address.country').optional({ nullable: true }).isString().isLength({ max: 80 }),
  body('phone').optional({ nullable: true }).custom(optionalPhone),
  body('contactEmail').optional().isEmail(),
  body('listingUrls.instagram').optional({ nullable: true }).isString().isLength({ max: 300 }),
  body('listingUrls.website').optional({ nullable: true }).isString().isLength({ max: 300 }),
  body('listingUrls.ymaps').optional({ nullable: true }).isString().isLength({ max: 300 }),
  body('listingUrls.twogis').optional({ nullable: true }).isString().isLength({ max: 300 }),
];

export const applicationIdValidator = [param('id').isMongoId()];

export const submitApplicationValidator = [
  param('id').isMongoId(),
  body('lat').isFloat({ min: -90, max: 90 }),
  body('lng').isFloat({ min: -180, max: 180 }),
];

export const onsiteValidator = [
  param('id').isMongoId(),
  body('lat').isFloat({ min: -90, max: 90 }),
  body('lng').isFloat({ min: -180, max: 180 }),
  body('accuracy').isFloat({ min: 0 }),
  body('capturedAt').isISO8601(),
];
