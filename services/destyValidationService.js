// services/destyValidationService.js
// Desty-specific validation service

const { PAYMENT_METHOD_MAPPING } = require('../config');
const destyOdooService = require('./destyOdooService');

class DestyValidationService {
  constructor() {
    this.odooService = destyOdooService;
  }

  // Validate complete order structure
  async validateOrder(order) {
    const errors = [];
    const warnings = [];

    // Required fields validation
    if (!order.order_sn) errors.push('Order number is required');
    if (!order.buyer_username) errors.push('Customer name is required');
    if (!order.items || order.items.length === 0) errors.push('Order items are required');
    if (!order.shop_id) errors.push('Shop ID is required');

    // Email validation
    if (order.buyer_email && !this.isValidEmail(order.buyer_email)) {
      warnings.push('Invalid customer email format');
    }

    // Phone validation
    if (order.buyer_phone && !this.isValidPhone(order.buyer_phone)) {
      warnings.push('Invalid customer phone format');
    }

    // Address validation
    if (order.shipping_address) {
      if (!order.shipping_address.address) errors.push('Shipping address is required');
      if (!order.shipping_address.city) warnings.push('Shipping city is missing');
      if (!order.shipping_address.postal_code) warnings.push('Shipping postal code is missing');
    }

    // Items validation
    const itemValidation = await this.validateItems(order.items);
    errors.push(...itemValidation.errors);
    warnings.push(...itemValidation.warnings);

    // Payment validation
    if (order.payment_status === 'paid' && !order.payment_method) {
      warnings.push('Payment method not specified for paid order');
    }

    // Total amount validation
    if (order.total_amount && order.items) {
      const calculatedTotal = this.calculateTotal(order.items);
      const variance = Math.abs(order.total_amount - calculatedTotal) / calculatedTotal * 100;
      
      if (variance > 5) {
        warnings.push(`Total amount variance detected (Calculated: ${calculatedTotal}, Provided: ${order.total_amount})`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      canProceed: errors.length === 0,
      validationSummary: {
        totalErrors: errors.length,
        totalWarnings: warnings.length,
        itemsValidated: order.items?.length || 0
      }
    };
  }

  // Validate order items
  async validateItems(items) {

    console.log(" Validate order items :",JSON.stringify(items,2,null));
    const errors = [];
    const warnings = [];

    for (const [index, item] of items.entries()) {
      // Required fields
      if (!item.sku) errors.push(`Item ${index + 1}: SKU is required`);
      if (!item.name) errors.push(`Item ${index + 1}: Product name is required`);
      if (!item.qty || item.qty <= 0) errors.push(`Item ${index + 1}: Valid quantity is required`);
      if (!item.price || item.price <= 0) errors.push(`Item ${index + 1}: Valid price is required`);

      // Check product existence in Odoo
      if (item.sku) {
        try {
          const product = await this.checkProductExists(item.sku);
          if (!product) {
            errors.push(`Item ${index + 1}: Product ${item.sku} not found in Odoo`);
          } else {
            // Check stock
            const stock = await this.checkProductStock(item.sku);
            if (stock < item.qty) {
              warnings.push(`Item ${index + 1}: Insufficient stock for ${item.sku} (Available: ${stock}, Required: ${item.qty})`);
            }

            // Check price variance
            const priceDiff = Math.abs(product.list_price - item.price) / product.list_price * 100;
            if (priceDiff > 10) {
              warnings.push(`Item ${index + 1}: Price variance detected for ${item.sku} (Odoo: ${product.list_price}, Desty: ${item.price})`);
            }

            // Check if product is saleable
            if (!product.sale_ok) {
              errors.push(`Item ${index + 1}: Product ${item.sku} is not available for sale`);
            }
          }
        } catch (error) {
          errors.push(`Item ${index + 1}: Error validating product ${item.sku}: ${error.message}`);
        }
      }

      // Validate quantity
      if (item.qty && item.qty > 1000) {
        warnings.push(`Item ${index + 1}: Large quantity detected for ${item.sku} (${item.qty} units)`);
      }

      // Validate price
      if (item.price && (item.price < 100 || item.price > 10000000)) {
        warnings.push(`Item ${index + 1}: Unusual price detected for ${item.sku} (IDR ${item.price})`);
      }
    }

    return { errors, warnings };
  }

  // Check if product exists in Odoo
  async checkProductExists(sku) {
    try {
      return await this.odooService.checkProductSKU(sku);
    } catch (error) {
      console.warn('⚠️ Could not check product existence for', sku, error.message);
      return null;
    }
  }

  // Check product stock
  async checkProductStock(sku) {
    try {
      return await this.odooService.checkProductStock(sku);
    } catch (error) {
      console.warn('⚠️ Could not check stock for', sku, error.message);
      return 0;
    }
  }

  // Validate email format
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate phone format (Indonesian phone numbers)
  isValidPhone(phone) {
    // Remove common prefixes and spaces
    const cleanPhone = phone.replace(/^(\+62|62|0)/, '').replace(/\s|-/g, '');
    
    // Indonesian phone numbers are 9-13 digits
    const phoneRegex = /^[0-9]{9,13}$/;
    return phoneRegex.test(cleanPhone);
  }

  // Calculate total amount
  calculateTotal(items) {
    if (!items || items.length === 0) return 0;
    
    return items.reduce((total, item) => {
      const price = item.price || 0;
      const quantity = item.qty || 0;
      return total + (price * quantity);
    }, 0);
  }

  // Validate customer data
  async validateCustomer(order) {
    const errors = [];
    const warnings = [];

    // Name validation
    if (!order.buyer_username || order.buyer_username.trim().length < 2) {
      errors.push('Customer name must be at least 2 characters');
    }

    // Email validation
    if (order.buyer_email) {
      if (!this.isValidEmail(order.buyer_email)) {
        errors.push('Invalid customer email format');
      }
    } else {
      warnings.push('Customer email not provided');
    }

    // Phone validation
    if (order.buyer_phone) {
      if (!this.isValidPhone(order.buyer_phone)) {
        errors.push('Invalid customer phone format');
      }
    } else {
      warnings.push('Customer phone not provided');
    }

    // Address validation
    if (order.shipping_address) {
      if (!order.shipping_address.address || order.shipping_address.address.trim().length < 5) {
        errors.push('Shipping address must be at least 5 characters');
      }

      if (!order.shipping_address.city || order.shipping_address.city.trim().length < 2) {
        warnings.push('Shipping city should be provided');
      }

      if (!order.shipping_address.postal_code) {
        warnings.push('Shipping postal code not provided');
      } else if (!/^[0-9]{5}$/.test(order.shipping_address.postal_code)) {
        warnings.push('Indonesian postal code should be 5 digits');
      }
    } else {
      errors.push('Shipping address is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Validate payment information
  async validatePayment(order) {
    const errors = [];
    const warnings = [];

    // Payment status validation
    const validStatuses = ['pending', 'paid', 'failed', 'cancelled', 'refunded'];
    if (order.payment_status && !validStatuses.includes(order.payment_status)) {
      warnings.push(`Unknown payment status: ${order.payment_status}`);
    }

    // Payment method validation using config mapping
    // Check and map payment method
    if (order.payment_method) {
      const normalizedMethod = PAYMENT_METHOD_MAPPING[order.payment_method];
      if (normalizedMethod) {
        // Valid payment method found, no warning
        console.log(`✅ Payment method mapped: ${order.payment_method} -> ${normalizedMethod}`);
      } else {
        warnings.push(`Unknown payment method: ${order.payment_method}`);
      }
    }

    // Amount validation
    if (order.total_amount) {
      if (order.total_amount <= 0) {
        errors.push('Total amount must be greater than 0');
      }

      if (order.total_amount > 100000000) { // 100 million
        warnings.push('Very large order amount detected');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Validate shipping information
  async validateShipping(order) {
    const errors = [];
    const warnings = [];

    console.log(`🔍 Validating shipping for order: ${order.order_sn}`);
    console.log(`🔍 Shipping address data:`, JSON.stringify(order.shipping_address, null, 2));

    // Shipping status validation
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (order.shipping_status && !validStatuses.includes(order.shipping_status)) {
      warnings.push(`Unknown shipping status: ${order.shipping_status}`);
    }

    // Shipping method validation
    const validMethods = ['regular', 'express', 'same_day', 'pickup'];
    if (order.shipping_method && !validMethods.includes(order.shipping_method)) {
      warnings.push(`Unknown shipping method: ${order.shipping_method}`);
    }

    // Tracking number validation
    if (order.tracking_number) {
      if (order.tracking_number.length < 5) {
        warnings.push('Tracking number seems too short');
      }
    }

    // Address validation - check if shipping address exists and has required fields
    if (order.shipping_address) {
      const address = order.shipping_address;
      
      // Check city
      if (!address.city || address.city.trim().length < 2) {
        warnings.push('Shipping city should be provided');
      } else {
        console.log(`✅ Shipping city found: ${address.city}`);
      }
      
      // Check postal code
      if (!address.postal_code || address.postal_code.trim().length === 0) {
        warnings.push('Shipping postal code not provided');
      } else {
        console.log(`✅ Shipping postal code found: ${address.postal_code}`);
      }
      
      // Check full address
      if (!address.address || address.address.trim().length < 5) {
        errors.push('Shipping address must be at least 5 characters');
      } else {
        console.log(`✅ Shipping address found: ${address.address.substring(0, 50)}...`);
      }
      
      // Check postal code format (Indonesian postal codes are 5 digits)
      if (address.postal_code && !/^[0-9]{5}$/.test(address.postal_code)) {
        warnings.push('Indonesian postal code should be 5 digits');
      }
    } else {
      errors.push('Shipping address is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Comprehensive order validation
  async validateCompleteOrder(order) {
    console.log(`🔍 Validating complete Desty order: ${order.order_sn}`);
    const customerValidation = await this.validateCustomer(order);
    console.log(`🔍 customerValidation : ${JSON.stringify(customerValidation,null,2)}`);

    console.log(`🔍 itemValidation  : ${JSON.stringify(order.items,null,2)}`);
    const itemValidation = await this.validateItems(order.items);
    console.log(`🔍 itemValidation Result  : ${JSON.stringify(itemValidation,null,2)}`);
``
    const paymentValidation = await this.validatePayment(order);
    console.log(`🔍 itemVapaymentValidationlidation  : ${JSON.stringify(paymentValidation,null,2)}`);
    
    const shippingValidation = await this.validateShipping(order);
    console.log(`🔍 shippingValidation  : ${JSON.stringify(shippingValidation,null,2)}`);

    const allErrors = [
      ...customerValidation.errors,
      ...itemValidation.errors,
      ...paymentValidation.errors,
      ...shippingValidation.errors
    ];

    const allWarnings = [
      ...customerValidation.warnings,
      ...itemValidation.warnings,
      ...paymentValidation.warnings,
      ...shippingValidation.warnings
    ];

    const result = {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      canProceed: allErrors.length === 0,
      validationDetails: {
        customer: customerValidation,
        items: itemValidation,
        payment: paymentValidation,
        shipping: shippingValidation
      },
      summary: {
        totalErrors: allErrors.length,
        totalWarnings: allWarnings.length,
        itemsValidated: order.items?.length || 0,
        customerProvided: !!order.buyer_username,
        paymentProvided: !!order.payment_method,
        shippingProvided: !!order.shipping_address
      }
    };

    console.log(`✅ Order validation completed: ${result.isValid ? 'VALID' : 'INVALID'} (${result.summary.totalErrors} errors, ${result.summary.totalWarnings} warnings)`);
    console.log(`✅ Vlidation result: (${JSON.stringify(result.summary,null,2)}`);

    return result;
  }
}

module.exports = new DestyValidationService();
