import { body, param, query } from 'express-validator';

const CATEGORIES = ['cafe', 'bar', 'restaurant', 'other'];
const REPORT_REASONS = ['not_a_place', 'wrong_location', 'stolen_photos', 'spam', 'other'];
const REJECT_CODES = ['quality', 'not_this_place', 'people_sensitive', 'stolen', 'other'];

export const placeIdValidator = [param('id').isMongoId()];

export const updatePlaceValidator = [
  param('id').isMongoId(),
  body('name').optional().isString().isLength({ min: 2, max: 80 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 280 }),
  body('category').optional().isIn(CATEGORIES),
  body('phone').optional({ nullable: true }).custom((value: unknown) => {
    if (value == null || value === '') {
      return true;
    }
    const raw = String(value).trim().replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(raw)) {
      throw new Error('Телефон должен быть в формате E.164');
    }
    return true;
  }),
  body('address.formatted').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 200 }),
  body('address.city').optional({ nullable: true }).isString().isLength({ max: 80 }),
  body('address.country').optional({ nullable: true }).isString().isLength({ max: 80 }),
  body('socialLinks').optional({ nullable: true }).isObject(),
];

export const placeMediaValidator = [
  param('id').isMongoId(),
  body('kind').isIn(['cover', 'gallery']),
  body('source').isIn(['library', 'camera']),
];

export const galleryOrderValidator = [
  param('id').isMongoId(),
  body('galleryIds').isArray({ min: 0, max: 12 }),
  body('galleryIds.*').isMongoId(),
];

export const mediaIdValidator = [param('id').isMongoId(), param('mediaId').isMongoId()];

export const placeReportValidator = [
  param('id').isMongoId(),
  body('reason').isIn(REPORT_REASONS),
  body('comment').optional().isString().isLength({ max: 500 }),
];

export const placeStingsValidator = [
  param('id').isMongoId(),
  query('cursor').optional().isMongoId(),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('includePartner').optional().isBoolean(),
];

export const adminPlaceCreateValidator = [
  body('ownerId').isMongoId(),
  body('name').isString().isLength({ min: 2, max: 80 }),
  body('category').isIn(CATEGORIES),
  body('address.formatted').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 200 }),
  body('address.city').optional({ nullable: true }).isString().isLength({ max: 80 }),
  body('address.country').optional({ nullable: true }).isString().isLength({ max: 80 }),
  body('center.lat').isFloat({ min: -90, max: 90 }),
  body('center.lng').isFloat({ min: -180, max: 180 }),
  body('phone').optional({ nullable: true }).isString(),
  body('description').optional({ nullable: true }).isString().isLength({ max: 280 }),
];

export const adminCenterValidator = [
  param('id').isMongoId(),
  body('lat').isFloat({ min: -90, max: 90 }),
  body('lng').isFloat({ min: -180, max: 180 }),
];

export const adminSuspendValidator = [param('id').isMongoId(), body('reason').isString().isLength({ min: 1, max: 300 })];

export const adminTransferValidator = [param('id').isMongoId(), body('newOwnerId').isMongoId()];

export const adminMediaReviewValidator = [
  param('id').isMongoId(),
  body('decision').equals('reject'),
  body('rejectCode').optional().isIn(REJECT_CODES),
];

export const adminReportResolveValidator = [
  param('id').isMongoId(),
  body('decision').isIn(['accept', 'dismiss']),
];
