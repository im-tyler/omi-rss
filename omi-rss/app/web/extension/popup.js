// Popup script for RSS Glassmorphism Reader extension

let currentTab = 'current';
let extensionState = null;
let pageFeeds = [];

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Load extension state
  const response = await chrome.runtime.sendMessage({ action: 'getState' });
  extensionState = response;
  
  // Set up event listeners
  setupEventListeners();
  
  // Load initial content
  loadTabContent('current');
  
  // Detect feeds on current page
  detectPageFeeds(tab);
});

// Set up event listeners
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      switchTab(tabName);
    });
  });
  
  // Action buttons
  document.getElementById('refresh-btn').addEventListener('click', refresh);
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('open-reader-btn').addEventListener('click', openReader);
  
  // Quick actions
  document.getElementById('save-page').addEventListener('click', saveCurrentPage);
  document.getElementById('find-feeds').addEventListener('click', findFeeds);
  document.getElementById('ai-analyze').addEventListener('click', analyzeWithAI);
}

// Switch tabs
function switchTab(tabName) {
  // Update active tab
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  currentTab = tabName;
  loadTabContent(tabName);
}

// Load tab content
async function loadTabContent(tabName) {
  const content = document.getElementById('content');
  
  switch (tabName) {
    case 'current':
      await loadCurrentPageTab();
      break;
    case 'feeds':
      await loadFeedsTab();
      break;
    case 'saved':
      await loadSavedTab();
      break;
  }
}

// Load current page tab
async function loadCurrentPageTab() {
  const content = document.getElementById('content');
  
  if (pageFeeds.length > 0) {
    content.innerHTML = `
      <div class="section">
        <h3>RSS Feeds on this page</h3>
        ${pageFeeds.map(feed => `
          <div class="feed-item" data-url="${feed.url}">
            <div class="feed-title">${feed.title || 'Untitled Feed'}</div>
            <div class="feed-url">${feed.url}</div>
          </div>
        `).join('')}
      </div>
    `;
    
    // Add click handlers
    content.querySelectorAll('.feed-item').forEach(item => {
      item.addEventListener('click', () => {
        const feed = pageFeeds.find(f => f.url === item.dataset.url);
        addFeed(feed);
      });
    });
  } else {
    content.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.93 3.93C5.49 2.37 7.5 1.5 9.64 1.5s4.15.87 5.71 2.43l1.42-1.42C14.86.6 12.33-.36 9.64-.36S4.42.6 2.51 2.51l1.42 1.42zM6.36 6.36c.98-.98 2.28-1.47 3.57-1.47s2.59.49 3.57 1.47l1.42-1.42c-1.37-1.37-3.18-2.05-4.99-2.05S6.31 3.57 4.94 4.94l1.42 1.42zM8.79 8.79c.39-.39.91-.59 1.42-.59s1.03.2 1.42.59l1.42-1.42c-.78-.78-1.81-1.17-2.84-1.17s-2.06.39-2.84 1.17l1.42 1.42zM12 12c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/>
        </svg>
        <p>No RSS feeds detected on this page</p>
        <button class="button" onclick="findFeeds()">Search for feeds</button>
      </div>
    `;
  }
  
  // Add current page info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageInfo = document.createElement('div');
  pageInfo.className = 'page-info';
  pageInfo.innerHTML = `
    <div class="section" style="margin-top: 16px;">
      <h3>Current Page</h3>
      <div class="article-item">
        <div class="article-title">${tab.title}</div>
        <div class="article-meta">
          <span>${new URL(tab.url).hostname}</span>
        </div>
      </div>
    </div>
  `;
  content.appendChild(pageInfo);
}

// Load feeds tab
async function loadFeedsTab() {
  const content = document.getElementById('content');
  const feeds = await chrome.runtime.sendMessage({ action: 'getFeeds' });
  
  if (feeds.length > 0) {
    content.innerHTML = `
      <div class="section">
        <h3>Subscribed Feeds (${feeds.length})</h3>
        ${feeds.map(feed => `
          <div class="feed-item" data-id="${feed.id}">
            <div class="feed-title">${feed.title || 'Untitled Feed'}</div>
            <div class="feed-url">${feed.url}</div>
          </div>
        `).join('')}
      </div>
    `;
    
    // Add click handlers
    content.querySelectorAll('.feed-item').forEach(item => {
      item.addEventListener('click', () => {
        openReader(`#/feed/${item.dataset.id}`);
      });
    });
  } else {
    content.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
        </svg>
        <p>No feeds subscribed yet</p>
        <button class="button" onclick="findFeeds()">Find feeds to add</button>
      </div>
    `;
  }
}

// Load saved articles tab
async function loadSavedTab() {
  const content = document.getElementById('content');
  const articles = await chrome.runtime.sendMessage({ action: 'getArticles' });
  const savedArticles = articles.filter(a => a.savedAt);
  
  if (savedArticles.length > 0) {
    content.innerHTML = `
      <div class="section">
        <h3>Saved Articles (${savedArticles.length})</h3>
        ${savedArticles.slice(0, 10).map(article => `
          <div class="article-item" data-url="${article.url}">
            <div class="article-title">${article.title}</div>
            <div class="article-meta">
              <span>${article.source}</span>
              <span>${formatDate(article.savedAt)}</span>
            </div>
          </div>
        `).join('')}
        ${savedArticles.length > 10 ? `
          <button class="button" style="width: 100%; margin-top: 12px;" onclick="openReader('#/saved')">
            View all ${savedArticles.length} articles
          </button>
        ` : ''}
      </div>
    `;
    
    // Add click handlers
    content.querySelectorAll('.article-item').forEach(item => {
      item.addEventListener('click', () => {
        chrome.tabs.create({ url: item.dataset.url });
      });
    });
  } else {
    content.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
        </svg>
        <p>No saved articles yet</p>
        <p style="font-size: 12px; margin-top: 8px;">
          Right-click on any page and select "Save to RSS Reader"
        </p>
      </div>
    `;
  }
}

// Detect feeds on current page
async function detectPageFeeds(tab) {
  try {
    chrome.tabs.sendMessage(tab.id, { action: 'detectFeeds' }, (feeds) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to detect feeds:', chrome.runtime.lastError);
        return;
      }
      
      pageFeeds = feeds || [];
      if (currentTab === 'current') {
        loadCurrentPageTab();
      }
    });
  } catch (error) {
    console.error('Error detecting feeds:', error);
  }
}

// Add feed
async function addFeed(feed) {
  await chrome.runtime.sendMessage({ action: 'addFeed', feed });
  
  // Show notification
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #10B981;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = 'Feed added successfully!';
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 3000);
  
  // Refresh feeds tab if active
  if (currentTab === 'feeds') {
    loadFeedsTab();
  }
}

// Quick actions
async function saveCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({ 
    action: 'saveArticle',
    article: {
      title: tab.title,
      url: tab.url,
      source: new URL(tab.url).hostname,
    }
  });
  
  // Show notification
  showNotification('Article saved!');
}

async function findFeeds() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'detectFeeds' }, (feeds) => {
    if (feeds && feeds.length > 0) {
      pageFeeds = feeds;
      switchTab('current');
    } else {
      showNotification('No feeds found on this page', 'error');
    }
  });
}

async function analyzeWithAI() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({ action: 'analyzeArticle', tab });
}

// Helper functions
function refresh() {
  chrome.runtime.sendMessage({ action: 'updateFeeds' });
  showNotification('Refreshing feeds...');
}

function openSettings() {
  openReader('#/settings');
}

function openReader(hash = '') {
  chrome.runtime.sendMessage({ action: 'openReader' });
  if (hash) {
    // Add hash after a delay to ensure page loads
    setTimeout(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.update(tabs[0].id, { url: `index.html${hash}` });
      });
    }, 500);
  }
  window.close();
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'success' ? '#10B981' : '#EF4444'};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 3000);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// Add slide-in animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translate(-50%, -20px);
      opacity: 0;
    }
    to {
      transform: translate(-50%, 0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);