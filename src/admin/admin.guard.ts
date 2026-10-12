import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

// 正式環境的 DB 是 /tmp 的暫存副本，寫入不會保留，所以只開放本機使用
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (process.env.FUNCTION_NAME || process.env.K_SERVICE) {
      throw new NotFoundException();
    }
    const expected = process.env.ADMIN_TOKEN;
    const given: unknown = ctx.switchToHttp().getRequest<Request>().headers[
      'x-admin-token'
    ];
    if (!expected || typeof given !== 'string')
      throw new UnauthorizedException();
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
