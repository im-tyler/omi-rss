// Import browser compatibility layer
importScripts('./browser-compat.js');

// Background service worker for Omi RSS extension (Cross-browser compatible)

// API endpoints
const API_BASE = 'http://localhost:8080/api'; // Will be configurable
const WS_URL = 'ws://localhost:8080/ws';

// Extension state
let authToken = null;
let wsConnection = null;
let syncEnabled = false;

// Get browser API
const browserAPI = BrowserCompat.getBrowser();

// Initialize extension
browserAPI.runtime.onInstalled.addListener(async (details) => {
  console.log('Omi RSS Extension installed:', details.reason);
  
  // Set up context menus
  browserAPI.contextMenus.create({
    id: 'save-article',
    title: 'Save to Omi RSS',
    contexts: ['page', 'selection', 'link']
  });
  
  browserAPI.contextMenus.create({
    id: 'generate-feed',
    title: 'Generate RSS feed from this site',
    contexts: ['page']
  });
  
  browserAPI.contextMenus.create({
    id: 'save-selection',
    title: 'Save selection as note',
    contexts: ['selection']
  });
  
  // Initialize storage
  const settings = await BrowserCompat.storage.get('settings');
  if (!settings.settings) {
    await BrowserCompat.storage.set({
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
  const auth = await BrowserCompat.storage.get('auth');
  if (auth?.auth?.token) {
    authToken = auth.auth.token;
    connectWebSocket();
  }
  
  // Initialize browser-specific features
  BrowserCompat.initialize();
});

// Handle context menu clicks
browserAPI.contextMenus.onClicked.addListener(async (info, tab) => {
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
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'save-article':
      handleSaveArticle(request.data, sender.tab)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
      
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
      // Use compatibility layer for sidepanel
      BrowserCompat.openSidePanel({ tabId: sender.tab.id })
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ error: err.message }));
      return true;
      
    case 'update-settings':
      updateSettings(request.settings)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
  }
});

// Handle keyboard shortcuts
browserAPI.commands.onCommand.addListener(async (command) => {
  const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
  
  switch (command) {
    case 'save-article':
      await saveArticle(tab);
      break;
    case 'toggle-reader':
      browserAPI.tabs.sendMessage(tab.id, { action: 'toggle-reader' });
      break;
    case 'open-sidepanel':
      await BrowserCompat.openSidePanel({ tabId: tab.id });
      break;
  }
});

// [Rest of the functions remain the same, just replace chrome with browserAPI]

// Save article functionality
async function saveArticle(tab, info = {}) {
  try {
    // Show saving badge
    browserAPI.action.setBadgeText({ text: '...', tabId: tab.id });
    browserAPI.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    
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
    browserAPI.notifications.create({
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
    browserAPI.action.setBadgeText({ text: '✓', tabId: tab.id });
    setTimeout(() => {
      browserAPI.action.setBadgeText({ text: '', tabId: tab.id });
    }, 2000);
    
    return saved;
  } catch (error) {
    console.error('Error saving article:', error);
    browserAPI.action.setBadgeText({ text: '!', tabId: tab.id });
    browserAPI.action.setBadgeBackgroundColor({ color: '#F44336' });
    setTimeout(() => {
      browserAPI.action.setBadgeText({ text: '', tabId: tab.id });
    }, 2000);
    throw error;
  }
}

// Extract article content using content script
async function extractArticleContent(tab) {
  try {
    // First try to get content from content script
    const response = await browserAPI.tabs.sendMessage(tab.id, {
      action: 'extract-content'
    });
    
    if (response?.content) {
      return response;
    }
  } catch (err) {
    // Content script might not be loaded
  }
  
  // Fallback: inject and run extraction script
  const [result] = await browserAPI.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractArticleFromPage
  });
  
  return result.result;
}

// Article extraction function (runs in page context)
function extractArticleFromPage() {
  // [Same implementation as before]
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
  
  const getMetaContent = (name) => {
    const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return meta?.content || '';
  };
  
  const clonedArticle = articleElement.cloneNode(true);
  
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