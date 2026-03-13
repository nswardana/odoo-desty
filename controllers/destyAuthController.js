// controllers/destyAuthController.js
// Desty API OAuth authentication controller

const crypto = require('crypto');
const axios = require('axios');
const tokenService = require('../services/tokenService');

class DestyAuthController {
  constructor() {
    this.clientId = process.env.DESTY_CLIENT_ID;
    this.clientSecret = process.env.DESTY_CLIENT_SECRET;
    this.apiKey = process.env.DESTY_API_KEY;
    this.redirectUri = process.env.DESTY_REDIRECT_URI || 'http://localhost:3000/desty/callback';
    this.baseAuthUrl = 'https://api.desty.app/oauth/authorize';
    this.tokenUrl = 'https://api.desty.app/oauth/token';
    this.apiUrl = process.env.DESTY_API_BASE_URL || 'https://api.desty.app';
  }

  // GET /desty/authorize
  // Initiate OAuth flow for Desty
  async authorize(req, res) {
    try {
      console.log('🔐 Initiating Desty OAuth authorization');

      if (!this.clientId) {
        return res.status(500).json({ 
          error: 'Desty Client ID not configured' 
        });
      }

      // Generate state parameter for security
      const state = crypto.randomBytes(16).toString('hex');
      
      // Store state in session/temp storage for verification
      req.session = req.session || {};
      req.session.desty_oauth_state = state;

      // Build authorization URL
      const authParams = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        response_type: 'code',
        scope: 'orders.read products.read inventory.read payments.read shipments.read',
        state: state
      });

      const authUrl = `${this.baseAuthUrl}?${authParams.toString()}`;
      
      console.log(`📤 Redirecting to Desty OAuth: ${authUrl.substring(0, 100)}...`);

      res.json({
        success: true,
        authorization_url: authUrl,
        state: state,
        message: 'Visit the authorization URL to grant access to your Desty store'
      });

    } catch (error) {
      console.error('❌ Desty authorization error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // GET /desty/callback
  // Handle OAuth callback from Desty
  async callback(req, res) {
    try {
      console.log('📥 Desty OAuth callback received');

      const { code, state, error } = req.query;

      // Handle OAuth errors
      if (error) {
        console.error('❌ Desty OAuth error:', error);
        return res.status(400).json({ 
          error: 'OAuth authorization failed',
          details: error 
        });
      }

      // Verify state parameter
      if (!state || state !== (req.session?.desty_oauth_state)) {
        console.error('❌ Invalid state parameter in OAuth callback');
        return res.status(400).json({ 
          error: 'Invalid state parameter - CSRF protection failed' 
        });
      }

      // Clear state from session
      if (req.session) {
        delete req.session.desty_oauth_state;
      }

      if (!code) {
        return res.status(400).json({ 
          error: 'Authorization code not received' 
        });
      }

      // Exchange authorization code for access token
      const tokenData = await this.exchangeCodeForToken(code);
      
      console.log('✅ Desty OAuth token exchange successful');

      // Store token securely
      await tokenService.saveToken('desty', tokenData);

      res.json({
        success: true,
        message: 'Desty authorization successful',
        store_info: {
          store_id: tokenData.store_id,
          store_name: tokenData.store_name,
          merchant_id: tokenData.merchant_id
        },
        token_info: {
          access_token: tokenData.access_token ? '***masked***' : null,
          refresh_token: tokenData.refresh_token ? '***masked***' : null,
          expires_in: tokenData.expires_in,
          scope: tokenData.scope
        }
      });

    } catch (error) {
      console.error('❌ Desty OAuth callback error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // POST /desty/token
  // Exchange authorization code for access token
  async exchangeCodeForToken(code) {
    try {
      console.log('🔄 Exchanging authorization code for access token');

      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        code: code
      });

      const response = await axios.post(this.tokenUrl, tokenParams, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      const tokenData = response.data;

      // Validate token response
      if (!tokenData.access_token) {
        throw new Error('No access token received from Desty');
      }

      // Add metadata
      tokenData.marketplace = 'desty';
      tokenData.created_at = new Date().toISOString();
      tokenData.expires_at = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

      console.log(`✅ Token received for store: ${tokenData.store_id || 'unknown'}`);

      return tokenData;

    } catch (error) {
      console.error('❌ Token exchange error:', error.message);
      
      if (error.response) {
        console.error('❌ Desty API response:', error.response.data);
        throw new Error(`Desty API error: ${error.response.data.message || error.response.statusText}`);
      }
      
      throw error;
    }
  }

  // POST /desty/refresh
  // Refresh access token using refresh token
  async refreshToken(req, res) {
    try {
      console.log('🔄 Refreshing Desty access token');

      const tokenInfo = tokenService.getTokenInfo('desty');
      
      if (!tokenInfo || !tokenInfo.refresh_token) {
        return res.status(400).json({ 
          error: 'No refresh token available - please re-authorize' 
        });
      }

      const refreshParams = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: tokenInfo.refresh_token
      });

      const response = await axios.post(this.tokenUrl, refreshParams, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      const newTokenData = response.data;

      // Add metadata
      newTokenData.marketplace = 'desty';
      newTokenData.created_at = new Date().toISOString();
      newTokenData.expires_at = new Date(Date.now() + (newTokenData.expires_in * 1000)).toISOString();

      // Update stored token
      await tokenService.saveToken('desty', newTokenData);

      console.log('✅ Desty token refreshed successfully');

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        token_info: {
          access_token: '***masked***',
          expires_in: newTokenData.expires_in,
          expires_at: newTokenData.expires_at
        }
      });

    } catch (error) {
      console.error('❌ Token refresh error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // GET /desty/status
  // Get current authentication status
  async getAuthStatus(req, res) {
    try {
      const tokenInfo = tokenService.getTokenInfo('desty');
      
      if (!tokenInfo) {
        return res.json({
          authenticated: false,
          message: 'Not authenticated with Desty'
        });
      }

      const isExpired = tokenInfo.expires_at ? 
        new Date(tokenInfo.expires_at) < new Date() : false;

      res.json({
        authenticated: true,
        store_info: {
          store_id: tokenInfo.store_id,
          store_name: tokenInfo.store_name,
          merchant_id: tokenInfo.merchant_id
        },
        token_info: {
          expires_at: tokenInfo.expires_at,
          is_expired: isExpired,
          has_refresh_token: !!tokenInfo.refresh_token,
          scope: tokenInfo.scope
        },
        message: isExpired ? 'Token expired - refresh needed' : 'Authentication valid'
      });

    } catch (error) {
      console.error('❌ Auth status error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // POST /desty/revoke
  // Revoke access token
  async revokeToken(req, res) {
    try {
      console.log('🗑️ Revoking Desty access token');

      await tokenService.removeToken('desty');

      res.json({
        success: true,
        message: 'Desty authorization revoked successfully'
      });

    } catch (error) {
      console.error('❌ Token revocation error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // GET /desty/stores
  // Get list of stores for authenticated merchant
  async getStores(req, res) {
    try {
      const tokenInfo = tokenService.getTokenInfo('desty');
      
      if (!tokenInfo || !tokenInfo.access_token) {
        return res.status(401).json({ 
          error: 'Not authenticated with Desty' 
        });
      }

      const response = await axios.get(`${this.apiUrl}/v1/stores`, {
        headers: {
          'Authorization': `Bearer ${tokenInfo.access_token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const stores = response.data;

      res.json({
        success: true,
        stores: stores,
        total: stores.length
      });

    } catch (error) {
      console.error('❌ Get stores error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // POST /desty/api-key
  // Generate or regenerate API key
  async generateApiKey(req, res) {
    try {
      const tokenInfo = tokenService.getTokenInfo('desty');
      
      if (!tokenInfo || !tokenInfo.access_token) {
        return res.status(401).json({ 
          error: 'Not authenticated with Desty' 
        });
      }

      const response = await axios.post(`${this.apiUrl}/v1/api-keys/generate`, {}, {
        headers: {
          'Authorization': `Bearer ${tokenInfo.access_token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const apiKeyData = response.data;

      res.json({
        success: true,
        api_key: apiKeyData.api_key,
        expires_at: apiKeyData.expires_at,
        permissions: apiKeyData.permissions
      });

    } catch (error) {
      console.error('❌ Generate API key error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new DestyAuthController();
