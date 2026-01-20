// Content script for RSS Glassmorphism Reader extension

// Detect RSS feeds on the page
function detectFeeds() {
  const feeds = [];
  
  // Check for RSS/Atom links in head
  const linkElements = document.querySelectorAll(
    'link[type="application/rss+xml"], ' +
    'link[type="application/atom+xml"], ' +
    'link[type="application/rdf+xml"], ' +
    'link[type="application/rss"], ' +
    'link[type="application/atom"], ' +
    'link[type="text/xml"]'
  );
  
  linkElements.forEach(link => {
    feeds.push({
      url: new URL(link.href, window.location.href).href,
      title: link.title || document.title,
      type: link.type,
    });
  });
  
  // Check for common RSS URLs
  const commonPaths = ['/rss', '/feed', '/atom', '/rss.xml', '/feed.xml', '/atom.xml'];
  const baseUrl = window.location.origin;
  
  // Also check for RSS links in the page
  const rssLinks = document.querySelectorAll('a[href*="rss"], a[href*="feed"], a[href*="atom"]');
  rssLinks.forEach(link => {
    const href = link.href;
    if (href && !feeds.find(f => f.url === href)) {
      feeds.push({
        url: href,
        title: link.textContent || document.title,
        type: 'application/rss+xml',
      });
    }
  });
  
  return feeds;
}

// Extract article content
function extractArticle() {
  const article = {
    title: document.title,
    url: window.location.href,
    content: '',
    summary: '',
    author: '',
    publishedDate: '',
    images: [],
  };
  
  // Try to find article content using common selectors
  const contentSelectors = [
    'article',
    '[role="article"]',
    '.article-content',
    '.entry-content',
    '.post-content',
    '.content',
    'main',
    '#content',
  ];
  
  let contentElement = null;
  for (const selector of contentSelectors) {
    contentElement = document.querySelector(selector);
    if (contentElement && contentElement.textContent.length > 100) {
      break;
    }
  }
  
  if (!contentElement) {
    contentElement = document.body;
  }
  
  // Extract text content
  article.content = contentElement.textContent.trim();
  
  // Try to extract summary
  const summaryElement = document.querySelector(
    'meta[name="description"], ' +
    'meta[property="og:description"], ' +
    'meta[name="twitter:description"]'
  );
  if (summaryElement) {
    article.summary = summaryElement.getAttribute('content');
  }
  
  // Try to extract author
  const authorElement = document.querySelector(
    'meta[name="author"], ' +
    'meta[property="article:author"], ' +
    '[rel="author"], ' +
    '.author, ' +
    '.by-author'
  );
  if (authorElement) {
    article.author = authorElement.getAttribute('content') || 
                    authorElement.textContent.trim();
  }
  
  // Try to extract publish date
  const dateElement = document.querySelector(
    'meta[property="article:published_time"], ' +
    'time[datetime], ' +
    '.published, ' +
    '.post-date'
  );
  if (dateElement) {
    article.publishedDate = dateElement.getAttribute('datetime') || 
                           dateElement.getAttribute('content') ||
                           dateElement.textContent.trim();
  }
  
  // Extract images
  const images = contentElement.querySelectorAll('img');
  images.forEach(img => {
    if (img.src && img.width > 100 && img.height > 100) {
      article.images.push({
        src: img.src,
        alt: img.alt,
        width: img.width,
        height: img.height,
      });
    }
  });
  
  return article;
}

// Run paywall bypass
function runBypass(url) {
  const domain = new URL(url).hostname;
  
  // Apply bypass strategies based on domain
  const strategies = {
    // Remove paywall elements
    removeElements: () => {
      const selectors = [
        '.paywall',
        '#paywall',
        '.subscription-required',
        '.premium-content-overlay',
        '[data-paywall]',
        '.article-paywall',
        '.paywall-overlay',
      ];
      
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });
    },
    
    // Show hidden content
    showContent: () => {
      const selectors = [
        '.article-content',
        '.story-body',
        '.entry-content',
        '[data-premium-content]',
      ];
      
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          el.style.display = 'block';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
          el.classList.remove('hidden', 'invisible', 'fade-out');
        });
      });
    },
    
    // Remove blur
    removeBlur: () => {
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.filter && style.filter.includes('blur')) {
          el.style.filter = 'none';
        }
      });
    },
    
    // Enable scrolling
    enableScroll: () => {
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
      document.body.style.position = 'static';
    },
    
    // Remove anti-selection
    enableSelection: () => {
      document.querySelectorAll('*').forEach(el => {
        el.style.userSelect = 'text';
        el.style.webkitUserSelect = 'text';
      });
    },
  };
  
  // Apply all strategies
  Object.values(strategies).forEach(strategy => {
    try {
      strategy();
    } catch (e) {
      console.error('Bypass strategy failed:', e);
    }
  });
  
  // Domain-specific bypasses
  applyDomainSpecificBypass(domain);
}

// Apply domain-specific bypass rules
function applyDomainSpecificBypass(domain) {
  const domainRules = {
    'nytimes.com': () => {
      // NYT specific
      document.querySelectorAll('[data-testid="paywall"]').forEach(el => el.remove());
      document.querySelectorAll('.css-mcm29f').forEach(el => el.remove());
    },
    'wsj.com': () => {
      // WSJ specific
      document.querySelectorAll('.wsj-snippet-login').forEach(el => el.remove());
      document.querySelector('article')?.classList.remove('is-gated');
    },
    'washingtonpost.com': () => {
      // WaPo specific
      document.querySelectorAll('[data-qa="paywall"]').forEach(el => el.remove());
    },
    'ft.com': () => {
      // FT specific
      document.querySelectorAll('.barrier').forEach(el => el.remove());
    },
    'bloomberg.com': () => {
      // Bloomberg specific
      document.querySelectorAll('[data-paywall-overlay]').forEach(el => el.remove());
    },
  };
  
  // Find matching rule
  for (const [pattern, bypass] of Object.entries(domainRules)) {
    if (domain.includes(pattern)) {
      try {
        bypass();
      } catch (e) {
        console.error(`Domain bypass failed for ${pattern}:`, e);
      }
    }
  }
}

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'detectFeeds':
      sendResponse(detectFeeds());
      break;
      
    case 'extractArticle':
      sendResponse(extractArticle());
      break;
      
    case 'extractForAnalysis':
      sendResponse(extractArticle());
      break;
      
    case 'runBypass':
      runBypass(request.url);
      sendResponse({ success: true });
      break;
  }
});

// Auto-detect feeds on page load
window.addEventListener('load', () => {
  const feeds = detectFeeds();
  if (feeds.length > 0) {
    // Add RSS indicator to page
    const indicator = document.createElement('div');
    indicator.id = 'rss-indicator';
    indicator.innerHTML = `
      <style>
        #rss-indicator {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: rgba(139, 92, 246, 0.9);
          color: white;
          padding: 12px 20px;
          border-radius: 25px;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          cursor: pointer;
          z-index: 999999;
          display: flex;
          align-items: center;
          gap: 8px;
          backdrop-filter: blur(10px);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
        }
        #rss-indicator:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
        }
        #rss-indicator svg {
          width: 20px;
          height: 20px;
        }
      </style>
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M3.93 3.93C5.49 2.37 7.5 1.5 9.64 1.5s4.15.87 5.71 2.43l1.42-1.42C14.86.6 12.33-.36 9.64-.36S4.42.6 2.51 2.51l1.42 1.42zM6.36 6.36c.98-.98 2.28-1.47 3.57-1.47s2.59.49 3.57 1.47l1.42-1.42c-1.37-1.37-3.18-2.05-4.99-2.05S6.31 3.57 4.94 4.94l1.42 1.42zM8.79 8.79c.39-.39.91-.59 1.42-.59s1.03.2 1.42.59l1.42-1.42c-.78-.78-1.81-1.17-2.84-1.17s-2.06.39-2.84 1.17l1.42 1.42zM12 12c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/>
      </svg>
      ${feeds.length} RSS feed${feeds.length > 1 ? 's' : ''} found
    `;
    
    indicator.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openReader' });
    });
    
    document.body.appendChild(indicator);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      indicator.style.opacity = '0.5';
    }, 10000);
  }
});

// Inject CSS for better article extraction
const style = document.createElement('style');
style.textContent = `
  /* RSS Reader extraction helpers */
  .rss-reader-highlight {
    outline: 2px solid #8B5CF6 !important;
    outline-offset: 2px;
  }
  
  .rss-reader-extracted {
    background-color: rgba(139, 92, 246, 0.1) !important;
  }
`;
document.head.appendChild(style);