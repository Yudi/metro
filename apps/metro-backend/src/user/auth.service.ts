import { Injectable } from '@nestjs/common';
import { auth } from 'firebase-admin';

@Injectable()
export class AuthService {
  async verifyToken(token: string): Promise<false | string> {
    try {
      const user = await auth().verifyIdToken(token);
      return user.uid;
    } catch {
      return false;
    }
  }
}
