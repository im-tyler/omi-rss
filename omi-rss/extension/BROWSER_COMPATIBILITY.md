# Browser Compatibility Guide for Omi RSS Extension

## Overview

The Omi RSS extension is designed to work with both Chrome and Firefox, but there are some API differences that require specific handling.

## Key Differences

### 1. SidePanel API (Chrome-only)

**Chrome**: Supports `chrome.sidePanel` API (Chrome 114+)
- Opens a dedicated panel on the side of the browser
- Persists across page navigations
- Better for reading experience

**Firefox**: No sidePanel support
- **Fallback options implemented:**
  - Opens in new tab with `?mode=tab` parameter
  - Popup window positioned to the side
  - Can inject iframe overlay (not implemented yet)

### 2. WebRequest Permissions

**Chrome Manifest V3**:
```json
"permissions": ["webRequest", "webRequestBlocking"]
```

**Firefox Manifest V3**:
```json
"permissions": ["declarativeNetRequest", "declarativeNetRequestWithHostAccess"]
```

### 3. Service Worker Differences

**Chrome**: Full service worker support
**Firefox**: Service workers with some limitations
- Background scripts may behave differently
- Event handling timing can vary

## File Structure

```
browser_extension/
├── manifest.json              # Chrome version
├── manifest_firefox.json      # Firefox version
├── js/
│   ├── background.js         # Original Chrome-focused
│   ├── background-compat.js  # Cross-browser compatible
│   └── browser-compat.js     # Compatibility layer
```

## Testing Instructions

### Chrome Testing

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `browser_extension` folder
5. Test features:
   - Click extension icon → popup should appear
   - Right-click → "Save to Omi RSS"
   - Use keyboard shortcuts (Ctrl+Shift+S, Ctrl+Shift+R)
   - Test sidePanel (if Chrome 114+)

### Firefox Testing

1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `manifest_firefox.json`
5. Test features:
   - Click extension icon → popup should appear
   - Right-click → "Save to Omi RSS"
   - Use keyboard shortcuts
   - Verify sidePanel fallback opens in new tab

### Cross-Browser Testing Checklist

- [ ] Extension loads without errors
- [ ] Popup functionality works
- [ ] Context menus appear and function
- [ ] Keyboard shortcuts work
- [ ] Article saving works
- [ ] Feed detection works
- [ ] Settings persist
- [ ] Notifications display correctly
- [ ] SidePanel/fallback works appropriately

## Building for Distribution

### Chrome Web Store

1. Use `manifest.json`
2. Zip the extension folder
3. Upload to Chrome Web Store

### Firefox Add-ons (AMO)

1. Replace `manifest.json` with `manifest_firefox.json`
2. Update background.js import to use `background-compat.js`
3. Run Firefox's web-ext tool for validation
4. Submit to addons.mozilla.org

## Code Examples

### Using the Compatibility Layer

```javascript
// Import the compatibility layer
importScripts('./browser-compat.js');

// Get browser API (works for both Chrome and Firefox)
const browserAPI = BrowserCompat.getBrowser();

// Open side panel with fallback
await BrowserCompat.openSidePanel({ tabId: tab.id });

// Storage operations (Promise-based)
const data = await BrowserCompat.storage.get('key');
await BrowserCompat.storage.set({ key: 'value' });
```

### Detecting Browser Type

```javascript
if (BrowserCompat.isFirefox()) {
  // Firefox-specific code
} else if (BrowserCompat.isChrome()) {
  // Chrome-specific code
}
```

## Known Limitations

1. **Firefox**:
   - No sidePanel API (uses tab/window fallback)
   - Some Chrome-specific APIs unavailable
   - Service worker lifecycle differences

2. **Chrome**:
   - Older versions (< 114) don't support sidePanel
   - Some users may have restricted permissions

## Future Improvements

1. Implement iframe overlay option for Firefox
2. Add Edge-specific optimizations
3. Support for Safari when it adopts Manifest V3
4. Progressive enhancement for newer APIs