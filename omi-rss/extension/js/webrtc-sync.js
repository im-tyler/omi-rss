// Ultra-thin WebRTC P2P sync implementation
export class WebRTCSync {
  constructor(syncManager) {
    this.syncManager = syncManager;
    this.pc = null;
    this.dataChannel = null;
    this.isConnected = false;
    this.connectionTimeout = 30000; // 30 seconds
    this.chunkSize = 16384; // 16KB chunks
  }

  // Create connection and generate QR code
  async createConnection() {
    try {
      // Clean up any existing connection
      this.cleanup();

      // Create peer connection
      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      // Create data channel
      this.dataChannel = this.pc.createDataChannel('sync', {
        ordered: true,
        maxRetransmits: 3
      });

      this.setupDataChannel();
      this.setupPeerConnection();

      // Create offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Create connection data for QR code
      const connectionData = {
        type: 'offer',
        sdp: this.pc.localDescription.sdp,
        timestamp: Date.now()
      };

      // Compress and encode
      const compressed = this.compress(JSON.stringify(connectionData));
      const qrData = btoa(compressed);

      // Generate QR code
      const qrCodeUrl = await this.generateQRCode(qrData);

      return {
        qrCode: qrCodeUrl,
        connectionData: qrData,
        expiresIn: this.connectionTimeout / 1000
      };
    } catch (error) {
      console.error('Failed to create WebRTC connection:', error);
      throw error;
    }
  }

  // Connect to peer using connection data
  async connectToPeer(connectionData) {
    try {
      // Decode and decompress
      const compressed = atob(connectionData);
      const data = JSON.parse(this.decompress(compressed));

      // Verify not expired
      if (Date.now() - data.timestamp > this.connectionTimeout) {
        throw new Error('Connection data expired');
      }

      if (data.type === 'offer') {
        // We're the answerer
        await this.handleOffer(data);
      } else if (data.type === 'answer') {
        // We're the offerer, set remote description
        await this.handleAnswer(data);
      }

      // Wait for connection
      await this.waitForConnection();

      return { connected: true };
    } catch (error) {
      console.error('Failed to connect to peer:', error);
      throw error;
    }
  }

  // Handle incoming offer
  async handleOffer(offerData) {
    this.cleanup();
    
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.setupPeerConnection();

    // Set remote description
    await this.pc.setRemoteDescription({
      type: 'offer',
      sdp: offerData.sdp
    });

    // Create answer
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    // Wait for ICE gathering
    await this.waitForIceGathering();

    // Send answer back (in real implementation, this would be through QR/manual)
    const answerData = {
      type: 'answer',
      sdp: this.pc.localDescription.sdp,
      timestamp: Date.now()
    };

    // For now, we'll need to display this for manual transfer
    console.log('Answer ready:', btoa(this.compress(JSON.stringify(answerData))));
  }

  // Handle incoming answer
  async handleAnswer(answerData) {
    await this.pc.setRemoteDescription({
      type: 'answer',
      sdp: answerData.sdp
    });
  }

  // Setup data channel handlers
  setupDataChannel() {
    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
      this.isConnected = true;
      this.startSync();
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
      this.isConnected = false;
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
    };

    this.dataChannel.onmessage = async (event) => {
      await this.handleMessage(event.data);
    };
  }

  // Setup peer connection handlers
  setupPeerConnection() {
    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };

    this.pc.onconnectionstatechange = () => {
      console.log('Connection state:', this.pc.connectionState);
      if (this.pc.connectionState === 'connected') {
        this.isConnected = true;
      } else if (this.pc.connectionState === 'disconnected' || 
                 this.pc.connectionState === 'failed') {
        this.isConnected = false;
        this.cleanup();
      }
    };
  }

  // Start sync process
  async startSync() {
    try {
      // Send sync request
      this.sendMessage({
        type: 'sync-request',
        deviceId: await this.syncManager.getDeviceId()
      });
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  // Handle incoming messages
  async handleMessage(data) {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'sync-request':
          // Send our data
          const syncData = await this.syncManager.getSyncData();
          await this.sendLargeData('sync-data', syncData);
          break;

        case 'sync-data':
          // Receive and apply sync data
          const remoteData = await this.receiveLargeData(message);
          await this.syncManager.applySyncData(remoteData);
          
          // Send our data back for bidirectional sync
          const ourData = await this.syncManager.getSyncData();
          await this.sendLargeData('sync-complete', ourData);
          break;

        case 'sync-complete':
          // Final sync from other side
          const finalData = await this.receiveLargeData(message);
          await this.syncManager.applySyncData(finalData);
          console.log('Sync completed successfully');
          break;

        case 'chunk':
          // Handle chunked data
          await this.handleChunk(message);
          break;
      }
    } catch (error) {
      console.error('Message handling error:', error);
    }
  }

  // Send message through data channel
  sendMessage(message) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message));
    }
  }

  // Send large data in chunks
  async sendLargeData(type, data) {
    const jsonData = JSON.stringify(data);
    const compressed = this.compress(jsonData);
    const chunks = this.createChunks(compressed);
    const transferId = this.generateId();

    // Send metadata first
    this.sendMessage({
      type: 'transfer-start',
      transferId,
      transferType: type,
      totalChunks: chunks.length,
      uncompressedSize: jsonData.length
    });

    // Send chunks
    for (let i = 0; i < chunks.length; i++) {
      this.sendMessage({
        type: 'chunk',
        transferId,
        chunkIndex: i,
        data: btoa(chunks[i])
      });

      // Small delay to avoid overwhelming the channel
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.sendMessage({
      type: 'transfer-complete',
      transferId
    });
  }

  // Receive large data from chunks
  receivedTransfers = new Map();

  async handleChunk(message) {
    const { transferId, chunkIndex, data } = message;
    
    if (!this.receivedTransfers.has(transferId)) {
      this.receivedTransfers.set(transferId, {
        chunks: [],
        metadata: null
      });
    }

    const transfer = this.receivedTransfers.get(transferId);
    transfer.chunks[chunkIndex] = atob(data);
  }

  async receiveLargeData(message) {
    // This would be implemented to reassemble chunks
    // For now, return the data directly
    return message.data;
  }

  // Utility functions
  compress(str) {
    // Simple compression using browser's CompressionStream if available
    // Fallback to just returning the string
    return str;
  }

  decompress(str) {
    // Decompress if we compressed
    return str;
  }

  createChunks(data) {
    const chunks = [];
    for (let i = 0; i < data.length; i += this.chunkSize) {
      chunks.push(data.slice(i, i + this.chunkSize));
    }
    return chunks;
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async generateQRCode(data) {
    // Create a simple QR code using a library or service
    // For now, return a data URL placeholder
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Draw placeholder QR code
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#000000';
    ctx.font = '12px monospace';
    ctx.fillText('QR Code', 10, 20);
    ctx.font = '8px monospace';
    
    // Display first part of connection data
    const lines = data.match(/.{1,30}/g) || [];
    lines.slice(0, 10).forEach((line, i) => {
      ctx.fillText(line, 10, 40 + i * 10);
    });

    return canvas.toDataURL();
  }

  // Wait for ICE gathering to complete
  async waitForIceGathering() {
    return new Promise((resolve) => {
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        const checkState = () => {
          if (this.pc.iceGatheringState === 'complete') {
            this.pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        this.pc.addEventListener('icegatheringstatechange', checkState);
        
        // Timeout after 5 seconds
        setTimeout(resolve, 5000);
      }
    });
  }

  // Wait for connection to establish
  async waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.connectionTimeout);

      const checkConnection = () => {
        if (this.isConnected) {
          clearTimeout(timeout);
          resolve();
        } else if (this.pc.connectionState === 'failed') {
          clearTimeout(timeout);
          reject(new Error('Connection failed'));
        }
      };

      // Check periodically
      const interval = setInterval(() => {
        checkConnection();
        if (this.isConnected || this.pc.connectionState === 'failed') {
          clearInterval(interval);
        }
      }, 100);
    });
  }

  // Cleanup connection
  cleanup() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.isConnected = false;
    this.receivedTransfers.clear();
  }
}