// Omi RSS Reader - Full Reader View JavaScript

const browser = chrome || browser;

// State management
const state = {
  currentView: 'feeds',
  selectedFeed: null,
  articles: [],
  feeds: [],
  searchQuery: '',
  viewMode: 'list' // list, card, compact
};

// DOM Elements
const elements = {
  navItems: document.querySelectorAll('.nav-item'),
  feedList: document.getElementById('feed-list'),
  articleList: document.getElementById('article-list'),
  readingPane: document.getElementById('reading-pane'),
  articleContent: document.getElementById('article-content'),
  currentViewTitle: document.getElementById('current-view-title'),
  articleCount: document.getElementById('article-count'),
  searchInput: document.getElementById('search-input'),
  refreshBtn: document.getElementById('refresh-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  viewModeBtn: document.getElementById('view-mode-btn'),
  addFeedBtn: document.getElementById('add-feed-btn'),
  backToList: document.getElementById('back-to-list'),
  saveArticle: document.getElementById('save-article'),
  shareArticle: document.getElementById('share-article'),
  openOriginal: document.getElementById('open-original'),
  braveIndicator: document.getElementById('brave-indicator')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkBraveAndConfigure();
  initializeEventListeners();
  await loadInitialData();
});

// Check if running in Brave
async function checkBraveAndConfigure() {
  const isBrave = await detectBrave();
  if (isBrave && elements.braveIndicator) {
    elements.braveIndicator.style.display = 'inline-block';
  }
}

// Detect Brave browser
async function detectBrave() {
  if (navigator.brave && await navigator.brave.isBrave()) {
    return true;
  }
  
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Brave')) {
    return true;
  }
  
  try {
    const isBraveByBehavior = window.chrome && 
                               window.chrome.runtime && 
                               navigator.brave !== undefined;
    return isBraveByBehavior;
  } catch (e) {
    return false;
  }
}

// Initialize event listeners
function initializeEventListeners() {
  // Navigation
  elements.navItems.forEach(item => {
    item.addEventListener('click', () => handleNavClick(item));
  });
  
  // Header actions
  elements.refreshBtn.addEventListener('click', handleRefresh);
  elements.settingsBtn.addEventListener('click', handleSettings);
  elements.viewModeBtn.addEventListener('click', handleViewModeToggle);
  elements.searchInput.addEventListener('input', handleSearch);
  
  // Feed actions
  elements.addFeedBtn.addEventListener('click', handleAddFeed);
  
  // Article actions
  elements.backToList.addEventListener('click', closeReadingPane);
  elements.saveArticle.addEventListener('click', handleSaveArticle);
  elements.shareArticle.addEventListener('click', handleShareArticle);
  elements.openOriginal.addEventListener('click', handleOpenOriginal);
}

// Navigation handling
function handleNavClick(item) {
  const view = item.dataset.view;
  
  // Update active state
  elements.navItems.forEach(nav => nav.classList.remove('active'));
  item.classList.add('active');
  
  // Update state and view
  state.currentView = view;
  updateView();
}

// View updates
function updateView() {
  switch (state.currentView) {
    case 'feeds':
      elements.currentViewTitle.textContent = 'All Articles';
      loadAllArticles();
      break;
    case 'unread':
      elements.currentViewTitle.textContent = 'Unread Articles';
      loadUnreadArticles();
      break;
    case 'saved':
      elements.currentViewTitle.textContent = 'Saved Articles';
      loadSavedArticles();
      break;
    case 'folders':
      elements.currentViewTitle.textContent = 'Folders';
      loadFolders();
      break;
  }
}

// Data loading
async function loadInitialData() {
  try {
    // Load feeds
    await loadFeeds();
    
    // Load articles
    await loadAllArticles();
    
  } catch (error) {
    console.error('Error loading initial data:', error);
  }
}

async function loadFeeds() {
  // Mock data for now
  const mockFeeds = [
    { id: 1, title: 'TechCrunch', icon: 'icons/icon-16.png', unreadCount: 5 },
    { id: 2, title: 'The Verge', icon: 'icons/icon-16.png', unreadCount: 3 },
    { id: 3, title: 'Ars Technica', icon: 'icons/icon-16.png', unreadCount: 8 },
    { id: 4, title: 'Wired', icon: 'icons/icon-16.png', unreadCount: 2 },
    { id: 5, title: 'Hacker News', icon: 'icons/icon-16.png', unreadCount: 15 }
  ];
  
  state.feeds = mockFeeds;
  renderFeeds();
}

function renderFeeds() {
  const feedsHtml = state.feeds.map(feed => `
    <div class="feed-item" data-feed-id="${feed.id}">
      <div class="feed-icon">
        <img src="${feed.icon}" alt="${feed.title}">
      </div>
      <div class="feed-info">
        <div class="feed-title">${feed.title}</div>
        ${feed.unreadCount > 0 ? `<div class="feed-count">${feed.unreadCount} unread</div>` : ''}
      </div>
    </div>
  `).join('');
  
  elements.feedList.innerHTML = `
    <h3 class="section-title">Subscriptions</h3>
    ${feedsHtml}
  `;
  
  // Add click handlers
  elements.feedList.querySelectorAll('.feed-item').forEach(item => {
    item.addEventListener('click', () => handleFeedClick(item.dataset.feedId));
  });
}

function handleFeedClick(feedId) {
  state.selectedFeed = feedId;
  
  // Update active state
  elements.feedList.querySelectorAll('.feed-item').forEach(item => {
    item.classList.toggle('active', item.dataset.feedId === feedId);
  });
  
  // Load feed articles
  loadFeedArticles(feedId);
}

async function loadAllArticles() {
  // Mock articles
  const mockArticles = [
    {
      id: 1,
      feedId: 1,
      title: 'Apple Announces Revolutionary M4 Chip with Breakthrough AI Capabilities',
      excerpt: 'Apple has unveiled its latest M4 processor, featuring unprecedented AI acceleration and power efficiency that promises to transform Mac computing...',
      source: 'TechCrunch',
      time: '5 minutes ago',
      unread: true,
      url: 'https://example.com/article1'
    },
    {
      id: 2,
      feedId: 2,
      title: 'The Future of Web Development: What\'s Coming in 2025',
      excerpt: 'As we approach 2025, the web development landscape is evolving rapidly with new frameworks, tools, and paradigms emerging...',
      source: 'The Verge',
      time: '1 hour ago',
      unread: true,
      url: 'https://example.com/article2'
    },
    {
      id: 3,
      feedId: 3,
      title: 'Understanding Quantum Computing: A Developer\'s Guide',
      excerpt: 'Quantum computing is no longer just theoretical. Here\'s what developers need to know about programming for quantum computers...',
      source: 'Ars Technica',
      time: '3 hours ago',
      unread: false,
      url: 'https://example.com/article3'
    }
  ];
  
  state.articles = mockArticles;
  renderArticles(mockArticles);
  updateArticleCount(mockArticles.length);
}

async function loadUnreadArticles() {
  const unreadArticles = state.articles.filter(a => a.unread);
  renderArticles(unreadArticles);
  updateArticleCount(unreadArticles.length);
}

async function loadSavedArticles() {
  // Load saved articles from storage
  const saved = await browser.storage.local.get('savedArticles');
  const savedArticles = saved.savedArticles || [];
  renderArticles(savedArticles);
  updateArticleCount(savedArticles.length);
}

async function loadFeedArticles(feedId) {
  const feedArticles = state.articles.filter(a => a.feedId == feedId);
  const feed = state.feeds.find(f => f.id == feedId);
  
  if (feed) {
    elements.currentViewTitle.textContent = feed.title;
  }
  
  renderArticles(feedArticles);
  updateArticleCount(feedArticles.length);
}

function renderArticles(articles) {
  if (articles.length === 0) {
    elements.articleList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width: 48px; height: 48px; margin: 0 auto 16px; display: block; opacity: 0.3;">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <p style="text-align: center; color: var(--text-secondary);">No articles to display</p>
      </div>
    `;
    return;
  }
  
  const articlesHtml = articles.map(article => `
    <div class="article-item ${article.unread ? 'unread' : ''}" data-article-id="${article.id}">
      <div class="article-meta">
        <span class="article-source">${article.source}</span>
        <span class="article-time">${article.time}</span>
      </div>
      <h3 class="article-title">${article.title}</h3>
      <p class="article-excerpt">${article.excerpt}</p>
    </div>
  `).join('');
  
  elements.articleList.innerHTML = articlesHtml;
  
  // Add click handlers
  elements.articleList.querySelectorAll('.article-item').forEach(item => {
    item.addEventListener('click', () => openArticle(item.dataset.articleId));
  });
}

function updateArticleCount(count) {
  elements.articleCount.textContent = `${count} article${count !== 1 ? 's' : ''}`;
}

// Article reading
function openArticle(articleId) {
  const article = state.articles.find(a => a.id == articleId);
  if (!article) return;
  
  // Mark as read
  article.unread = false;
  
  // Show reading pane
  elements.articleList.style.display = 'none';
  elements.readingPane.style.display = 'flex';
  
  // Render article content
  elements.articleContent.innerHTML = `
    <h1>${article.title}</h1>
    <div class="meta">
      <span class="article-source">${article.source}</span>
      <span class="article-time">${article.time}</span>
    </div>
    <div class="content">
      <p>${article.excerpt}</p>
      <p>This is where the full article content would be displayed. In a real implementation, this would be fetched from your RSS backend service.</p>
      <p>The article would include all the text, images, and formatting from the original source, presented in a clean, readable format.</p>
    </div>
  `;
  
  // Store current article for actions
  elements.articleContent.dataset.articleId = articleId;
  elements.articleContent.dataset.articleUrl = article.url;
}

function closeReadingPane() {
  elements.readingPane.style.display = 'none';
  elements.articleList.style.display = 'block';
  
  // Refresh article list to show read status
  updateView();
}

// Article actions
async function handleSaveArticle() {
  const articleId = elements.articleContent.dataset.articleId;
  const article = state.articles.find(a => a.id == articleId);
  
  if (article) {
    // Save to storage
    const saved = await browser.storage.local.get('savedArticles');
    const savedArticles = saved.savedArticles || [];
    
    if (!savedArticles.find(a => a.id === article.id)) {
      savedArticles.push({...article, savedAt: new Date().toISOString()});
      await browser.storage.local.set({ savedArticles });
      
      showNotification('Article saved', 'success');
    }
  }
}

async function handleShareArticle() {
  const articleUrl = elements.articleContent.dataset.articleUrl;
  
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Check out this article',
        url: articleUrl
      });
    } catch (err) {
      console.log('Share cancelled or failed', err);
    }
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(articleUrl);
    showNotification('Link copied to clipboard', 'success');
  }
}

async function handleOpenOriginal() {
  const articleUrl = elements.articleContent.dataset.articleUrl;
  
  await browser.tabs.create({
    url: articleUrl,
    active: true
  });
}

// Other handlers
async function handleRefresh() {
  elements.refreshBtn.classList.add('spinning');
  
  try {
    await loadFeeds();
    await updateView();
    showNotification('Feeds refreshed', 'success');
  } catch (error) {
    showNotification('Failed to refresh', 'error');
  } finally {
    setTimeout(() => {
      elements.refreshBtn.classList.remove('spinning');
    }, 1000);
  }
}

function handleSettings() {
  // Open settings in new tab or modal
  browser.tabs.create({
    url: browser.runtime.getURL('settings.html')
  });
}

function handleViewModeToggle() {
  // Toggle between list, card, and compact views
  const modes = ['list', 'card', 'compact'];
  const currentIndex = modes.indexOf(state.viewMode);
  state.viewMode = modes[(currentIndex + 1) % modes.length];
  
  elements.articleList.className = `article-list ${state.viewMode}-view`;
  showNotification(`Switched to ${state.viewMode} view`, 'info');
}

function handleSearch(e) {
  state.searchQuery = e.target.value.toLowerCase();
  
  if (state.searchQuery) {
    const filtered = state.articles.filter(article => 
      article.title.toLowerCase().includes(state.searchQuery) ||
      article.excerpt.toLowerCase().includes(state.searchQuery) ||
      article.source.toLowerCase().includes(state.searchQuery)
    );
    renderArticles(filtered);
    updateArticleCount(filtered.length);
  } else {
    updateView();
  }
}

async function handleAddFeed() {
  // Open add feed modal or page
  const feedUrl = prompt('Enter RSS feed URL:');
  if (feedUrl) {
    showNotification('Feed added successfully', 'success');
    await loadFeeds();
  }
}

function loadFolders() {
  elements.articleList.innerHTML = `
    <div class="folders-view">
      <h3>Organize your feeds into folders</h3>
      <p>This feature is coming soon!</p>
    </div>
  `;
  updateArticleCount(0);
}

// Notification system
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: var(--glass-white);
    backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 500;
    z-index: 1000;
    transition: all 0.3s ease;
    transform: translateY(100px);
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.transform = 'translateY(0)';
  }, 10);
  
  setTimeout(() => {
    notification.style.transform = 'translateY(100px)';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Add spinning animation style
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  .spinning svg {
    animation: spin 1s linear infinite;
  }
  
  .notification-success {
    border-color: #4CAF50 !important;
    background: rgba(76, 175, 80, 0.1) !important;
  }
  
  .notification-error {
    border-color: #F44336 !important;
    background: rgba(244, 67, 54, 0.1) !important;
  }
  
  .notification-info {
    border-color: var(--primary) !important;
    background: rgba(103, 58, 183, 0.1) !important;
  }
  
  .empty-state {
    padding: 60px 20px;
    text-align: center;
  }
  
  .folders-view {
    padding: 40px;
    text-align: center;
    color: var(--text-secondary);
  }
`;
document.head.appendChild(style);