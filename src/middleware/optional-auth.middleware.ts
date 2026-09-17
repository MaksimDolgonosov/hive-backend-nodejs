import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import User from '../models/User';

async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      next();
      return;
    }

    const payload = jwt.verify(token, env.jwtAccessSecret) as { sub: string };
    const user = await User.findById(payload.sub);
    if (user && user.status !== 'disabled') {
      req.user = {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role ?? 'user',
        accountType: user.accountType ?? 'personal',
      };
    }
    next();
  } catch {
    next();
  }
}

export default optionalAuth;
