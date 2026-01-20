// Browser compatibility layer for cross-browser extension support

const BrowserCompat = {
  // Detect browser type
  isFirefox: () => {
    return typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL;
  },

  isChrome: () => {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL;
  },

  // Get browser API object
  getBrowser: () => {
    return BrowserCompat.isFirefox() ? browser : chrome;
  },

  // Check if sidePanel API is available
  hasSidePanelSupport: () => {
    const api = BrowserCompat.getBrowser();
    return api && api.sidePanel && typeof api.sidePanel.open === 'function';
  },

  // Open side panel or fallback
  openSidePanel: async (options = {}) => {
    const api = BrowserCompat.getBrowser();
    
    if (BrowserCompat.hasSidePanelSupport()) {
      // Chrome with sidePanel support
      try {
        await api.sidePanel.open(options);
        return { success: true, method: 'sidePanel' };
      } catch (error) {
        console.error('SidePanel open failed:', error);
      }
    }

    // Fallback options for Firefox and older Chrome
    return BrowserCompat.openSidePanelFallback();
  },

  // Fallback implementation for browsers without sidePanel
  openSidePanelFallback: async () => {
    const api = BrowserCompat.getBrowser();
    
    // Option 1: Open in a new tab with a special query parameter
    const sidePanelUrl = api.runtime.getURL('sidepanel.html?mode=tab');
    
    try {
      // Check if tab already exists
      const tabs = await api.tabs.query({ url: sidePanelUrl });
      
      if (tabs.length > 0) {
        // Focus existing tab
        await api.tabs.update(tabs[0].id, { active: true });
        return { success: true, method: 'tab', tabId: tabs[0].id };
      } else {
        // Create new tab
        const tab = await api.tabs.create({ url: sidePanelUrl, active: true });
        return { success: true, method: 'tab', tabId: tab.id };
      }
    } catch (error) {
      console.error('Failed to open sidepanel fallback:', error);
      
      // Last resort: Open as popup window
      try {
        const window = await api.windows.create({
          url: sidePanelUrl + '&mode=window',
          type: 'popup',
          width: 400,
          height: 600,
          left: screen.width - 420,
          top: 20
        });
        return { success: true, method: 'window', windowId: window.id };
      } catch (windowError) {
        console.error('Failed to open popup window:', windowError);
        return { success: false, error: windowError };
      }
    }
  },

  // Storage API wrapper (handles differences between Chrome and Firefox)
  storage: {
    get: async (keys) => {
      const api = BrowserCompat.getBrowser();
      return new Promise((resolve, reject) => {
        api.storage.local.get(keys, (result) => {
          if (api.runtime.lastError) {
            reject(api.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      });
    },

    set: async (items) => {
      const api = BrowserCompat.getBrowser();
      return new Promise((resolve, reject) => {
        api.storage.local.set(items, () => {
          if (api.runtime.lastError) {
            reject(api.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    }
  },

  // Handle browser-specific permissions
  requestPermissions: async (permissions) => {
    const api = BrowserCompat.getBrowser();
    
    // Filter out permissions not supported by the current browser
    const supportedPermissions = permissions.filter(permission => {
      if (BrowserCompat.isFirefox()) {
        // Firefox doesn't support sidePanel
        return permission !== 'sidePanel';
      }
      return true;
    });

    try {
      const granted = await api.permissions.request({
        permissions: supportedPermissions
      });
      return granted;
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  },

  // Initialize browser-specific features
  initialize: async () => {
    const api = BrowserCompat.getBrowser();
    
    // Set up browser action click handler
    api.action.onClicked.addListener(async (tab) => {
      await BrowserCompat.openSidePanel({ tabId: tab.id });
    });

    // Set up command handlers
    api.commands.onCommand.addListener(async (command) => {
      if (command === 'open-sidepanel') {
        const [activeTab] = await api.tabs.query({ active: true, currentWindow: true });
        await BrowserCompat.openSidePanel({ tabId: activeTab.id });
      }
    });

    console.log(`Browser compatibility layer initialized for ${BrowserCompat.isFirefox() ? 'Firefox' : 'Chrome'}`);
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrowserCompat;
}