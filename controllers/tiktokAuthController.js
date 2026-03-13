// controllers/tiktokAuthController.js
// TikTok Shop OAuth authentication controller

const crypto = require('crypto');
const axios = require('axios');
const tokenService = require('../services/tokenService');

class TiktokAuthController {
  constructor() {
    this.appId = process.env.TIKTOK_APP_ID;
    this.appSecret = process.env.TIKTOK_APP_SECRET;
    this.redirectUri = process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3000/tiktok/callback';
    this.baseAuthUrl = 'https://auth.tiktok-shops.com/oauth2/authorize';
    this.tokenUrl = 'https://auth.tiktok-shops.com/oauth2/access_token';
  }

  // GET /tiktok/authorize
  // Initiate OAuth flow for TikTok Shop
  async authorize(req, res) {
    try {
      console.log('🔐 Initiating TikTok Shop OAuth authorization');

      if (!this.appId) {
        return res.status(500).json({ 
          error: 'TikTok App ID not configured' 
        });
      }

      // Generate state parameter for security
      const state = crypto.randomBytes(16).toString('hex');
      
      // Store state in session/temp storage for verification
      req.session = req.session || {};
      req.session.tiktok_oauth_state = state;

      // Build authorization URL
      const authParams = new URLSearchParams({
        app_id: this.appId,
        redirect_uri: this.redirectUri,
        response_type: 'code',
        scope: 'orders.read,products.read,inventory.read',
        state: state
      });

      const authUrl = `${this.baseAuthUrl}?${authParams.toString()}`;
      
      console.log(`📤 Redirecting to TikTok OAuth: ${authUrl.substring(0, 100)}...`);

      res.json({
        success: true,
        authorization_url: authUrl,
        state: state,
        message: 'Visit the authorization URL to grant access to your TikTok Shop'
      });

    } catch (error) {
      console.error('❌ TikTok authorization error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // GET /tiktok/callback
  // Handle OAuth callback from TikTok Shop
  async callback(req, res) {
    try {
      console.log('📥 TikTok OAuth callback received');

      const { code, state, error } = req.query;

      // Handle OAuth errors
      if (error) {
        console.error('❌ TikTok OAuth error:', error);
        return res.status(400).json({ 
          error: 'OAuth authorization failed',
          details: error 
        });
      }

      // Verify state parameter
      if (!state || state !== (req.session?.tiktok_oauth_state)) {
        console.error('❌ Invalid state parameter in OAuth callback');
        return res.status(400).json({ 
          error: 'Invalid state parameter - CSRF protection failed' 
        });
      }

      // Clear state from session
      if (req.session) {
        delete req.session.tiktok_oauth_state;
      }

      if (!code) {
        return res.status(400).json({ 
          error: 'Authorization code not received' 
        });
      }

      // Exchange authorization code for access token
      const tokenData = await this.exchangeCodeForToken(code);
      
      console.log('✅ TikTok OAuth token exchange successful');

      // Store token securely
      await tokenService.saveToken('tiktok', tokenData);

      res.json({
        success: true,
        message: 'TikTok Shop authorization successful',
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
      console.error('❌ TikTok OAuth callback error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // POST /tiktok/token
  // Exchange authorization code for access token
  async exchangeCodeForToken(code) {
    try {
      console.log('🔄 Exchanging authorization code for access token');

      const tokenParams = {
        grant_type: 'authorization_code',
        app_id: this.appId,
        app_secret: this.appSecret,
        redirect_uri: this.redirectUri,
        code: code
      };

      const response = await axios.post(this.tokenUrl, tokenParams, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      });

      const tokenData = response.data;

      // Validate token response
      if (!tokenData.access_token) {
        throw new Error('No access token received from TikTok');
      }

      // Add metadata
      tokenData.marketplace = 'tiktok';
      tokenData.created_at = new Date().toISOString();
      tokenData.expires_at = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

      console.log(`✅ Token received for shop: ${tokenData.shop_id || 'unknown'}`);

      return tokenData;

    } catch (error) {
      console.error('❌ Token exchange error:', error.message);
      
      if (error.response) {
        console.error('❌ TikTok API response:', error.response.data);
        throw new Error(`TikTok API error: ${error.response.data.message || error.response.statusText}`);
      }
      
      throw error;
    }
  }

  // POST /tiktok/refresh
  // Refresh access token using refresh token
  async refreshToken(req, res) {
    try {
      console.log('🔄 Refreshing TikTok access token');

      const tokenInfo = tokenService.getTokenInfo('tiktok');
      
      if (!tokenInfo || !tokenInfo.refresh_token) {
        return res.status(400).json({ 
          error: 'No refresh token available - please re-authorize' 
        });
      }

      const refreshParams = {
        grant_type: 'refresh_token',
        app_id: this.appId,
        app_secret: this.appSecret,
        refresh_token: tokenInfo.refresh_token
      };

      const response = await axios.post(this.tokenUrl, refreshParams, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      });

      const newTokenData = response.data;

      // Add metadata
      newTokenData.marketplace = 'tiktok';
      newTokenData.created_at = new Date().toISOString();
      newTokenData.expires_at = new Date(Date.now() + (newTokenData.expires_in * 1000)).toISOString();

      // Update stored token
      await tokenService.saveToken('tiktok', newTokenData);

      console.log('✅ TikTok token refreshed successfully');

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

  // GET /tiktok/status
  // Get current authentication status
  async getAuthStatus(req, res) {
    try {
      const tokenInfo = tokenService.getTokenInfo('tiktok');
      
      if (!tokenInfo) {
        return res.json({
          authenticated: false,
          message: 'Not authenticated with TikTok Shop'
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

  // POST /tiktok/revoke
  // Revoke access token
  async revokeToken(req, res) {
    try {
      console.log('🗑️ Revoking TikTok access token');

      await tokenService.removeToken('tiktok');

      res.json({
        success: true,
        message: 'TikTok Shop authorization revoked successfully'
      });

    } catch (error) {
      console.error('❌ Token revocation error:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new TiktokAuthController();
