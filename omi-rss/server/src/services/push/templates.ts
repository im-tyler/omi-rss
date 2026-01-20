import { PushNotification } from './config';

export class NotificationTemplates {
  static newArticles(count: number, feedTitle?: string): PushNotification {
    return {
      title: feedTitle ? `New articles in ${feedTitle}` : 'New articles available',
      body: count === 1 
        ? 'You have 1 new article to read' 
        : `You have ${count} new articles to read`,
      data: {
        type: 'new_articles',
        count,
        feedTitle,
        action: 'open_feed',
      },
      icon: '/icon-192.png',
      badge: count,
      sound: true,
    };
  }

  static priceAlert(symbol: string, alertType: string, currentPrice: number): PushNotification {
    const alertMessages: Record<string, string> = {
      priceAbove: `Price went above your target`,
      priceBelow: `Price dropped below your target`,
      percentChangeUp: `Price increased significantly`,
      percentChangeDown: `Price decreased significantly`,
      volumeAbove: `Trading volume spike detected`,
    };

    return {
      title: `${symbol} Alert`,
      body: `${alertMessages[alertType] || 'Price alert triggered'} - Current: $${currentPrice.toFixed(2)}`,
      data: {
        type: 'price_alert',
        symbol,
        alertType,
        currentPrice,
        action: 'open_market',
      },
      icon: '/icon-192.png',
      sound: true,
      priority: 'high',
      requiresInteraction: true,
    };
  }

  static teamInvite(teamName: string, inviterName: string): PushNotification {
    return {
      title: 'Team Invitation',
      body: `${inviterName} invited you to join "${teamName}"`,
      data: {
        type: 'team_invite',
        teamName,
        inviterName,
        action: 'open_teams',
      },
      icon: '/icon-192.png',
      sound: true,
      actions: [
        {
          action: 'accept',
          title: 'Accept',
        },
        {
          action: 'decline',
          title: 'Decline',
        },
      ],
    };
  }

  static newComment(articleTitle: string, commenterName: string, isReply: boolean = false): PushNotification {
    return {
      title: isReply ? 'New reply to your comment' : 'New comment',
      body: `${commenterName} commented on "${articleTitle}"`,
      data: {
        type: 'new_comment',
        articleTitle,
        commenterName,
        isReply,
        action: 'open_article',
      },
      icon: '/icon-192.png',
      sound: true,
    };
  }

  static mention(articleTitle: string, mentionerName: string): PushNotification {
    return {
      title: 'You were mentioned',
      body: `${mentionerName} mentioned you in "${articleTitle}"`,
      data: {
        type: 'mention',
        articleTitle,
        mentionerName,
        action: 'open_article',
      },
      icon: '/icon-192.png',
      sound: true,
      priority: 'high',
    };
  }

  static sharedFolder(folderName: string, sharerName: string, teamName: string): PushNotification {
    return {
      title: 'Folder shared with team',
      body: `${sharerName} shared "${folderName}" with ${teamName}`,
      data: {
        type: 'shared_folder',
        folderName,
        sharerName,
        teamName,
        action: 'open_folder',
      },
      icon: '/icon-192.png',
      sound: true,
    };
  }

  static readingBuddy(articleTitle: string, readerName: string): PushNotification {
    return {
      title: 'Someone is reading with you',
      body: `${readerName} is also reading "${articleTitle}"`,
      data: {
        type: 'reading_buddy',
        articleTitle,
        readerName,
        action: 'open_article',
      },
      icon: '/icon-192.png',
      sound: false,
      ttl: 300, // 5 minutes
    };
  }

  static dailyDigest(stats: {
    articlesCount: number;
    readingTime: number;
    topCategory: string;
  }): PushNotification {
    return {
      title: 'Your daily reading digest',
      body: `${stats.articlesCount} new articles • ${Math.round(stats.readingTime / 60)} min read time • Top: ${stats.topCategory}`,
      data: {
        type: 'daily_digest',
        ...stats,
        action: 'open_stats',
      },
      icon: '/icon-192.png',
      image: '/digest-banner.png',
      sound: false,
      tag: 'daily-digest',
    };
  }

  static systemMaintenance(scheduledTime: Date, duration: number): PushNotification {
    return {
      title: 'Scheduled Maintenance',
      body: `System maintenance scheduled at ${scheduledTime.toLocaleTimeString()} for ${duration} minutes`,
      data: {
        type: 'system_maintenance',
        scheduledTime: scheduledTime.toISOString(),
        duration,
      },
      icon: '/icon-192.png',
      sound: false,
      tag: 'system',
    };
  }

  static newFeature(featureName: string, description: string): PushNotification {
    return {
      title: `New Feature: ${featureName}`,
      body: description,
      data: {
        type: 'new_feature',
        featureName,
        action: 'open_app',
      },
      icon: '/icon-192.png',
      image: '/feature-banner.png',
      sound: false,
      actions: [
        {
          action: 'try_now',
          title: 'Try Now',
        },
        {
          action: 'learn_more',
          title: 'Learn More',
        },
      ],
    };
  }

  static securityAlert(alertType: string, details: string): PushNotification {
    return {
      title: 'Security Alert',
      body: details,
      data: {
        type: 'security_alert',
        alertType,
        action: 'open_security',
      },
      icon: '/icon-192.png',
      sound: true,
      priority: 'high',
      requiresInteraction: true,
    };
  }
}

// Helper function to personalize notifications
export function personalizeNotification(
  template: PushNotification,
  userPreferences: any
): PushNotification {
  const personalized = { ...template };

  // Apply quiet hours
  if (userPreferences.quietHours?.enabled) {
    const now = new Date();
    const currentHour = now.getHours();
    const { start, end } = userPreferences.quietHours;
    
    const startHour = parseInt(start.split(':')[0]);
    const endHour = parseInt(end.split(':')[0]);

    const inQuietHours = startHour <= endHour
      ? currentHour >= startHour && currentHour < endHour
      : currentHour >= startHour || currentHour < endHour;

    if (inQuietHours) {
      personalized.sound = false;
      personalized.priority = 'normal';
      personalized.requiresInteraction = false;
    }
  }

  // Apply sound preferences
  if (userPreferences.sound === false) {
    personalized.sound = false;
  }

  // Apply vibration preferences
  if (userPreferences.vibrate === false && personalized.data) {
    personalized.data.vibrate = false;
  }

  return personalized;
}