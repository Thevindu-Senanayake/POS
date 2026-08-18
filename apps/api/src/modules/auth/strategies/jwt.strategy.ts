import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser, JwtPayload } from '../../../common/types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('jwt.accessSecret');
    if (!secret) throw new Error('jwt.accessSecret is not configured');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /** Return value becomes `request.user`. */
  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload?.sub) throw new UnauthorizedException();
    return { userId: payload.sub, username: payload.username, role: payload.role };
  }
}
