export interface PushProvider {
  FCM: 'fcm';
  APNS: 'apns';
  WEB_PUSH: 'web_push';
  EXPO: 'expo';
}

export const PushProviders: PushProvider = {
  FCM: 'fcm',
  APNS: 'apns',
  WEB_PUSH: 'web_push',
  EXPO: 'expo',
};

export interface PushConfig {
  fcm?: {
    projectId: string;
    privateKey: string;
    clientEmail: string;
  };
  apns?: {
    keyId: string;
    teamId: string;
    privateKey: string;
    production: boolean;
  };
  webPush?: {
    publicKey: string;
    privateKey: string;
    email: string;
  };
  expo?: {
    accessToken: string;
  };
}

export interface PushToken {
  token: string;
  provider: keyof PushProvider;
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  appVersion?: string;
  osVersion?: string;
}

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string | boolean;
  icon?: string;
  image?: string;
  color?: string;
  tag?: string;
  requiresInteraction?: boolean;
  actions?: PushAction[];
  priority?: 'normal' | 'high';
  ttl?: number;
  collapseId?: string;
  mutableContent?: boolean;
  contentAvailable?: boolean;
  threadId?: string;
}

export interface PushAction {
  action: string;
  title: string;
  icon?: string;
  destructive?: boolean;
  authenticationRequired?: boolean;
  foreground?: boolean;
}

export interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
  canonicalToken?: string;
  invalidToken?: boolean;
}

export interface PushTopic {
  NEW_ARTICLES: 'new_articles';
  PRICE_ALERTS: 'price_alerts';
  TEAM_UPDATES: 'team_updates';
  COMMENTS: 'comments';
  SYSTEM: 'system';
}

export const PushTopics: PushTopic = {
  NEW_ARTICLES: 'new_articles',
  PRICE_ALERTS: 'price_alerts',
  TEAM_UPDATES: 'team_updates',
  COMMENTS: 'comments',
  SYSTEM: 'system',
};

export const DEFAULT_PUSH_SETTINGS = {
  newArticles: {
    enabled: true,
    frequency: 'instant', // instant, hourly, daily
    minPriority: 'normal', // low, normal, high
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '08:00',
    },
  },
  priceAlerts: {
    enabled: true,
    criticalOnly: false,
  },
  teamUpdates: {
    enabled: true,
    mentions: true,
    comments: true,
    sharedContent: true,
  },
  system: {
    enabled: true,
    maintenance: true,
    security: true,
    features: false,
  },
};

export function getPushConfig(): PushConfig {
  return {
    fcm: process.env.FCM_PROJECT_ID ? {
      projectId: process.env.FCM_PROJECT_ID,
      privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
      clientEmail: process.env.FCM_CLIENT_EMAIL || '',
    } : undefined,
    apns: process.env.APNS_KEY_ID ? {
      keyId: process.env.APNS_KEY_ID,
      teamId: process.env.APNS_TEAM_ID || '',
      privateKey: process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
      production: process.env.NODE_ENV === 'production',
    } : undefined,
    webPush: process.env.WEB_PUSH_PUBLIC_KEY ? {
      publicKey: process.env.WEB_PUSH_PUBLIC_KEY,
      privateKey: process.env.WEB_PUSH_PRIVATE_KEY || '',
      email: process.env.WEB_PUSH_EMAIL || 'mailto:admin@omirss.com',
    } : undefined,
    expo: process.env.EXPO_ACCESS_TOKEN ? {
      accessToken: process.env.EXPO_ACCESS_TOKEN,
    } : undefined,
  };
}