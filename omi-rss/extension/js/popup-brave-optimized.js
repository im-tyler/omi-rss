// Omi RSS Extension - Brave Optimized Version

// Browser compatibility helper
const browser = chrome || browser;

// DOM Elements
let elements = {};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  await configureBraveUI();
  initializeElements();
  attachEventListeners();
  await loadInitialData();
});

// Configure UI for Brave
async function configureBraveUI() {
  const isBrave = await detectBrave();
  
  if (isBrave) {
    // Remove sidebar button for Brave users since it's redundant
    const sidebarBtn = document.getElementById('sidebar-btn');
    const popoutBtn = document.getElementById('popout-btn');
    const actionBar = document.querySelector('.action-bar');
    
    if (sidebarBtn && actionBar) {
      // Remove sidebar button
      sidebarBtn.remove();
      
      // Adjust grid to 2 columns
      actionBar.style.gridTemplateColumns = 'repeat(2, 1fr)';
      
      // Update pop-out button text for Brave
      const popoutText = popoutBtn.querySelector('span');
      if (popoutText) {
        popoutText.textContent = 'Expand View';
      }
    }
    
    // Add Brave-specific styling
    const style = document.createElement('style');
    style.textContent = `
      /* Brave-specific optimizations */
      .action-bar {
        gap: 12px;
      }
      
      .action-btn {
        padding: 12px;
      }
      
      /* Add Brave indicator */
      .logo-container::after {
        content: 'Brave';
        position: absolute;
        top: -4px;
        right: -4px;
        background: linear-gradient(135deg, #FB542B, #FF6600);
        color: white;
        font-size: 9px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .logo-container {
        position: relative;
      }
    `;
    document.head.appendChild(style);
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
    const isBraveByBehavior = window.chrome && 
                               window.chrome.runtime && 
                               navigator.brave !== undefined;
    return isBraveByBehavior;
  } catch (e) {
    return false;
  }
}

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
    sidebarBtn: document.getElementById('sidebar-btn'), // May be null in Brave
    
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
  
  // Sidebar button only if it exists (not in Brave)
  if (elements.sidebarBtn) {
    elements.sidebarBtn.addEventListener('click', handleSidebar);
  }
  
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
  
  const isBrave = await detectBrave();
  const currentWindow = await browser.windows.getCurrent();
  
  // For Brave, open in a larger window since there's no sidebar option
  const width = isBrave ? 1000 : 800;
  const height = 600;
  
  const popoutWindow = await browser.windows.create({
    url: browser.runtime.getURL('popup-redesigned.html'),
    type: 'popup',
    width: width,
    height: height,
    left: Math.round(currentWindow.left + (currentWindow.width - width) / 2),
    top: Math.round(currentWindow.top + (currentWindow.height - height) / 2)
  });
  
  window.close();
}

async function handleWebVersion() {
  console.log('Web version clicked');
  
  await browser.tabs.create({
    url: 'http://localhost:3000',
    active: true
  });
  
  window.close();
}

async function handleSidebar() {
  console.log('Sidebar clicked');
  
  // This function should only be called in non-Brave browsers
  if (browser.sidePanel) {
    try {
      await browser.sidePanel.open({ windowId: (await browser.windows.getCurrent()).id });
      window.close();
    } catch (error) {
      console.error('Error opening sidebar:', error);
      // Fallback to popup window
      await handlePopOut();
    }
  } else {
    // Firefox fallback
    const currentWindow = await browser.windows.getCurrent();
    await browser.windows.create({
      url: browser.runtime.getURL('sidepanel.html'),
      type: 'popup',
      width: 400,
      height: currentWindow.height,
      left: currentWindow.left + currentWindow.width - 400,
      top: currentWindow.top
    });
    window.close();
  }
}

// Alternative: Create a special Brave mode that uses the extension in a persistent tab
async function openBravePersistentTab() {
  // Check if we already have a tab open
  const existingTabs = await browser.tabs.query({
    url: browser.runtime.getURL('reader.html')
  });
  
  if (existingTabs.length > 0) {
    // Focus existing tab
    await browser.tabs.update(existingTabs[0].id, { active: true });
    await browser.windows.update(existingTabs[0].windowId, { focused: true });
  } else {
    // Create new tab with reader interface
    await browser.tabs.create({
      url: browser.runtime.getURL('reader.html'),
      pinned: true
    });
  }
  
  window.close();
}

// Update pop-out handler for Brave to use reader view
async function handleBravePopOut() {
  await openBravePersistentTab();
}

// Rest of the original code remains the same...
// (Include all the other functions from popup-redesigned.js)

// Tab switching
function handleTabSwitch(clickedTab) {
  const tabName = clickedTab.dataset.tab;
  
  elements.tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  elements.tabContents.forEach(content => {
    content.style.display = content.id === `${tabName}-tab` ? 'block' : 'none';
  });
  
  browser.storage.local.set({ activeTab: tabName });
}

// Quick action handlers
async function handleSavePage() {
  console.log('Save page clicked');
  
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    
    const savedPages = (await browser.storage.local.get('savedPages')).savedPages || [];
    savedPages.unshift({
      id: Date.now(),
      title: tab.title,
      url: tab.url,
      favicon: tab.favIconUrl,
      savedAt: new Date().toISOString()
    });
    
    await browser.storage.local.set({ savedPages: savedPages.slice(0, 100) });
    
    showNotification('Page saved successfully', 'success');
    handleTabSwitch(document.querySelector('[data-tab="saved"]'));
    
  } catch (error) {
    console.error('Error saving page:', error);
    showNotification('Failed to save page', 'error');
  }
}

async function handleFindFeeds() {
  console.log('Find feeds clicked');
  
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    
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
  
  elements.refreshBtn.classList.add('spinning');
  
  try {
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
  
  browser.storage.local.get('settings', (data) => {
    const settings = data.settings || {};
    settings[setting] = value;
    browser.storage.local.set({ settings });
  });
}

// Data loading
async function loadInitialData() {
  try {
    elements.loadingView.style.display = 'flex';
    elements.mainView.style.display = 'none';
    
    const data = await browser.storage.local.get(['feeds', 'articles', 'savedPages', 'activeTab', 'settings']);
    
    if (data.activeTab) {
      const tabBtn = document.querySelector(`[data-tab="${data.activeTab}"]`);
      if (tabBtn) handleTabSwitch(tabBtn);
    }
    
    if (data.settings) {
      Object.entries(data.settings).forEach(([key, value]) => {
        const toggle = Array.from(elements.toggles).find(t => 
          t.closest('.setting-item').querySelector('.setting-label').textContent === key
        );
        if (toggle) toggle.checked = value;
      });
    }
    
    await loadFeedData();
    
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
  
  elements.feedList.querySelectorAll('.feed-item').forEach(item => {
    item.addEventListener('click', () => handleFeedClick(item.dataset.feedId));
  });
}

function handleFeedClick(feedId) {
  console.log('Feed clicked:', feedId);
  handleTabSwitch(document.querySelector('[data-tab="articles"]'));
}

// Notification system
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => notification.classList.add('show'), 10);
  
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

// Add necessary styles
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