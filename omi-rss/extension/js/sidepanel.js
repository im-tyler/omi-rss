// Sidepanel script for Omi RSS Extension

// State management
const state = {
  currentView: 'all',
  feeds: [],
  articles: [],
  savedItems: [],
  isAuthenticated: false,
  user: null,
  selectedArticle: null,
  loading: false,
  searchQuery: ''
};

// DOM elements cache
const elements = {
  articleList: null,
  feedsList: null,
  readerContent: null,
  searchInput: null,
  loadingState: null,
  emptyState: null,
  articlesContainer: null
};

// Initialize sidepanel
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Omi RSS Sidepanel loaded');
  
  // Cache DOM elements
  cacheElements();
  
  // Initialize event listeners
  initializeEventListeners();
  
  // Check authentication
  await checkAuth();
  
  // Load initial data
  if (state.isAuthenticated) {
    await loadInitialData();
  } else {
    showLoginPrompt();
  }
});

// Cache DOM elements for performance
function cacheElements() {
  elements.articleList = document.getElementById('article-list');
  elements.feedsList = document.getElementById('feeds-list');
  elements.readerContent = document.getElementById('reader-content');
  elements.searchInput = document.getElementById('search');
  elements.loadingState = document.getElementById('loading');
  elements.emptyState = document.getElementById('empty');
  elements.articlesContainer = document.getElementById('articles-container');
  elements.articleReader = document.getElementById('article-reader');
}

// Initialize event listeners
function initializeEventListeners() {
  // Header actions
  document.getElementById('refresh-btn').addEventListener('click', handleRefresh);
  document.getElementById('settings-btn').addEventListener('click', handleSettings);
  
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', handleNavigation);
  });
  
  // Search
  elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
  
  // Save current page
  document.getElementById('save-page-btn').addEventListener('click', handleSaveCurrentPage);
  
  // Detect feeds
  document.getElementById('detect-feeds-btn').addEventListener('click', handleDetectFeeds);
  
  // Add feed
  document.getElementById('add-feed-btn').addEventListener('click', handleAddFeed);
  
  // Reader controls
  document.getElementById('close-reader').addEventListener('click', closeReader);
  document.getElementById('toggle-read').addEventListener('click', toggleReadStatus);
  document.getElementById('save-article').addEventListener('click', saveArticle);
  document.getElementById('open-external').addEventListener('click', openInBrowser);
  
  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleBackgroundMessage(message);
  });
}

// Check authentication status
async function checkAuth() {
  try {
    const { auth } = await chrome.storage.local.get('auth');
    if (auth?.token) {
      state.isAuthenticated = true;
      state.user = auth.user;
      return true;
    }
  } catch (error) {
    console.error('Auth check failed:', error);
  }
  return false;
}

// Load initial data
async function loadInitialData() {
  showLoading(true);
  
  try {
    await Promise.all([
      loadFeeds(),
      loadArticles()
    ]);
  } catch (error) {
    console.error('Failed to load initial data:', error);
    showError('Failed to load data. Please try refreshing.');
  } finally {
    showLoading(false);
  }
}

// Load feeds
async function loadFeeds() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'get-feeds' });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    state.feeds = response.feeds || [];
    renderFeeds();
    updateCounts();
  } catch (error) {
    console.error('Failed to load feeds:', error);
    state.feeds = [];
  }
}

// Load articles
async function loadArticles(feedId = null, offset = 0) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'get-articles',
      feedId,
      options: { 
        offset, 
        limit: 20,
        unread: state.currentView === 'unread'
      }
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    if (offset === 0) {
      state.articles = response.articles || [];
    } else {
      state.articles.push(...(response.articles || []));
    }
    
    renderArticles();
    return response.hasMore;
  } catch (error) {
    console.error('Failed to load articles:', error);
    state.articles = [];
    renderArticles();
    return false;
  }
}

// Render feeds list
function renderFeeds() {
  if (!elements.feedsList) return;
  
  elements.feedsList.innerHTML = state.feeds.map(feed => `
    <a href="#" class="nav-item feed-item" data-feed-id="${feed.id}">
      <div class="feed-icon">
        ${feed.favicon ? `<img src="${feed.favicon}" alt="">` : '📄'}
      </div>
      <span class="feed-title">${escapeHtml(feed.title)}</span>
      ${feed.unreadCount > 0 ? `<span class="count">${feed.unreadCount}</span>` : ''}
    </a>
  `).join('');
  
  // Add click handlers
  elements.feedsList.querySelectorAll('.feed-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const feedId = item.dataset.feedId;
      selectFeed(feedId);
    });
  });
}

// Render articles list
function renderArticles() {
  if (!elements.articlesContainer) return;
  
  if (state.articles.length === 0) {
    elements.loadingState.style.display = 'none';
    elements.emptyState.style.display = 'flex';
    elements.articlesContainer.innerHTML = '';
    return;
  }
  
  elements.loadingState.style.display = 'none';
  elements.emptyState.style.display = 'none';
  
  elements.articlesContainer.innerHTML = state.articles.map(article => `
    <article class="article-item ${article.isRead ? 'read' : 'unread'}" data-article-id="${article.id}">
      ${article.imageUrl ? `
        <div class="article-image">
          <img src="${article.imageUrl}" alt="" loading="lazy">
        </div>
      ` : ''}
      <div class="article-content">
        <h3 class="article-title">${escapeHtml(article.title)}</h3>
        <div class="article-meta">
          <span class="article-source">${escapeHtml(article.feed?.title || 'Unknown source')}</span>
          <span class="article-time">${formatTime(article.publishedAt)}</span>
        </div>
        ${article.excerpt ? `<p class="article-excerpt">${escapeHtml(article.excerpt)}</p>` : ''}
        <div class="article-actions">
          <button class="action-btn" data-action="toggle-read" title="${article.isRead ? 'Mark as unread' : 'Mark as read'}">
            ${article.isRead ? '○' : '●'}
          </button>
          <button class="action-btn" data-action="save" title="Save article">
            ${article.isSaved ? '★' : '☆'}
          </button>
          <button class="action-btn" data-action="share" title="Share">
            ↗
          </button>
        </div>
      </div>
    </article>
  `).join('');
  
  // Add click handlers
  elements.articlesContainer.querySelectorAll('.article-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('action-btn')) {
        const articleId = item.dataset.articleId;
        const article = state.articles.find(a => a.id === articleId);
        if (article) {
          openArticle(article);
        }
      }
    });
    
    // Handle action buttons
    item.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const articleId = item.dataset.articleId;
        handleArticleAction(action, articleId);
      });
    });
  });
}

// Open article in reader
function openArticle(article) {
  state.selectedArticle = article;
  
  // Show reader
  elements.articleList.style.display = 'none';
  elements.articleReader.style.display = 'block';
  
  // Render article content
  elements.readerContent.innerHTML = `
    <header class="reader-article-header">
      <h1>${escapeHtml(article.title)}</h1>
      <div class="reader-meta">
        <span>${escapeHtml(article.feed?.title || 'Unknown source')}</span>
        <span>•</span>
        <span>${formatTime(article.publishedAt)}</span>
        ${article.author ? `<span>• By ${escapeHtml(article.author)}</span>` : ''}
      </div>
    </header>
    ${article.imageUrl ? `
      <figure class="reader-image">
        <img src="${article.imageUrl}" alt="">
      </figure>
    ` : ''}
    <div class="reader-body">
      ${article.content || article.description || '<p>No content available</p>'}
    </div>
  `;
  
  // Mark as read if not already
  if (!article.isRead) {
    markArticleRead(article.id);
  }
  
  // Update UI
  updateReaderActions();
}

// Close reader
function closeReader() {
  elements.articleReader.style.display = 'none';
  elements.articleList.style.display = 'block';
  state.selectedArticle = null;
}

// Handle navigation
function handleNavigation(e) {
  e.preventDefault();
  const navItem = e.currentTarget;
  const view = navItem.dataset.view;
  
  if (view) {
    // Update active state
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    navItem.classList.add('active');
    
    // Update current view
    state.currentView = view;
    
    // Load appropriate content
    switch (view) {
      case 'all':
      case 'unread':
      case 'saved':
        loadArticles();
        break;
    }
  }
}

// Handle refresh
async function handleRefresh() {
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.classList.add('spinning');
  
  try {
    await Promise.all([
      loadFeeds(),
      loadArticles()
    ]);
    showNotification('Content refreshed');
  } catch (error) {
    showError('Failed to refresh content');
  } finally {
    setTimeout(() => {
      refreshBtn.classList.remove('spinning');
    }, 500);
  }
}

// Handle settings
function handleSettings() {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
}

// Handle search
function handleSearch() {
  const query = elements.searchInput.value.toLowerCase();
  state.searchQuery = query;
  
  if (!query) {
    renderArticles();
    return;
  }
  
  // Filter articles
  const filtered = state.articles.filter(article => 
    article.title.toLowerCase().includes(query) ||
    (article.excerpt && article.excerpt.toLowerCase().includes(query)) ||
    (article.feed?.title && article.feed.title.toLowerCase().includes(query))
  );
  
  // Render filtered results
  const temp = state.articles;
  state.articles = filtered;
  renderArticles();
  state.articles = temp;
}

// Handle save current page
async function handleSaveCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const response = await chrome.runtime.sendMessage({
      action: 'save-article',
      data: { url: tab.url, title: tab.title }
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    showNotification('Page saved successfully');
    
    // Refresh if viewing saved items
    if (state.currentView === 'saved') {
      await loadArticles();
    }
  } catch (error) {
    showError('Failed to save page');
  }
}

// Handle detect feeds
async function handleDetectFeeds() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const response = await chrome.runtime.sendMessage({
      action: 'check-feed'
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    if (response.hasFeeds || response.suggestions.length > 0) {
      showFeedSuggestions(response.feeds.concat(
        response.suggestions.map(url => ({ url, title: 'Possible feed' }))
      ));
    } else {
      showNotification('No feeds found on this page');
    }
  } catch (error) {
    showError('Failed to detect feeds');
  }
}

// Show feed suggestions
function showFeedSuggestions(feeds) {
  // Create modal or dropdown to show feed suggestions
  // For now, just show notification
  showNotification(`Found ${feeds.length} feed(s) on this page`);
}

// Handle add feed
function handleAddFeed() {
  // Open add feed dialog
  chrome.tabs.create({ url: chrome.runtime.getURL('add-feed.html') });
}

// Handle article actions
async function handleArticleAction(action, articleId) {
  const article = state.articles.find(a => a.id === articleId);
  if (!article) return;
  
  switch (action) {
    case 'toggle-read':
      await toggleArticleRead(articleId);
      break;
    case 'save':
      await toggleArticleSave(articleId);
      break;
    case 'share':
      await shareArticle(article);
      break;
  }
}

// Mark article as read
async function markArticleRead(articleId) {
  try {
    await chrome.runtime.sendMessage({
      action: 'mark-read',
      articleId
    });
    
    // Update local state
    const article = state.articles.find(a => a.id === articleId);
    if (article) {
      article.isRead = true;
      updateCounts();
    }
  } catch (error) {
    console.error('Failed to mark article as read:', error);
  }
}

// Toggle article read status
async function toggleArticleRead(articleId) {
  const article = state.articles.find(a => a.id === articleId);
  if (!article) return;
  
  article.isRead = !article.isRead;
  renderArticles();
  
  // Update on server
  await markArticleRead(articleId);
}

// Toggle article save status
async function toggleArticleSave(articleId) {
  const article = state.articles.find(a => a.id === articleId);
  if (!article) return;
  
  article.isSaved = !article.isSaved;
  renderArticles();
  
  showNotification(article.isSaved ? 'Article saved' : 'Article unsaved');
}

// Share article
async function shareArticle(article) {
  try {
    await navigator.clipboard.writeText(article.url);
    showNotification('Link copied to clipboard');
  } catch (error) {
    showError('Failed to copy link');
  }
}

// Toggle read status in reader
function toggleReadStatus() {
  if (state.selectedArticle) {
    toggleArticleRead(state.selectedArticle.id);
    updateReaderActions();
  }
}

// Save article from reader
function saveArticle() {
  if (state.selectedArticle) {
    toggleArticleSave(state.selectedArticle.id);
    updateReaderActions();
  }
}

// Open in browser
function openInBrowser() {
  if (state.selectedArticle) {
    chrome.tabs.create({ url: state.selectedArticle.url });
  }
}

// Update reader action buttons
function updateReaderActions() {
  if (!state.selectedArticle) return;
  
  const toggleReadBtn = document.getElementById('toggle-read');
  const saveBtn = document.getElementById('save-article');
  
  if (toggleReadBtn) {
    toggleReadBtn.innerHTML = state.selectedArticle.isRead ? 
      '<svg>...</svg>' : '<svg>...</svg>'; // Add appropriate SVG
  }
  
  if (saveBtn) {
    saveBtn.innerHTML = state.selectedArticle.isSaved ? 
      '<svg>...</svg>' : '<svg>...</svg>'; // Add appropriate SVG
  }
}

// Handle messages from background
function handleBackgroundMessage(message) {
  switch (message.action) {
    case 'article-updated':
      updateArticle(message.data);
      break;
    case 'feed-update':
      if (message.data.newCount > 0) {
        showNotification(`${message.data.newCount} new articles`);
        loadFeeds();
        loadArticles();
      }
      break;
    case 'sync-complete':
      loadFeeds();
      loadArticles();
      break;
  }
}

// Update article in state
function updateArticle(updatedArticle) {
  const index = state.articles.findIndex(a => a.id === updatedArticle.id);
  if (index !== -1) {
    state.articles[index] = { ...state.articles[index], ...updatedArticle };
    renderArticles();
  }
}

// Update counts
function updateCounts() {
  const allCount = state.articles.length;
  const unreadCount = state.articles.filter(a => !a.isRead).length;
  const savedCount = state.articles.filter(a => a.isSaved).length;
  
  document.getElementById('all-count').textContent = allCount;
  document.getElementById('unread-count').textContent = unreadCount;
  document.getElementById('saved-count').textContent = savedCount;
}

// Select feed
function selectFeed(feedId) {
  // Update UI
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-feed-id="${feedId}"]`)?.classList.add('active');
  
  // Load articles for feed
  loadArticles(feedId);
}

// Show loading state
function showLoading(show) {
  state.loading = show;
  if (elements.loadingState) {
    elements.loadingState.style.display = show ? 'flex' : 'none';
  }
}

// Show login prompt
function showLoginPrompt() {
  if (elements.articlesContainer) {
    elements.articlesContainer.innerHTML = `
      <div class="login-prompt">
        <h2>Not logged in</h2>
        <p>Please log in through the extension popup to access your feeds.</p>
        <button class="btn btn-primary" onclick="chrome.action.openPopup()">Open Popup</button>
      </div>
    `;
  }
}

// Show notification
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  
  // Remove after delay
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Show error
function showError(message) {
  showNotification(message, 'error');
}

// Utility: Escape HTML
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Utility: Format time
function formatTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else if (days < 7) {
    return `${days}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// Utility: Debounce
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Add CSS animation for spinning refresh button
const style = document.createElement('style');
style.textContent = `
  .spinning {
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  .notification {
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    border-radius: 4px;
    transform: translateY(100px);
    transition: transform 0.3s ease;
    z-index: 1000;
  }
  
  .notification.show {
    transform: translateY(0);
  }
  
  .notification-error {
    background: rgba(244, 67, 54, 0.9);
  }
  
  .login-prompt {
    text-align: center;
    padding: 40px;
    color: var(--text-secondary);
  }
  
  .login-prompt h2 {
    color: var(--text-primary);
    margin-bottom: 16px;
  }
  
  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    background: var(--primary);
    color: white;
    margin-top: 16px;
  }
  
  .btn:hover {
    background: var(--primary-dark);
  }
`;
document.head.appendChild(style);