import Device, { DeviceLocale, DevicePlatform } from '../models/Device';
import User, { NotificationSettings } from '../models/User';
import { AppError } from '../utils/AppError';

export async function upsertDevice(input: {
  userId: string;
  expoPushToken: string;
  platform: DevicePlatform;
  deviceId: string;
  locale: DeviceLocale;
  timezone: string;
}): Promise<void> {
  await Device.findOneAndUpdate(
    { userId: input.userId, deviceId: input.deviceId },
    {
      $set: {
        expoPushToken: input.expoPushToken,
        platform: input.platform,
        locale: input.locale,
        timezone: input.timezone,
        lastSeenAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );
}

export async function deleteDevice(userId: string, deviceId: string): Promise<void> {
  await Device.deleteOne({ userId, deviceId });
}

export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  const user = await User.findById(userId).select('notificationSettings');
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }
  return user.notificationSettings;
}

export async function patchNotificationSettings(
  userId: string,
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  user.notificationSettings = {
    ...user.notificationSettings,
    ...patch,
  };
  user.markModified('notificationSettings');
  await user.save();
  return user.notificationSettings;
}

export async function patchPrivacySettings(
  userId: string,
  patch: { allowEcho?: boolean; allowSharing?: boolean },
): Promise<{ allowEcho: boolean; allowSharing: boolean }> {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }

  if (patch.allowEcho !== undefined) {
    user.settings.allowEcho = patch.allowEcho;
  }
  if (patch.allowSharing !== undefined) {
    user.settings.allowSharing = patch.allowSharing;
  }
  user.markModified('settings');
  await user.save();
  return user.settings;
}
