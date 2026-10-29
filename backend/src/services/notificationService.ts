/**
 * Notification Service
 *
 * Creates in-app notifications for the people who need to act on a change.
 * Every workflow transition calls into here so the bell in the toolbar always
 * reflects real records rather than a decorative red dot.
 */

import { prisma } from '../lib/prisma';
import logger from '../lib/logger';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from '@fdr-portal/shared/constants';

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Free-form payload the client uses to deep-link to the related record. */
  metadata?: Record<string, unknown>;
  channels?: string[];
}

export interface NotifyManyInput extends Omit<NotifyInput, 'userId'> {
  userIds: string[];
}

class NotificationService {
  /** Create one notification. Never throws: a failed notification must not
   *  roll back the workflow transition that triggered it. */
  async notify(input: NotifyInput): Promise<void> {
    try {
      await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          message: input.message,
          metadata: (input.metadata ?? {}) as any,
          channels: input.channels ?? [NOTIFICATION_CHANNELS.IN_APP],
        },
      });
    } catch (error) {
      logger.error({ err: error, userId: input.userId, type: input.type }, 'Failed to create notification');
    }
  }

  /** Create the same notification for several recipients. */
  async notifyMany(input: NotifyManyInput): Promise<void> {
    const recipients = [...new Set(input.userIds.filter(Boolean))];
    if (recipients.length === 0) return;

    try {
      await prisma.notification.createMany({
        data: recipients.map((userId) => ({
          userId,
          type: input.type,
          title: input.title,
          message: input.message,
          metadata: (input.metadata ?? {}) as any,
          channels: input.channels ?? [NOTIFICATION_CHANNELS.IN_APP],
        })),
      });
    } catch (error) {
      logger.error({ err: error, type: input.type }, 'Failed to create notifications');
    }
  }

  /**
   * Notify every active user holding one of the given roles. Used for
   * role-level events ("a bank verified an FDR", "an institution requested a
   * release") where there is no single named assignee.
   */
  async notifyRole(
    roles: string[],
    input: Omit<NotifyInput, 'userId'>
  ): Promise<void> {
    try {
      const users = await prisma.user.findMany({
        where: { role: { in: roles }, status: 'ACTIVE' },
        select: { id: true },
      });
      await this.notifyMany({ ...input, userIds: users.map((u) => u.id) });
    } catch (error) {
      logger.error({ err: error, roles }, 'Failed to notify roles');
    }
  }

  /** Notify the institution that owns a record plus the officer assigned to it. */
  async notifyStakeholders(
    fdrId: string,
    input: Omit<NotifyInput, 'userId'>
  ): Promise<void> {
    try {
      const fdr = await prisma.fDR.findUnique({
        where: { id: fdrId },
        select: {
          createdBy: true,
          verifiedBy: true,
          institution: { select: { nodalOfficerId: true } },
        },
      });
      if (!fdr) return;

      const ids = [
        fdr.createdBy,
        fdr.verifiedBy,
        fdr.institution?.nodalOfficerId,
      ].filter((id): id is string => Boolean(id));

      await this.notifyMany({ ...input, userIds: ids });
    } catch (error) {
      logger.error({ err: error, fdrId }, 'Failed to notify stakeholders');
    }
  }
}

export const notificationService = new NotificationService();
