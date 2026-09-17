import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

import env from '../config/env';
import Device, { DeviceLocale } from '../models/Device';
import PushLog from '../models/PushLog';
import PushQueue from '../models/PushQueue';
import PushTicket from '../models/PushTicket';
import Sting from '../models/Sting';
import User, { NotificationSettings } from '../models/User';
import { PushType } from '../models/PushLog';
import { isQuietHours, nextQuietHoursEnd } from '../utils/quiet-hours';
import { sendZoneOpenedEmail } from './email.service';

const expo = new Expo({ accessToken: env.expoAccessToken || undefined });

const DAILY_PUSH_LIMIT = 3;
const EXEMPT_FROM_DAILY_LIMIT: PushType[] = ['sting_reaction', 'zone_opened'];

const COPY: Record<PushType, Record<DeviceLocale, { title: string; body: string }>> = {
  sting_reaction: {
    ru: { title: 'Hive', body: 'Кто-то оценил ваше жало' },
    en: { title: 'Hive', body: 'Someone liked your sting' },
  },
  nearby_activity: {
    ru: { title: 'Hive', body: 'Рядом зажёгся улей' },
    en: { title: 'Hive', body: 'A hive just ignited nearby' },
  },
  campaign_started: {
    ru: { title: 'Hive', body: 'Начался час улья' },
    en: { title: 'Hive', body: 'Hive Hour has started' },
  },
  sting_expiring: {
    ru: { title: 'Hive', body: 'Ваше жало скоро исчезнет' },
    en: { title: 'Hive', body: 'Your sting is about to expire' },
  },
  invite_accepted: {
    ru: { title: 'Hive', body: 'Ваш друг опубликовал первое жало' },
    en: { title: 'Hive', body: 'Your invitee published their first sting' },
  },
  zone_opened: {
    ru: { title: 'Hive', body: 'Ваш район открылся в Hive' },
    en: { title: 'Hive', body: 'Your area just opened in Hive' },
  },
};

const SETTING_BY_TYPE: Record<PushType, keyof NotificationSettings | null> = {
  sting_reaction: 'reactions',
  nearby_activity: 'nearbyActivity',
  campaign_started: 'campaigns',
  sting_expiring: 'expiringSting',
  invite_accepted: 'inviteAccepted',
  zone_opened: null,
};

function deeplinkFor(type: PushType, entityId: string): string {
  if (type === 'sting_reaction' || type === 'sting_expiring') {
    return `hiveapp://sting/${entityId}`;
  }
  if (type === 'campaign_started') {
    return `hiveapp://campaign/${entityId}`;
  }
  return 'hiveapp://(tabs)';
}

export async function enqueuePush(input: {
  userId: string;
  type: PushType;
  entityId: string;
}): Promise<void> {
  const user = await User.findById(input.userId).select('notificationSettings');
  if (!user) {
    return;
  }

  const settingKey = SETTING_BY_TYPE[input.type];
  if (settingKey && user.notificationSettings[settingKey] === false) {
    return;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const duplicate = await PushLog.findOne({
    userId: input.userId,
    type: input.type,
    entityId: input.entityId,
    createdAt: { $gte: since },
  });
  if (duplicate) {
    return;
  }

  if (!EXEMPT_FROM_DAILY_LIMIT.includes(input.type)) {
    const sentToday = await PushLog.countDocuments({
      userId: input.userId,
      type: { $nin: EXEMPT_FROM_DAILY_LIMIT },
      createdAt: { $gte: since },
    });
    if (sentToday >= DAILY_PUSH_LIMIT) {
      return;
    }
  }

  const devices = await Device.find({ userId: input.userId });
  if (devices.length === 0) {
    return;
  }

  await PushLog.create({
    userId: input.userId,
    type: input.type,
    entityId: input.entityId,
  });

  for (const device of devices) {
    if (input.type === 'sting_expiring' && isQuietHours(device.timezone)) {
      continue;
    }

    const copy = COPY[input.type][device.locale] ?? COPY[input.type].en;
    const sendAfter =
      isQuietHours(device.timezone) && input.type !== 'sting_expiring'
        ? nextQuietHoursEnd(device.timezone)
        : new Date();

    await PushQueue.create({
      userId: input.userId,
      type: input.type,
      entityId: input.entityId,
      title: copy.title,
      body: copy.body,
      deeplink: deeplinkFor(input.type, input.entityId),
      sendAfter,
    });
  }
}

export async function notifyStingReaction(authorId: string, stingId: string, actorId: string): Promise<void> {
  if (authorId === actorId) {
    return;
  }
  await enqueuePush({ userId: authorId, type: 'sting_reaction', entityId: stingId });
}

export async function notifyNearbyActivity(zoneId: string, hiveId: string): Promise<void> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const authors = await Sting.distinct('authorId', {
    zoneId,
    createdAt: { $gte: since },
  });

  await Promise.all(
    authors.map((authorId) =>
      enqueuePush({ userId: String(authorId), type: 'nearby_activity', entityId: hiveId }),
    ),
  );
}

export async function notifyCampaignStarted(campaignId: string, zoneIds: string[]): Promise<void> {
  if (zoneIds.length === 0) {
    return;
  }
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const authors = await Sting.distinct('authorId', {
    zoneId: { $in: zoneIds },
    createdAt: { $gte: since },
  });
  await Promise.all(
    authors.map((authorId) =>
      enqueuePush({ userId: String(authorId), type: 'campaign_started', entityId: campaignId }),
    ),
  );
}

export async function notifyInviteAccepted(inviterId: string, inviteeId: string): Promise<void> {
  await enqueuePush({ userId: inviterId, type: 'invite_accepted', entityId: inviteeId });
}

export async function notifyZoneOpened(zoneId: string, emails: string[]): Promise<void> {
  const users = await User.find({ email: { $in: emails } }).select('_id');
  await Promise.all(
    users.map((user) => enqueuePush({ userId: user.id, type: 'zone_opened', entityId: zoneId })),
  );

  await Promise.all(
    emails.map((email) => sendZoneOpenedEmail(email).catch((error: unknown) => {
      console.warn('[push] zone opened email failed', error);
    })),
  );
}

export async function enqueueExpiringStingPushes(now: Date = new Date()): Promise<void> {
  const from = new Date(now.getTime() + 29 * 60 * 1000);
  const to = new Date(now.getTime() + 31 * 60 * 1000);

  const stings = await Sting.find({
    expiresAt: { $gte: from, $lte: to },
    reactionsCount: { $gt: 0 },
    mediaPurgedAt: null,
  }).select('authorId');

  await Promise.all(
    stings.map((sting) =>
      enqueuePush({ userId: String(sting.authorId), type: 'sting_expiring', entityId: sting.id }),
    ),
  );
}

export async function flushPushQueue(now: Date = new Date()): Promise<void> {
  const pending = await PushQueue.find({ sentAt: null, sendAfter: { $lte: now } }).limit(200);
  if (pending.length === 0) {
    return;
  }

  const userIds = [...new Set(pending.map((item) => String(item.userId)))];
  const devices = await Device.find({ userId: { $in: userIds } });
  const devicesByUser = new Map<string, typeof devices>();
  for (const device of devices) {
    const key = String(device.userId);
    const list = devicesByUser.get(key) ?? [];
    list.push(device);
    devicesByUser.set(key, list);
  }

  const messages: Array<ExpoPushMessage & { _queueId: string; _deviceId: string; _userId: string }> = [];

  for (const item of pending) {
    const userDevices = devicesByUser.get(String(item.userId)) ?? [];
    for (const device of userDevices) {
      if (!Expo.isExpoPushToken(device.expoPushToken)) {
        continue;
      }
      messages.push({
        _queueId: item.id,
        _deviceId: device.id,
        _userId: String(device.userId),
        to: device.expoPushToken,
        title: item.title,
        body: item.body,
        sound: 'default',
        data: { type: item.type, deeplink: item.deeplink },
      });
    }
    item.sentAt = now;
    await item.save();
  }

  const chunks = expo.chunkPushNotifications(messages.map(({ _queueId, _deviceId, _userId, ...message }) => message));
  let offset = 0;
  for (const chunk of chunks) {
    const meta = messages.slice(offset, offset + chunk.length);
    offset += chunk.length;
    try {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);
      await Promise.all(
        tickets.map(async (ticket, index) => {
          const extra = meta[index];
          if (!extra) {
            return;
          }
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            await Device.deleteOne({ _id: extra._deviceId });
            return;
          }
          if (ticket.status === 'ok') {
            await PushTicket.create({
              ticketId: ticket.id,
              deviceId: extra._deviceId,
              userId: extra._userId,
            });
          }
        }),
      );
    } catch (error) {
      console.warn('[push] send failed', error);
    }
  }
}

export async function processPushReceipts(): Promise<void> {
  const tickets = await PushTicket.find().limit(500);
  if (tickets.length === 0) {
    return;
  }

  const chunks = expo.chunkPushNotificationReceiptIds(tickets.map((item) => item.ticketId));
  for (const chunk of chunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const [ticketId, receipt] of Object.entries(receipts)) {
        if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
          const ticket = tickets.find((item) => item.ticketId === ticketId);
          if (ticket) {
            await Device.deleteOne({ _id: ticket.deviceId });
          }
        }
      }
      await PushTicket.deleteMany({ ticketId: { $in: chunk } });
    } catch (error) {
      console.warn('[push] receipts failed', error);
    }
  }
}
