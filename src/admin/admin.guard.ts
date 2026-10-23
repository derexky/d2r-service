import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { accessKeys, verifyAccessJwt } from './access-jwt';

// 正式環境的 DB 是 /tmp 的暫存副本，寫入不會保留，所以只開放本機使用。
// myhost 設了 CF_ACCESS_TEAM_DOMAIN／CF_ACCESS_AUD：只認 Cloudflare Access 簽的 JWT，
// 繞過 Access（設定出錯、從 NAS 本機直連）的請求就沒有合法 JWT。本機開發沒有 Access，用 ADMIN_TOKEN
@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (process.env.FUNCTION_NAME || process.env.K_SERVICE) {
      throw new NotFoundException();
    }
    const headers = ctx.switchToHttp().getRequest<Request>().headers;
    const team = process.env.CF_ACCESS_TEAM_DOMAIN;
    const aud = process.env.CF_ACCESS_AUD;
    if (team && aud) {
      const jwt = headers['cf-access-jwt-assertion'];
      if (typeof jwt !== 'string') throw new UnauthorizedException();
      const kid = jwtKid(jwt);
      const keys = await accessKeys(team, kid);
      if (!verifyAccessJwt(jwt, (k) => keys.get(k), aud, `https://${team}`)) {
        throw new UnauthorizedException();
      }
      return true;
    }
    const expected = process.env.ADMIN_TOKEN;
    const given: unknown = headers['x-admin-token'];
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

function jwtKid(jwt: string): string {
  try {
    return String(JSON.parse(Buffer.from(jwt.split('.')[0], 'base64url').toString()).kid ?? '');
  } catch {
    return '';
  }
}
