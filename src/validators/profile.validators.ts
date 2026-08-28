import { query } from 'express-validator';

export const profileCollectionValidator = [
  query('cursor').optional().isMongoId().withMessage('cursor должен быть валидным id'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit должен быть от 1 до 50'),
];
