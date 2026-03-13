// services/tokenService.js
// Centralized token management for marketplace authentication

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class TokenService {
  constructor() {
    this.tokensFile = path.join(__dirname, '../data/tokens.json');
    this.encryptionKey = process.env.TOKEN_ENCRYPTION_KEY || 'default-key-change-in-production';
    this.tokens = new Map();
    this.loadTokens();
  }

  // Load tokens from file
  async loadTokens() {
    try {
      const data = await fs.readFile(this.tokensFile, 'utf8');
      const encryptedTokens = JSON.parse(data);
      
      for (const [marketplace, encryptedToken] of Object.entries(encryptedTokens)) {
        this.tokens.set(marketplace, this.decrypt(encryptedToken));
      }
      
      console.log('✅ Tokens loaded successfully');
    } catch (error) {
      console.log('ℹ️ No existing tokens file, starting fresh');
      this.tokens = new Map();
    }
  }

  // Save tokens to file
  async saveTokens() {
    try {
      const encryptedTokens = {};
      for (const [marketplace, token] of this.tokens.entries()) {
        encryptedTokens[marketplace] = this.encrypt(token);
      }
      
      // Ensure data directory exists
      const dataDir = path.dirname(this.tokensFile);
      await fs.mkdir(dataDir, { recursive: true });
      
      await fs.writeFile(this.tokensFile, JSON.stringify(encryptedTokens, null, 2));
      console.log('✅ Tokens saved successfully');
    } catch (error) {
      console.error('❌ Error saving tokens:', error.message);
      throw error;
    }
  }

  // Encrypt token
  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  // Decrypt token
  decrypt(encryptedText) {
    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encrypted = textParts.join(':');
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Set token for marketplace
  async setToken(marketplace, token) {
    if (!marketplace || !token) {
      throw new Error('Marketplace and token are required');
    }

    this.tokens.set(marketplace, token);
    await this.saveTokens();
    
    console.log(`✅ Token set for ${marketplace}`);
    return true;
  }

  // Get token for marketplace
  getToken(marketplace) {
    return this.tokens.get(marketplace);
  }

  // Remove token for marketplace
  async removeToken(marketplace) {
    this.tokens.delete(marketplace);
    await this.saveTokens();
    
    console.log(`✅ Token removed for ${marketplace}`);
    return true;
  }

  // Validate token format
  validateTokenFormat(marketplace, token) {
    const formats = {
      'desty': /^dst_(test|prod)_\w+$/
    };

    const regex = formats[marketplace.toLowerCase()];
    if (!regex) {
      return false;
    }

    return regex.test(token);
  }

  // Generate new token
  generateToken(marketplace, environment = 'prod') {
    const prefix = {
      'desty': 'dst'
    };

    const marketplacePrefix = prefix[marketplace.toLowerCase()];
    if (!marketplacePrefix) {
      throw new Error(`Unsupported marketplace: ${marketplace}`);
    }

    const randomPart = crypto.randomBytes(16).toString('hex');
    return `${marketplacePrefix}_${environment}_${randomPart}`;
  }

  // Check if token exists
  hasToken(marketplace) {
    return this.tokens.has(marketplace);
  }

  // Get all marketplaces with tokens
  getMarketplacesWithTokens() {
    return Array.from(this.tokens.keys());
  }

  // Refresh token (generate new one)
  async refreshToken(marketplace, environment = 'prod') {
    const newToken = this.generateToken(marketplace, environment);
    await this.setToken(marketplace, newToken);
    return newToken;
  }

  // Validate request token against stored token
  validateRequestToken(req, marketplace) {
    const storedToken = this.getToken(marketplace);
    if (!storedToken) {
      console.warn(`⚠️ No token configured for ${marketplace}`);
      return false;
    }

    const authHeader = req.headers['authorization'];
    const requestToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    return requestToken === storedToken;
  }

  // Get token info
  getTokenInfo(marketplace) {
    const token = this.getToken(marketplace);
    if (!token) {
      return null;
    }

    const parts = token.split('_');
    return {
      marketplace: parts[0],
      environment: parts[1],
      hash: parts[2],
      isValid: this.validateTokenFormat(marketplace, token)
    };
  }

  // Export tokens (for backup)
  async exportTokens() {
    const exportData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      tokens: {}
    };

    for (const [marketplace, token] of this.tokens.entries()) {
      exportData.tokens[marketplace] = {
        token: token,
        info: this.getTokenInfo(marketplace)
      };
    }

    return exportData;
  }

  // Import tokens (from backup)
  async importTokens(exportData) {
    try {
      if (!exportData.tokens) {
        throw new Error('Invalid export data format');
      }

      for (const [marketplace, tokenData] of Object.entries(exportData.tokens)) {
        if (tokenData.token && this.validateTokenFormat(marketplace, tokenData.token)) {
          await this.setToken(marketplace, tokenData.token);
        }
      }

      console.log('✅ Tokens imported successfully');
      return true;
    } catch (error) {
      console.error('❌ Error importing tokens:', error.message);
      throw error;
    }
  }
}

module.exports = new TokenService();
