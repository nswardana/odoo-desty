// controllers/tokopediaAuthController.js
// Tokopedia OAuth authentication controller

const crypto = require('crypto');
const axios = require('axios');
const tokenService = require('../services/tokenService');

class TokopediaAuthController {
  constructor() {
    this.clientId = process.env.TOKOPEDIA_CLIENT_ID;
    this.clientSecret = process.env.TOKOPEDIA_CLIENT_SECRET;
    this.redirectUri = process.env.TOKOPEDIA_REDIRECT_URI || 'http://localhost:3000/tokopedia/callback';
    this.baseAuthUrl = 'https://accounts.tokopedia.com/authorize';
    this.tokenUrl = 'https://accounts.tokopedia.com/token';
  }

  // GET /tokopedia/authorize
  // Initiate OAuth flow for Tokopedia
  async authorize(req, res) {
    try {
      console.log('🔐 Initiating Tokopedia OAuth authorization');

      if (!this.clientId) {
        return res.status(500).json({ 
          error: 'Tokopedia Client ID not configured' 
        });
      }

      // Generate state parameter for security
      const state = crypto.randomBytes(16).toString('hex');
      
      // Store state in session/temp storage for verification
      req.session = req.session || {};
      req.session.tokopedia_oauth_state = state;

      // Build authorization URL
      const authParams = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        response_type: 'code',
        scope: 'orders.read products.read inventory.read',
        state: state
      });

      const authUrl = `${this.baseAuthUrl}?${authParams.toString()}`;
      
      console.log(`📤 Redirecting to Tokopedia OAuth: ${authUrl.substring(0, 100)}...`);

      res.json({
        success: true,
        authorization_url: authUrl,
        state: state,
        message: 'Visit the authorization URL to grant access to your Tokopedia shop'
      });

    } catch (error) {
      console.error('❌ Tokopedia authorization error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // GET /tokopedia/callback
  // Handle OAuth callback from Tokopedia
  async callback(req, res) {
    try {
      console.log('📥 Tokopedia OAuth callback received');

      const { code, state, error } = req.query;

      // Handle OAuth errors
      if (error) {
        console.error('❌ Tokopedia OAuth error:', error);
        return res.status(400).json({ 
          error: 'OAuth authorization failed',
          details: error 
        });
      }

      // Verify state parameter
      if (!state || state !== (req.session?.tokopedia_oauth_state)) {
        console.error('❌ Invalid state parameter in OAuth callback');
        return res.status(400).json({ 
          error: 'Invalid state parameter - CSRF protection failed' 
        });
      }

      // Clear state from session
      if (req.session) {
        delete req.session.tokopedia_oauth_state;
      }

      if (!code) {
        return res.status(400).json({ 
          error: 'Authorization code not received' 
        });
      }

      // Exchange authorization code for access token
      const tokenData = await this.exchangeCodeForToken(code);
      
      console.log('✅ Tokopedia OAuth token exchange successful');

      // Store token securely
      await tokenService.saveToken('tokopedia', tokenData);

      res.json({
        success: true,
        message: 'Tokopedia authorization successful',
        shop_info: {
          shop_id: tokenData.shop_id,
          shop_name: tokenData.shop_name,
          seller_id: tokenData.seller_id
        },
        token_info: {
          access_token: tokenData.access_token ? '***masked***' : null,
          refresh_token: tokenData.refresh_token ? '***masked***' : null,
          expires_in: tokenData.expires_in,
          scope: tokenData.scope
        }
      });

    } catch (error) {
      console.error('❌ Tokopedia OAuth callback error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // POST /tokopedia/token
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
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      });

      const tokenData = response.data;

      // Validate token response
      if (!tokenData.access_token) {
        throw new Error('No access token received from Tokopedia');
      }

      // Add metadata
      tokenData.marketplace = 'tokopedia';
      tokenData.created_at = new Date().toISOString();
      tokenData.expires_at = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

      console.log(`✅ Token received for shop: ${tokenData.shop_id || 'unknown'}`);

      return tokenData;

    } catch (error) {
      console.error('❌ Token exchange error:', error.message);
      
      if (error.response) {
        console.error('❌ Tokopedia API response:', error.response.data);
        throw new Error(`Tokopedia API error: ${error.response.data.message || error.response.statusText}`);
      }
      
      throw error;
    }
  }

  // POST /tokopedia/refresh
  // Refresh access token using refresh token
  async refreshToken(req, res) {
    try {
      console.log('🔄 Refreshing Tokopedia access token');

      const tokenInfo = tokenService.getTokenInfo('tokopedia');
      
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
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      });

      const newTokenData = response.data;

      // Add metadata
      newTokenData.marketplace = 'tokopedia';
      newTokenData.created_at = new Date().toISOString();
      newTokenData.expires_at = new Date(Date.now() + (newTokenData.expires_in * 1000)).toISOString();

      // Update stored token
      await tokenService.saveToken('tokopedia', newTokenData);

      console.log('✅ Tokopedia token refreshed successfully');

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

  // GET /tokopedia/status
  // Get current authentication status
  async getAuthStatus(req, res) {
    try {
      const tokenInfo = tokenService.getTokenInfo('tokopedia');
      
      if (!tokenInfo) {
        return res.json({
          authenticated: false,
          message: 'Not authenticated with Tokopedia'
        });
      }

      const isExpired = tokenInfo.expires_at ? 
        new Date(tokenInfo.expires_at) < new Date() : false;

      res.json({
        authenticated: true,
        shop_info: {
          shop_id: tokenInfo.shop_id,
          shop_name: tokenInfo.shop_name,
          seller_id: tokenInfo.seller_id
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

  // POST /tokopedia/revoke
  // Revoke access token
  async revokeToken(req, res) {
    try {
      console.log('🗑️ Revoking Tokopedia access token');

      await tokenService.removeToken('tokopedia');

      res.json({
        success: true,
        message: 'Tokopedia authorization revoked successfully'
      });

    } catch (error) {
      console.error('❌ Token revocation error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new TokopediaAuthController();
