// Omi RSS Extension - Redesigned Popup JavaScript

// Browser compatibility helper
const browser = chrome || browser;

// DOM Elements
let elements = {};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  initializeElements();
  attachEventListeners();
  await loadInitialData();
  await checkBraveAndConfigure();
});

// Initialize DOM element references
function initializeElements() {
  elements = {
    // Views
    mainView: document.getElementById('main-view'),
    settingsView: document.getElementById('settings-view'),
    loadingView: document.getElementById('loading-view'),
    
    // Header buttons
    refreshBtn: document.getElementById('refresh-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    backBtn: document.getElementById('back-btn'),
    
    // Action buttons
    popoutBtn: document.getElementById('popout-btn'),
    webBtn: document.getElementById('web-btn'),
    sidebarBtn: document.getElementById('sidebar-btn'),
    
    // Tab navigation
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // Quick actions
    savePageBtn: document.getElementById('save-page-btn'),
    findFeedsBtn: document.getElementById('find-feeds-btn'),
    
    // Lists
    feedList: document.getElementById('feed-list'),
    articleList: document.getElementById('article-list'),
    
    // Search
    searchInput: document.querySelector('.search-input'),
    
    // Settings
    toggles: document.querySelectorAll('.toggle-switch input'),
  };
}

// Attach event listeners
function attachEventListeners() {
  // Header actions
  elements.refreshBtn.addEventListener('click', handleRefresh);
  elements.settingsBtn.addEventListener('click', showSettings);
  elements.backBtn?.addEventListener('click', showMain);
  
  // Main action buttons
  elements.popoutBtn.addEventListener('click', handlePopOut);
  elements.webBtn.addEventListener('click', handleWebVersion);
  elements.sidebarBtn.addEventListener('click', handleSidebar);
  
  // Tab navigation
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => handleTabSwitch(e.currentTarget));
  });
  
  // Quick actions
  elements.savePageBtn.addEventListener('click', handleSavePage);
  elements.findFeedsBtn.addEventListener('click', handleFindFeeds);
  
  // Search
  elements.searchInput?.addEventListener('input', handleSearch);
  
  // Settings toggles
  elements.toggles.forEach(toggle => {
    toggle.addEventListener('change', handleSettingToggle);
  });
}

// Action button handlers
async function handlePopOut() {
  console.log('Pop out clicked');
  
  // Get current window dimensions
  const currentWindow = await browser.windows.getCurrent();
  
  // Create new window with extension
  const popoutWindow = await browser.windows.create({
    url: browser.runtime.getURL('popup-redesigned.html'),
    type: 'popup',
    width: 800,
    height: 600,
    left: Math.round(currentWindow.left + (currentWindow.width - 800) / 2),
    top: Math.round(currentWindow.top + (currentWindow.height - 600) / 2)
  });
  
  // Close the popup
  window.close();
}

async function handleWebVersion() {
  console.log('Web version clicked');
  
  // Open full web version in new tab
  await browser.tabs.create({
    url: 'http://localhost:3000',
    active: true
  });
  
  // Close the popup
  window.close();
}

async function handleSidebar() {
  console.log('Sidebar clicked');
  
  // Check user preference first
  const settings = await browser.storage.local.get('settings');
  const forceWindowMode = settings.settings?.['Use window instead of sidebar'] || false;
  
  // Detect if running in Brave
  const isBrave = await detectBrave();
  
  // For Brave or if user prefers window mode, always use popup window
  if (isBrave || forceWindowMode) {
    console.log(isBrave ? 'Brave detected - using popup window' : 'Window mode preferred');
    await openSidebarAsWindow();
    return;
  }
  
  // Check if browser supports sidebar API
  if (browser.sidePanel && !isBrave) {
    try {
      // Check if we can actually use sidePanel
      const canUseSidePanel = await checkSidePanelAvailability();
      
      if (canUseSidePanel) {
        // Open sidebar (Chrome only, not Brave)
        await browser.sidePanel.open({ windowId: (await browser.windows.getCurrent()).id });
        window.close();
      } else {
        // Fallback to window
        await openSidebarAsWindow();
      }
    } catch (error) {
      console.error('Error opening sidebar:', error);
      // Fallback to popup window
      await openSidebarAsWindow();
    }
  } else {
    // Firefox/Brave fallback - open in sidebar-like window
    await openSidebarAsWindow();
  }
}

// Detect Brave browser
async function detectBrave() {
  // Method 1: Check navigator.brave
  if (navigator.brave && await navigator.brave.isBrave()) {
    return true;
  }
  
  // Method 2: Check user agent for Brave
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Brave')) {
    return true;
  }
  
  // Method 3: Check for Brave-specific features
  try {
    // Brave has specific behavior with certain APIs
    const isBraveByBehavior = window.chrome && 
                               window.chrome.runtime && 
                               navigator.brave !== undefined;
    return isBraveByBehavior;
  } catch (e) {
    return false;
  }
}

// Check if sidePanel is actually available and not blocked
async function checkSidePanelAvailability() {
  try {
    // Try to get sidePanel options to verify it's available
    if (browser.sidePanel && browser.sidePanel.getOptions) {
      await browser.sidePanel.getOptions({});
      return true;
    }
  } catch (error) {
    console.log('SidePanel not available:', error);
    return false;
  }
  return false;
}

// Open sidebar as a window
async function openSidebarAsWindow() {
  const currentWindow = await browser.windows.getCurrent();
  
  // Calculate position for sidebar-like window
  const sidebarWidth = 420;
  const leftPosition = currentWindow.left + currentWindow.width - sidebarWidth - 20;
  
  await browser.windows.create({
    url: browser.runtime.getURL('sidepanel.html'),
    type: 'popup',
    width: sidebarWidth,
    height: currentWindow.height - 100,
    left: Math.max(0, leftPosition),
    top: currentWindow.top + 50,
    focused: true
  });
  
  window.close();
}

// Tab switching
function handleTabSwitch(clickedTab) {
  const tabName = clickedTab.dataset.tab;
  
  // Update active states
  elements.tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  elements.tabContents.forEach(content => {
    content.style.display = content.id === `${tabName}-tab` ? 'block' : 'none';
  });
  
  // Store active tab
  browser.storage.local.set({ activeTab: tabName });
}

// Quick action handlers
async function handleSavePage() {
  console.log('Save page clicked');
  
  try {
    // Get current tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    
    // Save to storage
    const savedPages = (await browser.storage.local.get('savedPages')).savedPages || [];
    savedPages.unshift({
      id: Date.now(),
      title: tab.title,
      url: tab.url,
      favicon: tab.favIconUrl,
      savedAt: new Date().toISOString()
    });
    
    await browser.storage.local.set({ savedPages: savedPages.slice(0, 100) }); // Keep last 100
    
    // Show success notification
    showNotification('Page saved successfully', 'success');
    
    // Switch to saved tab
    handleTabSwitch(document.querySelector('[data-tab="saved"]'));
    
  } catch (error) {
    console.error('Error saving page:', error);
    showNotification('Failed to save page', 'error');
  }
}

async function handleFindFeeds() {
  console.log('Find feeds clicked');
  
  try {
    // Get current tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    
    // Execute feed detection script
    const feeds = await browser.tabs.executeScript(tab.id, {
      file: 'js/feed-detector.js'
    });
    
    if (feeds && feeds[0] && feeds[0].length > 0) {
      showFeedDetectionResults(feeds[0]);
    } else {
      showNotification('No RSS feeds found on this page', 'info');
    }
    
  } catch (error) {
    console.error('Error detecting feeds:', error);
    showNotification('Failed to detect feeds', 'error');
  }
}

// Other handlers
async function handleRefresh() {
  console.log('Refresh clicked');
  
  // Add spinning animation
  elements.refreshBtn.classList.add('spinning');
  
  try {
    // Refresh feed data
    await loadFeedData();
    showNotification('Feeds refreshed', 'success');
  } catch (error) {
    console.error('Error refreshing:', error);
    showNotification('Failed to refresh feeds', 'error');
  } finally {
    setTimeout(() => {
      elements.refreshBtn.classList.remove('spinning');
    }, 1000);
  }
}

function showSettings() {
  elements.mainView.style.display = 'none';
  elements.settingsView.style.display = 'block';
}

function showMain() {
  elements.settingsView.style.display = 'none';
  elements.mainView.style.display = 'block';
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase();
  
  // Filter feeds
  const feedItems = elements.feedList.querySelectorAll('.feed-item');
  feedItems.forEach(item => {
    const title = item.querySelector('.feed-title').textContent.toLowerCase();
    item.style.display = title.includes(query) ? 'flex' : 'none';
  });
}

function handleSettingToggle(e) {
  const setting = e.target.closest('.setting-item').querySelector('.setting-label').textContent;
  const value = e.target.checked;
  
  console.log(`Setting changed: ${setting} = ${value}`);
  
  // Save setting
  browser.storage.local.get('settings', (data) => {
    const settings = data.settings || {};
    settings[setting] = value;
    browser.storage.local.set({ settings });
  });
}

// Data loading
async function loadInitialData() {
  try {
    // Show loading state briefly
    elements.loadingView.style.display = 'flex';
    elements.mainView.style.display = 'none';
    
    // Load saved data
    const data = await browser.storage.local.get(['feeds', 'articles', 'savedPages', 'activeTab', 'settings']);
    
    // Restore active tab
    if (data.activeTab) {
      const tabBtn = document.querySelector(`[data-tab="${data.activeTab}"]`);
      if (tabBtn) handleTabSwitch(tabBtn);
    }
    
    // Restore settings
    if (data.settings) {
      Object.entries(data.settings).forEach(([key, value]) => {
        const toggle = Array.from(elements.toggles).find(t => 
          t.closest('.setting-item').querySelector('.setting-label').textContent === key
        );
        if (toggle) toggle.checked = value;
      });
    }
    
    // Load feed data
    await loadFeedData();
    
    // Show main view
    setTimeout(() => {
      elements.loadingView.style.display = 'none';
      elements.mainView.style.display = 'block';
    }, 300);
    
  } catch (error) {
    console.error('Error loading initial data:', error);
    elements.loadingView.style.display = 'none';
    elements.mainView.style.display = 'block';
  }
}

async function loadFeedData() {
  // Simulate loading feed data
  // In real implementation, this would fetch from your server
  const mockFeeds = [
    { id: 1, title: 'TechCrunch', unreadCount: 12, lastUpdate: '5 min ago' },
    { id: 2, title: 'The Verge', unreadCount: 8, lastUpdate: '1 hour ago' },
    { id: 3, title: 'Ars Technica', unreadCount: 5, lastUpdate: '2 hours ago' },
  ];
  
  renderFeeds(mockFeeds);
}

function renderFeeds(feeds) {
  elements.feedList.innerHTML = feeds.map(feed => `
    <div class="feed-item" data-feed-id="${feed.id}">
      <div class="feed-icon">
        <img src="icons/icon-16.png" alt="">
      </div>
      <div class="feed-info">
        <div class="feed-title">${feed.title}</div>
        <div class="feed-meta">
          <span>Updated ${feed.lastUpdate}</span>
        </div>
      </div>
      ${feed.unreadCount > 0 ? `<div class="feed-count">${feed.unreadCount}</div>` : ''}
    </div>
  `).join('');
  
  // Add click handlers
  elements.feedList.querySelectorAll('.feed-item').forEach(item => {
    item.addEventListener('click', () => handleFeedClick(item.dataset.feedId));
  });
}

function handleFeedClick(feedId) {
  console.log('Feed clicked:', feedId);
  // Switch to articles tab and filter by feed
  handleTabSwitch(document.querySelector('[data-tab="articles"]'));
}

// Notification system
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => notification.classList.add('show'), 10);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Feed detection results
function showFeedDetectionResults(feeds) {
  const modal = document.createElement('div');
  modal.className = 'feed-detection-modal';
  modal.innerHTML = `
    <div class="modal-overlay" onclick="this.parentElement.remove()"></div>
    <div class="modal-content">
      <h3>RSS Feeds Found</h3>
      <div class="detected-feeds">
        ${feeds.map(feed => `
          <div class="detected-feed">
            <div class="feed-url">${feed.url}</div>
            <button class="action-btn primary" onclick="subscribeFeed('${feed.url}')">
              Subscribe
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// Global function for subscribing to feeds
window.subscribeFeed = async function(url) {
  console.log('Subscribing to feed:', url);
  showNotification('Feed added successfully', 'success');
  document.querySelector('.feed-detection-modal')?.remove();
};

// Check if running in Brave and configure accordingly
async function checkBraveAndConfigure() {
  const isBrave = await detectBrave();
  
  if (isBrave) {
    // For Brave users, we'll keep the same UI but show a one-time info message
    const settings = await browser.storage.local.get('settings');
    if (!settings.settings?.['Brave info shown']) {
      const updatedSettings = settings.settings || {};
      updatedSettings['Brave info shown'] = true;
      await browser.storage.local.set({ settings: updatedSettings });
      
      // Show info notification about Brave's sidebar
      showNotification('Note: Brave\'s built-in sidebar may appear with the extension sidebar', 'info');
    }
  }
}

// Add spinning animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  .spinning svg {
    animation: spin 1s linear infinite;
  }
  
  .notification {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(100px);
    padding: 12px 20px;
    background: var(--glass-white);
    backdrop-filter: blur(12px);
    border: 1px solid var(--glass-border);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 500;
    transition: transform 0.3s ease;
    z-index: 1000;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }
  
  .notification.show {
    transform: translateX(-50%) translateY(0);
  }
  
  .notification-success {
    border-color: #4CAF50;
    background: rgba(76, 175, 80, 0.1);
  }
  
  .notification-error {
    border-color: #F44336;
    background: rgba(244, 67, 54, 0.1);
  }
  
  .notification-info {
    border-color: var(--primary);
    background: rgba(103, 58, 183, 0.1);
  }
  
  .feed-detection-modal {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease;
  }
  
  .modal-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
  }
  
  .modal-content {
    position: relative;
    background: var(--bg-surface);
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    padding: 24px;
    max-width: 90%;
    width: 340px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  
  .modal-content h3 {
    margin-bottom: 16px;
    color: var(--text-primary);
    font-size: 16px;
  }
  
  .detected-feeds {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .detected-feed {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--glass-white);
    border: 1px solid var(--glass-border);
    border-radius: 8px;
  }
  
  .feed-url {
    font-size: 12px;
    color: var(--text-secondary);
    word-break: break-all;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;
document.head.appendChild(style);