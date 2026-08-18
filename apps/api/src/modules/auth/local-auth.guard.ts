import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Runs the local (username/password) strategy for POST /auth/login. */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
