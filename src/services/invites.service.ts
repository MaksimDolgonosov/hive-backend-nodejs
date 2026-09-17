import crypto from 'crypto';

import env from '../config/env';
import Invite, { IInvite } from '../models/Invite';
import User from '../models/User';
import Zone, { zoneCenterPoint } from '../models/Zone';
import { PublicInvite } from '../types/growth';
import { GeoPoint } from '../types/sting';
import { AppError } from '../utils/AppError';
import { cellCenter } from '../utils/h3';
import { generateInviteCode, inviteQuota, normalizeInviteCode } from '../utils/invite-code';

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function toPublicInvite(invite: IInvite): PublicInvite {
  return {
    code: invite.code,
    zoneId: invite.zoneId,
    usesLimit: invite.usesLimit,
    usesCount: invite.usesCount,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function createInvite(userId: string, zoneId: string | null): Promise<{
  code: string;
  url: string;
  usesLeft: number;
  expiresAt: string;
}> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  const quota = inviteQuota(user.inviteAcceptedCount);
  const usesLeft = Math.max(0, quota - user.inviteUsesCount);
  if (usesLeft <= 0) {
    throw new AppError(429, 'RATE_LIMITED', 'Квота приглашений исчерпана');
  }

  let code = generateInviteCode((size) => crypto.randomBytes(size));
  while (await Invite.exists({ code })) {
    code = generateInviteCode((size) => crypto.randomBytes(size));
  }

  const invite = await Invite.create({
    code,
    ownerId: userId,
    zoneId,
    usesLimit: Math.min(5, usesLeft),
    usesCount: 0,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  return {
    code: invite.code,
    url: `${env.publicAppUrl.replace(/\/$/, '')}/i/${invite.code}`,
    usesLeft,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function listMyInvites(userId: string): Promise<{
  invites: PublicInvite[];
  acceptedCount: number;
  usesLeft: number;
}> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  const invites = await Invite.find({ ownerId: userId }).sort({ createdAt: -1 });
  const quota = inviteQuota(user.inviteAcceptedCount);

  return {
    invites: invites.map(toPublicInvite),
    acceptedCount: user.inviteAcceptedCount,
    usesLeft: Math.max(0, quota - user.inviteUsesCount),
  };
}

export async function getPublicInvite(codeRaw: string): Promise<{
  valid: boolean;
  ownerUsername: string | null;
  zoneCenter: GeoPoint | null;
}> {
  const code = normalizeInviteCode(codeRaw);
  const invite = await Invite.findOne({ code });
  const now = new Date();

  if (!invite || invite.expiresAt <= now || invite.usesCount >= invite.usesLimit) {
    return { valid: false, ownerUsername: null, zoneCenter: null };
  }

  const owner = await User.findById(invite.ownerId).select('username');
  let zoneCenter: GeoPoint | null = null;
  if (invite.zoneId) {
    const zone = await Zone.findById(invite.zoneId);
    zoneCenter = zone ? zoneCenterPoint(zone) : cellCenter(invite.zoneId);
  }

  return {
    valid: true,
    ownerUsername: owner?.username ?? null,
    zoneCenter,
  };
}

export async function consumeInviteCode(
  codeRaw: string | undefined,
  userId: string,
): Promise<void> {
  if (!codeRaw) {
    return;
  }

  const code = normalizeInviteCode(codeRaw);
  const invite = await Invite.findOne({ code });
  const now = new Date();

  if (!invite || invite.expiresAt <= now || invite.usesCount >= invite.usesLimit) {
    console.warn('[invites] invalid or expired invite code ignored', code);
    return;
  }

  if (String(invite.ownerId) === userId) {
    console.warn('[invites] self-invite ignored', code);
    return;
  }

  invite.usesCount += 1;
  await invite.save();

  await User.updateOne(
    { _id: userId, invitedByUserId: null },
    {
      $set: {
        invitedByUserId: invite.ownerId,
        invitedInviteCode: invite.code,
      },
    },
  );

  await User.updateOne({ _id: invite.ownerId }, { $inc: { inviteUsesCount: 1 } });
}

export async function grantInviteBonusAfterFirstSting(userId: string): Promise<string | null> {
  const user = await User.findById(userId);
  if (!user || user.inviteBonusGranted || !user.invitedByUserId) {
    return null;
  }

  user.inviteBonusGranted = true;
  await user.save();

  await User.updateOne({ _id: user.invitedByUserId }, { $inc: { inviteAcceptedCount: 1 } });
  return String(user.invitedByUserId);
}
