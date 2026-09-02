import { body } from 'express-validator';

import { PROFILE_BIO_MAX_LENGTH, PROFILE_SOCIAL_LINK_MAX_LENGTH, SOCIAL_LINK_KEYS } from '../types/profile-user';

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

export const googleLoginValidator = [
  body('idToken').isString().notEmpty().withMessage('idToken обязателен'),
];

export const otpVerifyValidator = [
  body('email').isEmail().withMessage('Некорректный email'),
  body('code')
    .isString()
    .matches(/^\d{6}$/)
    .withMessage('Код должен состоять из 6 цифр'),
  body('purpose').equals('register').withMessage('purpose должен быть register'),
];

export const otpResendValidator = [
  body('email').isEmail().withMessage('Некорректный email'),
  body('purpose')
    .isIn(['register', 'password_reset'])
    .withMessage('purpose должен быть register или password_reset'),
];

export const passwordForgotValidator = [
  body('email').isEmail().withMessage('Некорректный email'),
];

export const passwordResetValidator = [
  body('email').isEmail().withMessage('Некорректный email'),
  body('code')
    .isString()
    .matches(/^\d{6}$/)
    .withMessage('Код должен состоять из 6 цифр'),
  body('newPassword').isLength({ min: 8 }).withMessage('Пароль минимум 8 символов'),
];

export const updateProfileValidator = [
  body('bio')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: PROFILE_BIO_MAX_LENGTH })
    .withMessage(`bio не должен превышать ${PROFILE_BIO_MAX_LENGTH} символов`),
  body('socialLinks')
    .optional({ values: 'null' })
    .isObject()
    .withMessage('socialLinks должен быть объектом'),
  ...SOCIAL_LINK_KEYS.map((key) =>
    body(`socialLinks.${key}`)
      .optional({ values: 'null' })
      .isString()
      .trim()
      .isLength({ max: PROFILE_SOCIAL_LINK_MAX_LENGTH })
      .withMessage(`${key} не должен превышать ${PROFILE_SOCIAL_LINK_MAX_LENGTH} символов`),
  ),
];
