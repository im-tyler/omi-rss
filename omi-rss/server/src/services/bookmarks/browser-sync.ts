import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Browser bookmark types
export interface BrowserBookmark {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  browser: 'chrome' | 'firefox' | 'edge' | 'safari' | 'other';
  folderId?: string;
  folderPath?: string;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  parentId?: string;
  path: string;
}

export interface SyncToken {
  token: string;
  userId: string;
  browserType: string;
  createdAt: Date;
  expiresAt: Date;
  permissions: string[];
}

// In-memory storage for demo (use database in production)
const syncTokens = new Map<string, SyncToken>();
const userBookmarks = new Map<string, BrowserBookmark[]>();
const syncHistory = new Map<string, SyncEvent[]>();

interface SyncEvent {
  id: string;
  userId: string;
  action: 'import' | 'export' | 'sync';
  browser: string;
  bookmarkCount: number;
  timestamp: Date;
  status: 'success' | 'partial' | 'failed';
  error?: string;
}

export class BrowserSyncService {
  // Generate sync token for browser extension
  generateSyncToken(userId: string, browserType: string): SyncToken {
    const token: SyncToken = {
      token: crypto.randomBytes(32).toString('hex'),
      userId,
      browserType,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      permissions: ['read', 'write', 'sync']
    };
    
    syncTokens.set(token.token, token);
    return token;
  }
  
  // Validate sync token
  validateToken(token: string): SyncToken | null {
    const syncToken = syncTokens.get(token);
    
    if (!syncToken) {
      return null;
    }
    
    if (syncToken.expiresAt < new Date()) {
      syncTokens.delete(token);
      return null;
    }
    
    return syncToken;
  }
  
  // Import bookmarks from browser
  async importBookmarks(
    userId: string,
    bookmarks: BrowserBookmark[],
    browser: string
  ): Promise<SyncEvent> {
    const event: SyncEvent = {
      id: uuidv4(),
      userId,
      action: 'import',
      browser,
      bookmarkCount: bookmarks.length,
      timestamp: new Date(),
      status: 'success'
    };
    
    try {
      // Get existing bookmarks
      const existingBookmarks = userBookmarks.get(userId) || [];
      
      // Merge bookmarks (avoid duplicates based on URL)
      const urlSet = new Set(existingBookmarks.map(b => b.url));
      const newBookmarks = bookmarks.filter(b => !urlSet.has(b.url));
      
      // Add browser info and timestamps
      const processedBookmarks = newBookmarks.map(bookmark => ({
        ...bookmark,
        id: bookmark.id || uuidv4(),
        browser: browser as BrowserBookmark['browser'],
        createdAt: bookmark.createdAt || new Date(),
        updatedAt: new Date()
      }));
      
      // Update storage
      userBookmarks.set(userId, [...existingBookmarks, ...processedBookmarks]);
      
      // Record sync event
      const history = syncHistory.get(userId) || [];
      history.push(event);
      syncHistory.set(userId, history);
      
      return event;
    } catch (error) {
      event.status = 'failed';
      event.error = error.message;
      return event;
    }
  }
  
  // Export bookmarks to browser
  async exportBookmarks(
    userId: string,
    browser: string,
    since?: Date
  ): Promise<{ bookmarks: BrowserBookmark[]; folders: BookmarkFolder[] }> {
    const allBookmarks = userBookmarks.get(userId) || [];
    
    // Filter bookmarks based on criteria
    let filteredBookmarks = allBookmarks;
    
    if (since) {
      filteredBookmarks = allBookmarks.filter(b => b.updatedAt > since);
    }
    
    // Group by folders
    const folders = this.extractFolders(filteredBookmarks);
    
    return {
      bookmarks: filteredBookmarks,
      folders
    };
  }
  
  // Two-way sync
  async syncBookmarks(
    userId: string,
    clientBookmarks: BrowserBookmark[],
    browser: string,
    lastSyncTime?: Date
  ): Promise<{
    toAdd: BrowserBookmark[];
    toUpdate: BrowserBookmark[];
    toDelete: string[];
    serverUpdated: number;
  }> {
    const serverBookmarks = userBookmarks.get(userId) || [];
    
    // Find changes
    const toAdd: BrowserBookmark[] = [];
    const toUpdate: BrowserBookmark[] = [];
    const toDelete: string[] = [];
    
    // Create maps for efficient lookup
    const serverMap = new Map(serverBookmarks.map(b => [b.url, b]));
    const clientMap = new Map(clientBookmarks.map(b => [b.url, b]));
    
    // Find bookmarks to add to client
    for (const [url, bookmark] of serverMap) {
      if (!clientMap.has(url)) {
        if (!lastSyncTime || bookmark.createdAt > lastSyncTime) {
          toAdd.push(bookmark);
        }
      }
    }
    
    // Find bookmarks to update on client
    for (const [url, clientBookmark] of clientMap) {
      const serverBookmark = serverMap.get(url);
      if (serverBookmark && serverBookmark.updatedAt > clientBookmark.updatedAt) {
        toUpdate.push(serverBookmark);
      }
    }
    
    // Find bookmarks to delete from client
    if (lastSyncTime) {
      const deletedUrls = this.getDeletedBookmarks(userId, lastSyncTime);
      toDelete.push(...deletedUrls);
    }
    
    // Update server with client changes
    let serverUpdated = 0;
    for (const [url, clientBookmark] of clientMap) {
      const serverBookmark = serverMap.get(url);
      
      if (!serverBookmark) {
        // Add new bookmark from client
        serverBookmarks.push({
          ...clientBookmark,
          id: clientBookmark.id || uuidv4(),
          browser: browser as BrowserBookmark['browser'],
          createdAt: clientBookmark.createdAt || new Date(),
          updatedAt: new Date()
        });
        serverUpdated++;
      } else if (clientBookmark.updatedAt > serverBookmark.updatedAt) {
        // Update existing bookmark
        Object.assign(serverBookmark, {
          ...clientBookmark,
          updatedAt: new Date()
        });
        serverUpdated++;
      }
    }
    
    // Save updated bookmarks
    if (serverUpdated > 0) {
      userBookmarks.set(userId, serverBookmarks);
    }
    
    // Record sync event
    const event: SyncEvent = {
      id: uuidv4(),
      userId,
      action: 'sync',
      browser,
      bookmarkCount: clientBookmarks.length,
      timestamp: new Date(),
      status: 'success'
    };
    
    const history = syncHistory.get(userId) || [];
    history.push(event);
    syncHistory.set(userId, history);
    
    return {
      toAdd,
      toUpdate,
      toDelete,
      serverUpdated
    };
  }
  
  // Get deleted bookmarks (simplified - in production, track deletions)
  private getDeletedBookmarks(userId: string, since: Date): string[] {
    // In production, maintain a deletion log
    return [];
  }
  
  // Extract folder structure from bookmarks
  private extractFolders(bookmarks: BrowserBookmark[]): BookmarkFolder[] {
    const folderMap = new Map<string, BookmarkFolder>();
    
    for (const bookmark of bookmarks) {
      if (bookmark.folderPath) {
        const parts = bookmark.folderPath.split('/');
        let currentPath = '';
        let parentId: string | undefined;
        
        for (const part of parts) {
          if (part) {
            currentPath += `/${part}`;
            
            if (!folderMap.has(currentPath)) {
              const folder: BookmarkFolder = {
                id: crypto.createHash('md5').update(currentPath).digest('hex'),
                name: part,
                parentId,
                path: currentPath
              };
              
              folderMap.set(currentPath, folder);
            }
            
            parentId = folderMap.get(currentPath)!.id;
          }
        }
      }
    }
    
    return Array.from(folderMap.values());
  }
  
  // Get sync history
  getSyncHistory(userId: string, limit = 10): SyncEvent[] {
    const history = syncHistory.get(userId) || [];
    return history.slice(-limit).reverse();
  }
  
  // Convert bookmarks to RSS feed items
  convertToFeedItems(bookmarks: BrowserBookmark[]): any[] {
    return bookmarks.map(bookmark => ({
      id: `bookmark_${bookmark.id}`,
      title: bookmark.title,
      url: bookmark.url,
      content: `<p>Bookmarked from ${bookmark.browser}</p>`,
      summary: `Bookmark: ${bookmark.title}`,
      publishedAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt,
      author: bookmark.browser,
      categories: bookmark.tags || [],
      metadata: {
        type: 'bookmark',
        browser: bookmark.browser,
        favicon: bookmark.favicon,
        folderPath: bookmark.folderPath
      }
    }));
  }
}

// Express route handlers
export const browserSyncRouter = (syncService: BrowserSyncService) => {
  const router = require('express').Router();
  
  // Generate sync token
  router.post('/token', async (req: Request, res: Response) => {
    try {
      const { userId, browser } = req.body;
      
      if (!userId || !browser) {
        return res.status(400).json({ error: 'userId and browser required' });
      }
      
      const token = syncService.generateSyncToken(userId, browser);
      res.json({ token: token.token, expiresAt: token.expiresAt });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Import bookmarks
  router.post('/import', async (req: Request, res: Response) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const syncToken = syncService.validateToken(token || '');
      
      if (!syncToken) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      
      const { bookmarks } = req.body;
      
      if (!Array.isArray(bookmarks)) {
        return res.status(400).json({ error: 'bookmarks array required' });
      }
      
      const event = await syncService.importBookmarks(
        syncToken.userId,
        bookmarks,
        syncToken.browserType
      );
      
      res.json({ event, imported: bookmarks.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Export bookmarks
  router.get('/export', async (req: Request, res: Response) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const syncToken = syncService.validateToken(token || '');
      
      if (!syncToken) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      
      const since = req.query.since ? new Date(req.query.since as string) : undefined;
      
      const result = await syncService.exportBookmarks(
        syncToken.userId,
        syncToken.browserType,
        since
      );
      
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Two-way sync
  router.post('/sync', async (req: Request, res: Response) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const syncToken = syncService.validateToken(token || '');
      
      if (!syncToken) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      
      const { bookmarks, lastSyncTime } = req.body;
      
      if (!Array.isArray(bookmarks)) {
        return res.status(400).json({ error: 'bookmarks array required' });
      }
      
      const result = await syncService.syncBookmarks(
        syncToken.userId,
        bookmarks,
        syncToken.browserType,
        lastSyncTime ? new Date(lastSyncTime) : undefined
      );
      
      res.json({
        ...result,
        syncTime: new Date()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get sync history
  router.get('/history', async (req: Request, res: Response) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      const syncToken = syncService.validateToken(token || '');
      
      if (!syncToken) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      
      const limit = parseInt(req.query.limit as string) || 10;
      const history = syncService.getSyncHistory(syncToken.userId, limit);
      
      res.json({ history });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  return router;
};