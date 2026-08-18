import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { UserRole } from '@pos/shared';
import type { AuthUserDTO, LoginResponseDTO } from '@pos/shared';
import { durationToMs } from '../../common/duration';
import type { AuthenticatedUser, JwtPayload } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';

type UserForDTO = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  pinHash: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Validates credentials for the local strategy. Returns null on any mismatch. */
  async validateUser(username: string, password: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return { userId: user.id, username: user.username, role: user.role };
  }

  async login(user: AuthenticatedUser): Promise<LoginResponseDTO> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.userId);
    const profile = await this.getProfile(user.userId);
    return { accessToken, refreshToken, user: profile };
  }

  /** Rotates the refresh token: the presented one is revoked and a new pair issued. */
  async refresh(rawToken: string): Promise<LoginResponseDTO> {
    const tokenHash = this.hashToken(rawToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: existing.userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('User is no longer active');

    const principal: AuthenticatedUser = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };
    const accessToken = await this.signAccessToken(principal);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, user: this.toDTO(user) };
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: string): Promise<AuthUserDTO> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.toDTO(user);
  }

  private toDTO(user: UserForDTO): AuthUserDTO {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      hasPin: user.pinHash != null,
    };
  }

  private signAccessToken(user: AuthenticatedUser): Promise<string> {
    const payload: JwtPayload = { sub: user.userId, username: user.username, role: user.role };
    return this.jwt.signAsync(payload);
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    const ttlMs = durationToMs(this.config.get<string>('jwt.refreshTtl') ?? '7d');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return raw;
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
