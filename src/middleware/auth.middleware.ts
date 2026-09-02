import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import User from '../models/User';
import { AppError } from '../utils/AppError';

async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Отсутствует accessToken');
    }

    const payload = jwt.verify(token, env.jwtAccessSecret) as { sub: string };
    const user = await User.findById(payload.sub);

    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Пользователь не найден');
    }

    if (user.status === 'disabled') {
      throw new AppError(403, 'ACCOUNT_DISABLED', 'Аккаунт заблокирован');
    }

    req.user = { id: user.id, email: user.email, username: user.username };
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError(401, 'UNAUTHORIZED', 'Недействительный accessToken'));
  }
}

export default requireAuth;
