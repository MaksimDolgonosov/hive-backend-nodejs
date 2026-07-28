import { body } from 'express-validator';

export const registerValidator = [
  body('email').isEmail().withMessage('Некорректный email'),
  body('password').isLength({ min: 8 }).withMessage('Пароль минимум 8 символов'),
  body('username').isLength({ min: 3, max: 30 }).withMessage('Username от 3 до 30 символов'),
];

export const loginValidator = [
  body('email').isEmail().withMessage('Некорректный email'),
  body('password').notEmpty().withMessage('Пароль обязателен'),
];

export const refreshValidator = [
  body('refreshToken').isString().notEmpty().withMessage('refreshToken обязателен'),
];
