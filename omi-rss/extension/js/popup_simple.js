// Simple debug script
console.log('Simple popup script loaded');

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    
    const statusDiv = document.getElementById('status');
    
    try {
        // Check if Chrome APIs are available
        if (typeof chrome === 'undefined') {
            throw new Error('Chrome API not available');
        }
        
        // Get manifest
        const manifest = chrome.runtime.getManifest();
        
        // Build status HTML
        let html = '<h3 class="success">✓ Extension Loaded Successfully</h3>';
        html += `<p>Name: ${manifest.name}</p>`;
        html += `<p>Version: ${manifest.version}</p>`;
        html += `<p>Extension ID: ${chrome.runtime.id}</p>`;
        
        // Test storage
        chrome.storage.local.get(null, function(items) {
            html += `<p>Storage items: ${Object.keys(items).length}</p>`;
            statusDiv.innerHTML = html;
        });
        
        // Add a link to open the main popup
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = 'popup.html';
            link.style.color = '#ff6b00';
            link.style.display = 'block';
            link.style.marginTop = '20px';
            link.textContent = 'Open Main Popup →';
            document.body.appendChild(link);
            
            // Also check console
            console.log('=== Debug Info ===');
            console.log('Manifest:', manifest);
            console.log('Runtime ID:', chrome.runtime.id);
            console.log('Document stylesheets:', document.styleSheets);
            console.log('To see CSS/JS errors: Right-click this popup → Inspect');
        }, 100);
        
    } catch (error) {
        statusDiv.innerHTML = `<h3 class="error">Error: ${error.message}</h3>`;
        console.error('Error:', error);
    }
});