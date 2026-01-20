// Background service worker for RSS Glassmorphism Reader extension

// Extension state
let extensionState = {
  feeds: [],
  articles: [],
  bypassEnabled: false,
  aiEnabled: false,
};

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('RSS Glassmorphism Reader extension installed');
  
  // Create context menus
  createContextMenus();
  
  // Load saved state
  loadState();
  
  // Set up alarm for periodic feed updates
  chrome.alarms.create('updateFeeds', { periodInMinutes: 15 });
});

// Create context menu items
function createContextMenus() {
  chrome.contextMenus.create({
    id: 'saveArticle',
    title: 'Save to RSS Reader',
    contexts: ['page', 'link'],
  });
  
  chrome.contextMenus.create({
    id: 'findFeeds',
    title: 'Find RSS feeds on this page',
    contexts: ['page'],
  });
  
  chrome.contextMenus.create({
    id: 'analyzeArticle',
    title: 'Analyze with AI',
    contexts: ['page'],
  });
  
  chrome.contextMenus.create({
    id: 'bypassPaywall',
    title: 'Try to bypass paywall',
    contexts: ['page'],
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'saveArticle':
      saveArticleFromTab(tab, info.linkUrl);
      break;
    case 'findFeeds':
      findFeedsOnPage(tab);
      break;
    case 'analyzeArticle':
      analyzeArticle(tab);
      break;
    case 'bypassPaywall':
      attemptBypass(tab);
      break;
  }
});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getState':
      sendResponse(extensionState);
      break;
      
    case 'saveArticle':
      saveArticle(request.article);
      sendResponse({ success: true });
      break;
      
    case 'addFeed':
      addFeed(request.feed);
      sendResponse({ success: true });
      break;
      
    case 'getFeeds':
      sendResponse(extensionState.feeds);
      break;
      
    case 'getArticles':
      sendResponse(extensionState.articles);
      break;
      
    case 'enableBypass':
      extensionState.bypassEnabled = request.enabled;
      saveState();
      sendResponse({ success: true });
      break;
      
    case 'openReader':
      openReaderTab();
      sendResponse({ success: true });
      break;
      
    case 'detectFeeds':
      chrome.tabs.sendMessage(sender.tab.id, {
        action: 'detectFeeds'
      }, (feeds) => {
        sendResponse(feeds);
      });
      return true; // Keep channel open for async response
      
    case 'injectBypass':
      injectBypassScript(sender.tab);
      sendResponse({ success: true });
      break;
  }
});

// Save article from tab
async function saveArticleFromTab(tab, linkUrl) {
  const url = linkUrl || tab.url;
  
  // Extract article data
  const article = {
    id: Date.now().toString(),
    title: tab.title,
    url: url,
    source: new URL(url).hostname,
    savedAt: new Date().toISOString(),
    content: null, // Will be extracted by content script
  };
  
  // Send message to content script to extract content
  chrome.tabs.sendMessage(tab.id, {
    action: 'extractArticle'
  }, (response) => {
    if (response && response.content) {
      article.content = response.content;
      article.summary = response.summary;
      article.author = response.author;
      article.publishedDate = response.publishedDate;
    }
    
    saveArticle(article);
    
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Article Saved',
      message: `"${article.title}" has been saved to your RSS reader`,
    });
  });
}

// Save article
function saveArticle(article) {
  extensionState.articles.unshift(article);
  
  // Limit to 1000 articles
  if (extensionState.articles.length > 1000) {
    extensionState.articles = extensionState.articles.slice(0, 1000);
  }
  
  saveState();
  
  // Send to all open reader tabs
  chrome.runtime.sendMessage({
    action: 'articleAdded',
    article: article
  });
}

// Add feed
function addFeed(feed) {
  if (!extensionState.feeds.find(f => f.url === feed.url)) {
    extensionState.feeds.push({
      ...feed,
      id: Date.now().toString(),
      addedAt: new Date().toISOString(),
    });
    
    saveState();
    
    // Fetch initial articles
    fetchFeedArticles(feed.url);
  }
}

// Find feeds on page
function findFeedsOnPage(tab) {
  chrome.tabs.sendMessage(tab.id, {
    action: 'detectFeeds'
  }, (feeds) => {
    if (feeds && feeds.length > 0) {
      // Show notification with found feeds
      chrome.notifications.create({
        type: 'list',
        iconUrl: 'icons/icon-128.png',
        title: 'RSS Feeds Found',
        message: `Found ${feeds.length} feed(s) on this page`,
        items: feeds.map(f => ({ title: f.title || 'Untitled', message: f.url })),
        buttons: [{ title: 'Add All' }],
      }, (notificationId) => {
        // Store feeds for button handler
        chrome.storage.local.set({ [`notification_${notificationId}`]: feeds });
      });
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'No Feeds Found',
        message: 'No RSS feeds were detected on this page',
      });
    }
  });
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) {
    // Get stored feeds
    chrome.storage.local.get([`notification_${notificationId}`], (result) => {
      const feeds = result[`notification_${notificationId}`];
      if (feeds) {
        feeds.forEach(feed => addFeed(feed));
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: 'Feeds Added',
          message: `Added ${feeds.length} feed(s) to your reader`,
        });
        
        // Clean up
        chrome.storage.local.remove([`notification_${notificationId}`]);
      }
    });
  }
});

// Analyze article with AI
function analyzeArticle(tab) {
  // Send to content script for extraction
  chrome.tabs.sendMessage(tab.id, {
    action: 'extractForAnalysis'
  }, (article) => {
    if (article) {
      // Open reader with analysis view
      const encodedArticle = encodeURIComponent(JSON.stringify(article));
      chrome.tabs.create({
        url: `index.html#/analyze?article=${encodedArticle}`
      });
    }
  });
}

// Attempt paywall bypass
function attemptBypass(tab) {
  if (!extensionState.bypassEnabled) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Bypass Disabled',
      message: 'Enable paywall bypass in the extension settings',
    });
    return;
  }
  
  injectBypassScript(tab);
}

// Inject bypass script
function injectBypassScript(tab) {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['injected.js'],
    world: 'MAIN'
  }, () => {
    chrome.tabs.sendMessage(tab.id, {
      action: 'runBypass',
      url: tab.url
    });
  });
}

// Open reader tab
function openReaderTab() {
  chrome.tabs.create({
    url: 'index.html'
  });
}

// Periodic feed updates
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'updateFeeds') {
    updateAllFeeds();
  }
});

// Update all feeds
async function updateAllFeeds() {
  for (const feed of extensionState.feeds) {
    await fetchFeedArticles(feed.url);
  }
}

// Fetch feed articles
async function fetchFeedArticles(feedUrl) {
  try {
    const response = await fetch(feedUrl);
    const text = await response.text();
    
    // Parse RSS/Atom
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    
    const items = doc.querySelectorAll('item, entry');
    const articles = [];
    
    items.forEach((item, index) => {
      if (index >= 20) return; // Limit to 20 articles per feed
      
      const article = {
        id: `${feedUrl}_${Date.now()}_${index}`,
        title: item.querySelector('title')?.textContent || 'Untitled',
        url: item.querySelector('link')?.textContent || 
             item.querySelector('link')?.getAttribute('href') || '',
        content: item.querySelector('description, content')?.textContent || '',
        author: item.querySelector('author, creator')?.textContent || '',
        publishedDate: item.querySelector('pubDate, published')?.textContent || '',
        source: new URL(feedUrl).hostname,
        feedUrl: feedUrl,
      };
      
      // Check if article already exists
      if (!extensionState.articles.find(a => a.url === article.url)) {
        articles.push(article);
      }
    });
    
    if (articles.length > 0) {
      extensionState.articles.unshift(...articles);
      
      // Limit total articles
      if (extensionState.articles.length > 1000) {
        extensionState.articles = extensionState.articles.slice(0, 1000);
      }
      
      saveState();
      
      // Notify about new articles
      if (articles.length === 1) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: 'New Article',
          message: articles[0].title,
        });
      } else {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: 'New Articles',
          message: `${articles.length} new articles from ${new URL(feedUrl).hostname}`,
        });
      }
    }
  } catch (error) {
    console.error('Failed to fetch feed:', feedUrl, error);
  }
}

// Save state
function saveState() {
  chrome.storage.local.set({
    extensionState: extensionState
  });
}

// Load state
function loadState() {
  chrome.storage.local.get(['extensionState'], (result) => {
    if (result.extensionState) {
      extensionState = result.extensionState;
    }
  });
}

// Web request handling for bypass
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!extensionState.bypassEnabled) return;
    
    const headers = details.requestHeaders;
    
    // Modify headers for bypass
    const modifiedHeaders = headers.filter(h => 
      !['cookie', 'referer', 'x-forwarded-for'].includes(h.name.toLowerCase())
    );
    
    // Add bypass headers
    modifiedHeaders.push(
      { name: 'User-Agent', value: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
      { name: 'X-Forwarded-For', value: '66.249.66.1' },
      { name: 'Referer', value: 'https://www.google.com/' }
    );
    
    return { requestHeaders: modifiedHeaders };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'requestHeaders', 'extraHeaders']
);

// Handle extension icon click
chrome.action.onClicked.addListener(() => {
  openReaderTab();
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    saveArticle,
    addFeed,
    extensionState
  };
}