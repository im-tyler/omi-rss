# Omi RSS Extension - Brave Browser Guide

## 🦁 Important Note for Brave Users

The Omi RSS extension works with Brave browser, but there's an important limitation to be aware of.

### 🚨 Brave's Built-in Sidebar

When using the Omi RSS extension in Brave, you may notice that Brave's built-in sidebar appears alongside the extension's sidebar. This is because:

1. Brave has its own sidebar system that intercepts Chrome's sidePanel API
2. When extensions try to use the sidebar, Brave shows both its sidebar and the extension
3. Unfortunately, there's no way for extensions to disable Brave's built-in sidebar

### 📋 How the Extension Works in Brave

All three buttons function, but with Brave's limitations:

- **Pop Out Button**: Opens extension in a full 800x600 window (works perfectly)
- **Web App Button**: Opens the full web app (works perfectly)  
- **Sidebar Button**: Opens the extension sidebar, but Brave's sidebar will also appear

### 🎯 Workarounds for Brave Users

While we can't disable Brave's sidebar, here are some options:

1. **Use the Pop Out button instead**: This gives you a clean reading experience without Brave's sidebar
2. **Use the Web App**: Access the full-featured web version at localhost:3000
3. **Disable Brave's Sidebar**: Go to `brave://settings/appearance` and set "Show sidebar" to "Never" (this affects all Brave features, not just extensions)
4. **Use window mode**: In extension settings, enable "Use window instead of sidebar" to always open in a window

### 🔧 Recommended Setup for Brave

1. **Install the extension** using the normal Chrome extension process
2. **Pin the extension** to your toolbar for easy access
3. **Consider using the Pop Out button** for the best reading experience without sidebar conflicts
4. **Or disable Brave's sidebar entirely** if you don't use other Brave sidebar features

### 🐛 Troubleshooting

**Issue**: Brave's sidebar appears when clicking the sidebar button
- **Solution**: Make sure "Use window instead of sidebar" is enabled in settings

**Issue**: Extension sidebar doesn't appear
- **Solution**: The extension opens in a window instead - this is normal for Brave

**Issue**: Want to disable Brave's sidebar completely
1. Go to `brave://settings/appearance`
2. Find "Show sidebar" option
3. Set to "Never"

### 📌 Tips for Brave Users

1. **Keyboard shortcuts**: Set up custom shortcuts in `brave://extensions/shortcuts`
2. **Pop-out window**: Provides the cleanest experience without Brave's sidebar
3. **Web version**: Full-featured app at `http://localhost:3000`
4. **Reader view**: The extension includes a full reader interface that works great as a pinned tab

### 💡 Why This Limitation Exists

Brave's built-in sidebar system intercepts Chrome's sidePanel API calls. This is a fundamental architectural difference between Brave and Chrome. While Chrome allows extensions to have their own sidebars, Brave routes all sidebar requests through its own sidebar system, resulting in both sidebars appearing.

Unfortunately, there's no API available for extensions to disable or hide Brave's sidebar programmatically.

### 📞 Support

If you experience any issues specific to Brave:
1. Make sure you're using the latest version of Brave
2. Check that the extension has all required permissions
3. Try disabling other extensions that might conflict
4. Report Brave-specific issues on our GitHub

---

**Note**: This behavior is specific to Brave browser. Chrome, Edge, and other Chromium browsers will use the native sidebar API when available.