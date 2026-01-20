// Background service worker for Omi RSS extension

// API endpoints
const API_BASE = 'http://localhost:8080/api'; // Will be configurable
const WS_URL = 'ws://localhost:8080/ws';

// Extension state
let authToken = null;
let wsConnection = null;
let syncEnabled = false;

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Omi RSS Extension installed:', details.reason);
  
  // Set up context menus
  chrome.contextMenus.create({
    id: 'save-article',
    title: 'Save to Omi RSS',
    contexts: ['page', 'selection', 'link']
  });
  
  chrome.contextMenus.create({
    id: 'generate-feed',
    title: 'Generate RSS feed from this site',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'save-selection',
    title: 'Save selection as note',
    contexts: ['selection']
  });
  
  // Initialize storage
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) {
    await chrome.storage.local.set({
      settings: {
        apiUrl: API_BASE,
        theme: 'dark',
        autoSave: false,
        readerMode: true,
        syncEnabled: false
      }
    });
  }
  
  // Load auth token
  const { auth } = await chrome.storage.local.get('auth');
  if (auth?.token) {
    authToken = auth.token;
    connectWebSocket();
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'save-article':
      await saveArticle(tab, info);
      break;
    case 'generate-feed':
      await generateFeed(tab);
      break;
    case 'save-selection':
      await saveSelection(info.selectionText, tab);
      break;
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'save-article':
      handleSaveArticle(request.data, sender.tab)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true; // Keep channel open for async response
      
    case 'get-article-content':
      extractArticleContent(sender.tab)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
      
    case 'check-feed':
      checkForFeed(sender.tab)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
      
    case 'login':
      handleLogin(request.credentials)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
      
    case 'logout':
      handleLogout()
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
      
    case 'get-feeds':
      getFeeds()
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
      
    case 'get-articles':
      getArticles(request.feedId, request.options)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
      
    case 'mark-read':
      markArticleRead(request.articleId)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
      
    case 'open-sidepanel':
      chrome.sidePanel.open({ windowId: sender.tab.windowId });
      sendResponse({ success: true });
      break;
      
    case 'update-settings':
      updateSettings(request.settings)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  switch (command) {
    case 'save-article':
      await saveArticle(tab);
      break;
    case 'toggle-reader':
      chrome.tabs.sendMessage(tab.id, { action: 'toggle-reader' });
      break;
  }
});

// Save article functionality
async function saveArticle(tab, info = {}) {
  try {
    // Show saving badge
    chrome.action.setBadgeText({ text: '...', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    
    // Extract article content
    const content = await extractArticleContent(tab);
    
    // Prepare article data
    const article = {
      url: info.linkUrl || tab.url,
      title: content.title || tab.title,
      content: content.content,
      excerpt: content.excerpt,
      author: content.author,
      publishedAt: content.publishedAt,
      imageUrl: content.imageUrl,
      savedFrom: 'browser_extension',
      tags: content.tags || []
    };
    
    // Save to backend
    const response = await fetch(`${API_BASE}/articles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(article)
    });
    
    if (!response.ok) {
      throw new Error('Failed to save article');
    }
    
    const saved = await response.json();
    
    // Show success notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon-128.png',
      title: 'Article Saved',
      message: saved.title,
      buttons: [
        { title: 'View' },
        { title: 'Add Tags' }
      ]
    });
    
    // Update badge
    chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId: tab.id });
    }, 2000);
    
    // Send to WebSocket if connected
    if (wsConnection?.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'article_saved',
        data: saved
      }));
    }
    
    return saved;
  } catch (error) {
    console.error('Error saving article:', error);
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId: tab.id });
    }, 2000);
    throw error;
  }
}

// Extract article content using content script
async function extractArticleContent(tab) {
  try {
    // First try to get content from content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'extract-content'
    });
    
    if (response?.content) {
      return response;
    }
  } catch (err) {
    // Content script might not be loaded
  }
  
  // Fallback: inject and run extraction script
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractArticleFromPage
  });
  
  return result.result;
}

// Article extraction function (runs in page context)
function extractArticleFromPage() {
  // Try to find article content using various selectors
  const articleSelectors = [
    'article',
    '[role="article"]',
    '.article-content',
    '.post-content',
    '.entry-content',
    '#content',
    'main'
  ];
  
  let articleElement = null;
  for (const selector of articleSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.length > 500) {
      articleElement = element;
      break;
    }
  }
  
  if (!articleElement) {
    articleElement = document.body;
  }
  
  // Extract metadata
  const getMetaContent = (name) => {
    const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return meta?.content || '';
  };
  
  // Clean content
  const clonedArticle = articleElement.cloneNode(true);
  
  // Remove unwanted elements
  const unwantedSelectors = [
    'script', 'style', 'nav', 'header', 'footer',
    '.advertisement', '.ads', '.social-share',
    '.comments', '.related-posts'
  ];
  
  unwantedSelectors.forEach(selector => {
    clonedArticle.querySelectorAll(selector).forEach(el => el.remove());
  });
  
  return {
    title: document.title || getMetaContent('og:title'),
    content: clonedArticle.innerHTML,
    excerpt: getMetaContent('description') || getMetaContent('og:description'),
    author: getMetaContent('author') || getMetaContent('article:author'),
    publishedAt: getMetaContent('article:published_time') || getMetaContent('datePublished'),
    imageUrl: getMetaContent('og:image') || document.querySelector('img')?.src,
    tags: getMetaContent('keywords')?.split(',').map(t => t.trim()).filter(Boolean) || []
  };
}

// Generate RSS feed from current site
async function generateFeed(tab) {
  try {
    chrome.action.setBadgeText({ text: '...', tabId: tab.id });
    
    // Get site info
    const url = new URL(tab.url);
    const siteUrl = url.origin;
    
    // Check if feed already exists
    const response = await fetch(`${API_BASE}/feeds/check?url=${encodeURIComponent(siteUrl)}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (response.ok) {
      const { exists, feed } = await response.json();
      if (exists) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '../icons/icon-128.png',
          title: 'Feed Already Exists',
          message: `${feed.title} is already in your feeds`
        });
        return;
      }
    }
    
    // Open feed generation in new tab
    const generatorUrl = chrome.runtime.getURL('generator.html') + `?url=${encodeURIComponent(tab.url)}`;
    chrome.tabs.create({ url: generatorUrl });
    
    chrome.action.setBadgeText({ text: '', tabId: tab.id });
  } catch (error) {
    console.error('Error generating feed:', error);
    chrome.action.setBadgeText({ text: '!', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
  }
}

// Save selected text as note
async function saveSelection(text, tab) {
  try {
    const note = {
      content: text,
      sourceUrl: tab.url,
      sourceTitle: tab.title,
      type: 'selection',
      createdAt: new Date().toISOString()
    };
    
    const response = await fetch(`${API_BASE}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(note)
    });
    
    if (!response.ok) {
      throw new Error('Failed to save note');
    }
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '../icons/icon-128.png',
      title: 'Selection Saved',
      message: text.substring(0, 100) + '...'
    });
  } catch (error) {
    console.error('Error saving selection:', error);
  }
}

// Check if current page has RSS/Atom feeds
async function checkForFeed(tab) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const feeds = [];
        
        // Check for feed links in head
        const feedLinks = document.querySelectorAll(
          'link[type="application/rss+xml"], link[type="application/atom+xml"]'
        );
        
        feedLinks.forEach(link => {
          feeds.push({
            url: link.href,
            title: link.title || 'RSS Feed',
            type: link.type
          });
        });
        
        // Check for common feed URLs
        const currentUrl = new URL(window.location.href);
        const commonPaths = ['/feed', '/rss', '/atom', '/feed.xml', '/rss.xml', '/atom.xml'];
        
        return {
          hasFeeds: feeds.length > 0,
          feeds,
          suggestions: commonPaths.map(path => currentUrl.origin + path)
        };
      }
    });
    
    return result.result;
  } catch (error) {
    console.error('Error checking for feeds:', error);
    return { hasFeeds: false, feeds: [], suggestions: [] };
  }
}

// WebSocket connection for real-time sync
function connectWebSocket() {
  if (!authToken || wsConnection?.readyState === WebSocket.OPEN) {
    return;
  }
  
  try {
    wsConnection = new WebSocket(`${WS_URL}?token=${authToken}`);
    
    wsConnection.onopen = () => {
      console.log('WebSocket connected');
      syncEnabled = true;
    };
    
    wsConnection.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };
    
    wsConnection.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    wsConnection.onclose = () => {
      console.log('WebSocket disconnected');
      syncEnabled = false;
      // Reconnect after 5 seconds
      setTimeout(connectWebSocket, 5000);
    };
  } catch (error) {
    console.error('Failed to connect WebSocket:', error);
  }
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
  switch (message.type) {
    case 'article_update':
      // Notify popup/sidepanel about article updates
      chrome.runtime.sendMessage({
        action: 'article-updated',
        data: message.data
      });
      break;
      
    case 'feed_update':
      // Update badge if new articles
      if (message.data.newCount > 0) {
        chrome.action.setBadgeText({ text: String(message.data.newCount) });
        chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
      }
      break;
      
    case 'sync_complete':
      // Refresh data in popup/sidepanel
      chrome.runtime.sendMessage({
        action: 'sync-complete',
        data: message.data
      });
      break;
  }
}

// Authentication handlers
async function handleLogin(credentials) {
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    });
    
    if (!response.ok) {
      throw new Error('Login failed');
    }
    
    const { token, user } = await response.json();
    
    // Save auth data
    await chrome.storage.local.set({
      auth: { token, user }
    });
    
    authToken = token;
    connectWebSocket();
    
    return { success: true, user };
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

async function handleLogout() {
  try {
    if (authToken) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
    }
    
    // Clear auth data
    await chrome.storage.local.remove('auth');
    authToken = null;
    
    // Close WebSocket
    if (wsConnection) {
      wsConnection.close();
      wsConnection = null;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

// API handlers
async function getFeeds() {
  const response = await fetch(`${API_BASE}/feeds`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch feeds');
  }
  
  return response.json();
}

async function getArticles(feedId, options = {}) {
  const params = new URLSearchParams({
    limit: options.limit || 20,
    offset: options.offset || 0,
    unread: options.unread || false
  });
  
  const url = feedId 
    ? `${API_BASE}/feeds/${feedId}/articles?${params}`
    : `${API_BASE}/articles?${params}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch articles');
  }
  
  return response.json();
}

async function markArticleRead(articleId) {
  const response = await fetch(`${API_BASE}/articles/${articleId}/read`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to mark article as read');
  }
  
  return response.json();
}

async function updateSettings(settings) {
  await chrome.storage.local.set({ settings });
  
  // Update API URL if changed
  if (settings.apiUrl && settings.apiUrl !== API_BASE) {
    API_BASE = settings.apiUrl;
    // Reconnect WebSocket with new URL
    if (wsConnection) {
      wsConnection.close();
      connectWebSocket();
    }
  }
  
  return { success: true };
}

// Handle extension icon click - toggle popup or sidepanel
chrome.action.onClicked.addListener(async (tab) => {
  const { settings } = await chrome.storage.local.get('settings');
  
  if (settings?.preferSidePanel) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
  // If not preferring sidepanel, the popup will open automatically
});