import { param } from 'express-validator';

export const userIdValidator = [param('id').isMongoId().withMessage('Некорректный id пользователя')];
