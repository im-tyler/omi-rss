import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { feedService } from '../../../src/services/feed.service';
import { getDb } from '../../../src/database';
import { feeds, articles } from '../../../src/database/schema';
import Parser from 'rss-parser';

jest.mock('../../../src/database');
jest.mock('rss-parser');

describe('FeedService', () => {
  const mockDb = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockReturnThis(),
  };

  const mockParser = {
    parseURL: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getDb as jest.Mock).mockReturnValue(mockDb);
    (Parser as jest.Mock).mockImplementation(() => mockParser);
  });

  describe('createFeed', () => {
    it('should create a new feed successfully', async () => {
      const userId = 'user123';
      const feedUrl = 'https://example.com/feed.xml';
      const mockParsedFeed = {
        title: 'Example Feed',
        description: 'An example RSS feed',
        link: 'https://example.com',
        image: { url: 'https://example.com/icon.png' },
      };

      mockParser.parseURL.mockResolvedValue(mockParsedFeed);
      mockDb.limit.mockResolvedValueOnce([]); // No existing feed
      mockDb.returning.mockResolvedValueOnce([{
        id: 'feed123',
        userId,
        url: feedUrl,
        title: mockParsedFeed.title,
      }]);

      const result = await feedService.createFeed(userId, feedUrl);

      expect(result).toHaveProperty('id', 'feed123');
      expect(result).toHaveProperty('title', mockParsedFeed.title);
      expect(mockParser.parseURL).toHaveBeenCalledWith(feedUrl);
      expect(mockDb.insert).toHaveBeenCalledWith(feeds);
    });

    it('should throw error if feed already exists', async () => {
      const userId = 'user123';
      const feedUrl = 'https://example.com/existing.xml';

      mockDb.limit.mockResolvedValueOnce([{ id: 'existing123' }]);

      await expect(feedService.createFeed(userId, feedUrl)).rejects.toThrow('Feed already exists');
    });

    it('should throw error if feed URL is invalid', async () => {
      const userId = 'user123';
      const feedUrl = 'https://invalid.com/feed';

      mockParser.parseURL.mockRejectedValue(new Error('Invalid RSS feed'));

      await expect(feedService.createFeed(userId, feedUrl)).rejects.toThrow('Invalid RSS feed URL');
    });
  });

  describe('updateFeed', () => {
    it('should fetch and store new articles', async () => {
      const feedId = 'feed123';
      const mockFeed = {
        id: feedId,
        url: 'https://example.com/feed.xml',
        userId: 'user123',
      };

      const mockParsedFeed = {
        items: [
          {
            guid: 'article1',
            link: 'https://example.com/article1',
            title: 'Article 1',
            contentSnippet: 'Summary 1',
            content: 'Full content 1',
            creator: 'Author 1',
            pubDate: '2024-01-01',
            categories: ['Tech'],
          },
          {
            guid: 'article2',
            link: 'https://example.com/article2',
            title: 'Article 2',
            contentSnippet: 'Summary 2',
            content: 'Full content 2',
            creator: 'Author 2',
            pubDate: '2024-01-02',
            categories: ['News'],
          },
        ],
      };

      mockDb.limit.mockResolvedValueOnce([mockFeed]);
      mockParser.parseURL.mockResolvedValue(mockParsedFeed);
      mockDb.returning.mockResolvedValueOnce([
        { id: 'art1', guid: 'article1' },
        { id: 'art2', guid: 'article2' },
      ]);

      const result = await feedService.updateFeed(feedId);

      expect(result).toHaveProperty('newArticles', 2);
      expect(result).toHaveProperty('totalArticles', 2);
      expect(mockDb.insert).toHaveBeenCalledWith(articles);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            feedId,
            guid: 'article1',
            title: 'Article 1',
          }),
          expect.objectContaining({
            feedId,
            guid: 'article2',
            title: 'Article 2',
          }),
        ])
      );
    });

    it('should update lastFetchedAt on successful fetch', async () => {
      const feedId = 'feed123';
      const mockFeed = {
        id: feedId,
        url: 'https://example.com/feed.xml',
      };

      mockDb.limit.mockResolvedValueOnce([mockFeed]);
      mockParser.parseURL.mockResolvedValue({ items: [] });
      mockDb.returning.mockResolvedValueOnce([]);

      const mockUpdate = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
      };
      (getDb as jest.Mock).mockReturnValueOnce(mockUpdate);

      await feedService.updateFeed(feedId);

      expect(mockUpdate.update).toHaveBeenCalledWith(feeds);
      expect(mockUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lastFetchedAt: expect.any(Date),
          lastFetchError: null,
          errorCount: 0,
        })
      );
    });

    it('should handle fetch errors gracefully', async () => {
      const feedId = 'feed123';
      const mockFeed = {
        id: feedId,
        url: 'https://example.com/feed.xml',
        errorCount: 2,
      };

      mockDb.limit.mockResolvedValueOnce([mockFeed]);
      mockParser.parseURL.mockRejectedValue(new Error('Network error'));

      const mockUpdate = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
      };
      (getDb as jest.Mock).mockReturnValueOnce(mockUpdate);

      await expect(feedService.updateFeed(feedId)).rejects.toThrow('Failed to fetch feed');

      expect(mockUpdate.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lastFetchError: expect.stringContaining('Network error'),
          errorCount: 3,
        })
      );
    });
  });

  describe('getUserFeeds', () => {
    it('should return user feeds with article counts', async () => {
      const userId = 'user123';
      const mockFeeds = [
        {
          id: 'feed1',
          title: 'Feed 1',
          unreadCount: '5',
          totalCount: '10',
        },
        {
          id: 'feed2',
          title: 'Feed 2',
          unreadCount: '0',
          totalCount: '20',
        },
      ];

      mockDb.orderBy.mockResolvedValueOnce(mockFeeds);

      const result = await feedService.getUserFeeds(userId);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('unreadCount', 5);
      expect(result[1]).toHaveProperty('unreadCount', 0);
      expect(mockDb.where).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('deleteFeed', () => {
    it('should delete feed owned by user', async () => {
      const feedId = 'feed123';
      const userId = 'user123';
      const mockFeed = { id: feedId, userId };

      mockDb.limit.mockResolvedValueOnce([mockFeed]);

      await feedService.deleteFeed(feedId, userId);

      expect(mockDb.delete).toHaveBeenCalledWith(feeds);
      expect(mockDb.where).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should throw error if feed not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(feedService.deleteFeed('nonexistent', 'user123')).rejects.toThrow('Feed not found');
    });

    it('should throw error if user does not own feed', async () => {
      const mockFeed = { id: 'feed123', userId: 'otheruser' };
      mockDb.limit.mockResolvedValueOnce([mockFeed]);

      await expect(feedService.deleteFeed('feed123', 'user123')).rejects.toThrow('Feed not found');
    });
  });
});