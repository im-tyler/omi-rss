# RSS Glassmorphism Reader Chrome Extension

A beautiful RSS reader extension with glassmorphism design, AI analysis, and advanced paywall bypass capabilities.

## Features

- **RSS Feed Detection**: Automatically detects RSS/Atom feeds on any webpage
- **Article Extraction**: Extracts and saves articles from any webpage
- **Paywall Bypass**: Advanced bypass techniques for major news sites
- **AI Analysis**: Analyze articles for sentiment, bias, and insights
- **Beautiful UI**: Glassmorphism design with smooth animations
- **Feed Management**: Subscribe and manage multiple RSS feeds
- **Offline Reading**: Save articles for offline reading
- **Real-time Updates**: Get notified of new articles

## Installation

### From Chrome Web Store
(Coming soon)

### Manual Installation (Developer Mode)
1. Clone this repository
2. Run `build_extension.bat` (Windows) or `build_extension.sh` (Mac/Linux)
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked" and select the `build/web/extension` directory

## Usage

### Popup Interface
- Click the extension icon to open the popup
- **Current Page** tab: Shows RSS feeds detected on the current page
- **Feeds** tab: View and manage your subscribed feeds
- **Saved** tab: Access your saved articles

### Quick Actions
- **Save Article**: Save the current page as an article
- **Find Feeds**: Search for RSS feeds on the current page
- **AI Analyze**: Analyze the current article with AI

### Context Menu
Right-click on any page to access:
- Save to RSS Reader
- Find RSS feeds on this page
- Analyze with AI
- Try to bypass paywall (if enabled)

### Keyboard Shortcuts
- `Ctrl+Shift+R` (Windows) / `Cmd+Shift+R` (Mac): Open RSS Reader
- `Ctrl+Shift+S` (Windows) / `Cmd+Shift+S` (Mac): Save article

## Privacy & Security

### Permissions Used
- **activeTab**: To detect RSS feeds and extract articles
- **tabs**: To manage reader tabs
- **storage**: To save feeds and articles locally
- **contextMenus**: For right-click menu options
- **notifications**: To notify about new articles
- **webRequest**: For advanced paywall bypass (optional)

### Data Storage
- All data is stored locally on your device
- No data is sent to external servers
- Paywall bypass is optional and can be disabled

## Paywall Bypass

The extension includes advanced paywall bypass techniques for educational purposes:

### Supported Sites
- The New York Times
- The Wall Street Journal
- The Washington Post
- Financial Times
- Bloomberg
- The Economist
- And many more...

### How It Works
1. **DOM Manipulation**: Removes paywall overlays and shows hidden content
2. **Cookie Management**: Sets subscriber cookies
3. **Header Modification**: Modifies request headers to appear as search engine bots
4. **JavaScript Override**: Overrides paywall detection functions
5. **Service Worker Bypass**: Disables paywall-enforcing service workers

### Disclaimer
The paywall bypass feature is provided for educational purposes only. Please support journalism by subscribing to publications you read regularly.

## Development

### Project Structure
```
web/extension/
├── manifest.json          # Extension manifest
├── background.js          # Service worker
├── content.js            # Content script
├── injected.js           # Injected script for bypass
├── popup.html            # Popup UI
├── popup.js              # Popup logic
├── icons/                # Extension icons
└── flutter/              # Flutter web build
```

### Building from Source
1. Install Flutter SDK
2. Install dependencies: `flutter pub get`
3. Run build script: `./build_extension.bat`

### Testing
1. Load the extension in Chrome developer mode
2. Test on various websites with RSS feeds
3. Verify paywall bypass on supported sites
4. Check console for debug logs

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file

## Support

For issues, feature requests, or questions:
- GitHub Issues: [Create an issue](https://github.com/yourusername/rss-glassmorphism-reader/issues)
- Email: support@example.com

## Acknowledgments

- Flutter team for the excellent web support
- Chrome Extensions team for the comprehensive APIs
- All contributors and testers