export enum ContentType {
  NEWSLETTER = 'newsletter',
  PODCAST_SCRIPT = 'podcast_script',
  SOCIAL_MEDIA = 'social_media',
  THREAD = 'thread',
  NOTES = 'notes',
  SUMMARY = 'summary',
  REPORT = 'report',
  PRESENTATION = 'presentation',
}

export interface GenerationOptions {
  style?: string;
  tone?: string;
  format?: 'text' | 'markdown' | 'html' | 'json';
  maxLength?: number;
  language?: string;
  targetAudience?: string;
}

export interface GeneratedContent {
  type: ContentType;
  title: string;
  content: string;
  format: string;
  metadata: Record<string, any>;
  createdAt?: Date;
  tokens?: number;
  cost?: number;
}

export interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  type: ContentType;
  variables: TemplateVariable[];
  template: string;
  examples?: string[];
  category?: string;
  isPublic: boolean;
}

export interface TemplateVariable {
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  description: string;
  required: boolean;
  default?: any;
  options?: string[];
  validation?: any;
}

export interface ContentRequest {
  type: ContentType;
  options: GenerationOptions;
  data: Record<string, any>;
  templateId?: string;
  userId: string;
}

export interface ContentJob {
  id: string;
  userId: string;
  type: ContentType;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  request: ContentRequest;
  result?: GeneratedContent;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  retries: number;
}

export interface ExportOptions {
  format: 'pdf' | 'docx' | 'epub' | 'html' | 'markdown';
  styling?: {
    font?: string;
    fontSize?: number;
    lineHeight?: number;
    margins?: Record<string, number>;
    colors?: Record<string, string>;
  };
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
  };
  includeImages?: boolean;
  includeLinks?: boolean;
  watermark?: string;
}