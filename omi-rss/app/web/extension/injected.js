// Injected script for RSS Glassmorphism Reader extension
// This script runs in the page context with full DOM access

(function() {
  'use strict';
  
  // Configuration
  const config = {
    debugMode: false,
    maxRetries: 3,
    retryDelay: 500,
  };
  
  // Log function
  function log(...args) {
    if (config.debugMode) {
      console.log('[RSS Reader Bypass]', ...args);
    }
  }
  
  // Advanced bypass strategies
  const bypassStrategies = {
    // Override JavaScript functions
    overrideFunctions: () => {
      // Override common paywall detection functions
      const overrides = [
        'checkSubscription',
        'isSubscriber',
        'hasAccess',
        'isPremium',
        'checkPaywall',
        'showPaywall',
        'blockContent',
      ];
      
      overrides.forEach(funcName => {
        if (window[funcName]) {
          window[funcName] = function() { return true; };
          log(`Overrode function: ${funcName}`);
        }
      });
      
      // Override localStorage/sessionStorage checks
      const storageProxy = new Proxy(window.localStorage, {
        get: function(target, prop) {
          if (prop === 'getItem') {
            return function(key) {
              if (key.includes('subscriber') || key.includes('premium') || key.includes('access')) {
                return 'true';
              }
              return target.getItem(key);
            };
          }
          return target[prop];
        }
      });
      
      try {
        Object.defineProperty(window, 'localStorage', {
          value: storageProxy,
          writable: false
        });
      } catch (e) {
        log('Failed to override localStorage:', e);
      }
    },
    
    // Intercept network requests
    interceptRequests: () => {
      // Override fetch
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = args[0];
        
        // Block paywall check requests
        if (typeof url === 'string' && 
            (url.includes('/paywall') || 
             url.includes('/subscription') || 
             url.includes('/access-check'))) {
          log('Blocked paywall check:', url);
          return Promise.resolve(new Response(JSON.stringify({ hasAccess: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
        
        return originalFetch.apply(this, args);
      };
      
      // Override XMLHttpRequest
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        const originalOpen = xhr.open;
        
        xhr.open = function(method, url, ...args) {
          if (url.includes('/paywall') || url.includes('/subscription')) {
            log('Blocked XHR paywall check:', url);
            url = 'data:application/json,{"hasAccess":true}';
          }
          return originalOpen.apply(this, [method, url, ...args]);
        };
        
        return xhr;
      };
    },
    
    // Cookie manipulation
    manipulateCookies: () => {
      // Add subscriber cookies
      const subscriberCookies = [
        'subscriber=true',
        'premium_access=true',
        'user_type=premium',
        'access_level=full',
        'subscription_status=active',
      ];
      
      subscriberCookies.forEach(cookie => {
        document.cookie = `${cookie}; path=/; max-age=31536000`;
      });
      
      // Override cookie getter
      Object.defineProperty(document, 'cookie', {
        get: function() {
          return subscriberCookies.join('; ');
        },
        set: function(value) {
          // Allow setting but maintain our cookies
          return value;
        }
      });
    },
    
    // DOM manipulation
    manipulateDOM: () => {
      // Remove common paywall elements
      const paywallSelectors = [
        '[class*="paywall"]',
        '[id*="paywall"]',
        '[class*="subscription"]',
        '[class*="premium-block"]',
        '[class*="content-gate"]',
        '[class*="article-limit"]',
        '.tp-modal',
        '.tp-backdrop',
        '#piano_modal',
        '.meter-overlay',
      ];
      
      paywallSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          el.remove();
          log('Removed element:', selector);
        });
      });
      
      // Show hidden content
      const contentSelectors = [
        'article',
        '[class*="article-body"]',
        '[class*="story-body"]',
        '[class*="content"]',
        'main',
      ];
      
      contentSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          el.style.display = 'block';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
          el.style.overflow = 'visible';
          el.style.maxHeight = 'none';
          el.style.position = 'static';
          
          // Remove blur and filters
          el.style.filter = 'none';
          el.style.webkitFilter = 'none';
          
          // Remove classes that might hide content
          const classesToRemove = ['truncated', 'blurred', 'hidden', 'locked', 'premium-content'];
          classesToRemove.forEach(cls => {
            if (el.classList.contains(cls)) {
              el.classList.remove(cls);
              log('Removed class:', cls);
            }
          });
        });
      });
    },
    
    // Shadow DOM bypass
    bypassShadowDOM: () => {
      // Find all shadow roots
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        if (el.shadowRoot) {
          // Apply bypass to shadow DOM
          const shadowDoc = el.shadowRoot;
          
          // Remove paywall elements in shadow DOM
          shadowDoc.querySelectorAll('[class*="paywall"]').forEach(shadowEl => {
            shadowEl.remove();
            log('Removed shadow element');
          });
          
          // Show content in shadow DOM
          shadowDoc.querySelectorAll('article, [class*="content"]').forEach(shadowEl => {
            shadowEl.style.display = 'block';
            shadowEl.style.visibility = 'visible';
          });
        }
      });
    },
    
    // Service worker bypass
    bypassServiceWorker: () => {
      if ('serviceWorker' in navigator) {
        // Unregister service workers that might enforce paywalls
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(registration => {
            if (registration.scope.includes('paywall') || 
                registration.scope.includes('subscription')) {
              registration.unregister();
              log('Unregistered service worker:', registration.scope);
            }
          });
        });
      }
    },
    
    // History state manipulation
    manipulateHistory: () => {
      // Override history methods to prevent paywall redirects
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = function(state, title, url) {
        if (url && (url.includes('/paywall') || url.includes('/subscribe'))) {
          log('Blocked paywall redirect:', url);
          return;
        }
        return originalPushState.apply(history, arguments);
      };
      
      history.replaceState = function(state, title, url) {
        if (url && (url.includes('/paywall') || url.includes('/subscribe'))) {
          log('Blocked paywall redirect:', url);
          return;
        }
        return originalReplaceState.apply(history, arguments);
      };
    },
    
    // Event listener bypass
    bypassEventListeners: () => {
      // Override addEventListener to block paywall events
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        // Check if it's a paywall-related event
        const listenerString = listener.toString();
        if (listenerString.includes('paywall') || 
            listenerString.includes('subscription') ||
            listenerString.includes('blockContent')) {
          log('Blocked event listener:', type);
          return;
        }
        
        return originalAddEventListener.call(this, type, listener, options);
      };
      
      // Remove existing scroll blocking
      document.removeEventListener('scroll', null);
      window.removeEventListener('scroll', null);
    },
    
    // Advanced content extraction
    extractContent: () => {
      // Try to find and extract full article content from various sources
      
      // Check for JSON-LD structured data
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      jsonLdScripts.forEach(script => {
        try {
          const data = JSON.parse(script.textContent);
          if (data['@type'] === 'NewsArticle' || data['@type'] === 'Article') {
            if (data.articleBody) {
              // Create or update article content
              const article = document.querySelector('article') || document.createElement('article');
              article.innerHTML = `<p>${data.articleBody.replace(/\n/g, '</p><p>')}</p>`;
              
              if (!document.querySelector('article')) {
                document.body.appendChild(article);
              }
              
              log('Extracted content from JSON-LD');
            }
          }
        } catch (e) {
          log('Failed to parse JSON-LD:', e);
        }
      });
      
      // Check for content in meta tags
      const contentMeta = document.querySelector('meta[property="og:description"]');
      if (contentMeta && contentMeta.content.length > 200) {
        const article = document.querySelector('article');
        if (article && article.textContent.length < contentMeta.content.length) {
          article.innerHTML = `<p>${contentMeta.content}</p>`;
          log('Extracted content from meta tags');
        }
      }
    }
  };
  
  // Site-specific bypasses
  const siteSpecificBypasses = {
    'wsj.com': () => {
      // WSJ specific bypass
      window.localStorage.setItem('wsjregion', 'na,us');
      window.localStorage.setItem('ab_uuid', 'free-access');
      document.querySelectorAll('.wsj-snippet-login').forEach(el => el.remove());
      document.querySelectorAll('[class*="paywall"]').forEach(el => el.remove());
      
      // Remove WSJ Pro features
      if (window.WSJ && window.WSJ.Data) {
        window.WSJ.Data.isLoggedIn = true;
        window.WSJ.Data.customerType = 'premium';
      }
    },
    
    'nytimes.com': () => {
      // NYT specific bypass
      window.localStorage.setItem('nyt-a', '1');
      window.localStorage.setItem('nyt-s', '1');
      
      // Override NYT gateway
      if (window.NYTGateway) {
        window.NYTGateway.isLoggedIn = true;
        window.NYTGateway.hasAccess = true;
      }
      
      // Remove meter
      document.querySelectorAll('[data-testid="paywall"]').forEach(el => el.remove());
      document.querySelectorAll('.css-mcm29f').forEach(el => el.remove());
    },
    
    'ft.com': () => {
      // FT specific bypass
      window.localStorage.setItem('ft-access', 'premium');
      document.cookie = 'FT_User=loggedIn:true; path=/';
      
      // Remove barriers
      document.querySelectorAll('.barrier').forEach(el => el.remove());
      document.querySelectorAll('.js-article-ribbon').forEach(el => el.remove());
    },
    
    'bloomberg.com': () => {
      // Bloomberg specific bypass
      window.localStorage.setItem('bb_user_type', 'subscriber');
      
      // Override Bloomberg functions
      if (window.Bloomberg) {
        window.Bloomberg.user = { isSubscriber: true };
      }
      
      // Remove fence
      document.querySelectorAll('[data-fence]').forEach(el => el.remove());
    },
    
    'economist.com': () => {
      // Economist specific bypass
      window.localStorage.setItem('ec_user_subs', 'active');
      
      // Remove paywall
      document.querySelectorAll('.paywall').forEach(el => el.remove());
      document.querySelectorAll('[class*="regwall"]').forEach(el => el.remove());
    },
    
    'washingtonpost.com': () => {
      // WaPo specific bypass
      window.localStorage.setItem('wp_user_subscription', 'premium');
      
      // Remove paywall
      document.querySelectorAll('[data-qa="paywall"]').forEach(el => el.remove());
      document.querySelectorAll('#leaderboard-wrapper').forEach(el => el.remove());
    }
  };
  
  // Execute bypass
  function executeBypass() {
    log('Starting bypass execution');
    
    // Run all general strategies
    Object.entries(bypassStrategies).forEach(([name, strategy]) => {
      try {
        strategy();
        log(`Executed strategy: ${name}`);
      } catch (e) {
        log(`Strategy failed: ${name}`, e);
      }
    });
    
    // Run site-specific bypass if available
    const hostname = window.location.hostname;
    Object.entries(siteSpecificBypasses).forEach(([domain, bypass]) => {
      if (hostname.includes(domain)) {
        try {
          bypass();
          log(`Executed site-specific bypass for: ${domain}`);
        } catch (e) {
          log(`Site-specific bypass failed for: ${domain}`, e);
        }
      }
    });
    
    // Final cleanup
    setTimeout(() => {
      // Enable text selection
      document.body.style.userSelect = 'auto';
      document.body.style.webkitUserSelect = 'auto';
      
      // Enable right click
      document.oncontextmenu = null;
      
      // Enable copying
      document.oncopy = null;
      
      // Ensure body is visible and scrollable
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
      
      log('Bypass execution completed');
    }, 100);
  }
  
  // Execute immediately
  executeBypass();
  
  // Re-execute on DOM changes
  const observer = new MutationObserver((mutations) => {
    let shouldRerun = false;
    
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // Element node
          const element = node;
          if (element.classList && 
              (element.classList.contains('paywall') ||
               element.classList.contains('subscription') ||
               element.id && element.id.includes('paywall'))) {
            shouldRerun = true;
          }
        }
      });
    });
    
    if (shouldRerun) {
      log('Paywall element detected, re-running bypass');
      executeBypass();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Export for extension communication
  window.__rssReaderBypass = {
    executeBypass,
    config,
    strategies: bypassStrategies,
    siteSpecific: siteSpecificBypasses
  };
  
})();