// Feed Detector - Finds RSS/Atom feeds on the current page

(function() {
  const feeds = [];
  
  // Check for feed links in <link> tags
  const linkElements = document.querySelectorAll('link[type*="rss"], link[type*="atom"], link[type*="feed"]');
  linkElements.forEach(link => {
    if (link.href) {
      feeds.push({
        url: link.href,
        title: link.title || 'RSS Feed',
        type: link.type
      });
    }
  });
  
  // Check for common feed URLs
  const commonFeedPaths = ['/feed', '/rss', '/atom', '/feed.xml', '/rss.xml', '/atom.xml', '/feeds'];
  const currentOrigin = window.location.origin;
  
  // Look for feed links in the page
  const links = document.querySelectorAll('a[href*="feed"], a[href*="rss"], a[href*="atom"]');
  links.forEach(link => {
    const href = link.href;
    if (href && !feeds.find(f => f.url === href)) {
      feeds.push({
        url: href,
        title: link.textContent.trim() || 'RSS Feed',
        type: 'link'
      });
    }
  });
  
  return feeds;
})();