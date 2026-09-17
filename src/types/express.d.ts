declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username: string;
        role: 'user' | 'admin';
        accountType: 'personal' | 'partner' | 'official';
      };
    }
  }
}

export {};
