/**
 * Google Analytics Integration for Structural Engineering Tools
 * GDPR-compliant analytics with consent management
 */

class Analytics {
  constructor(measurementId = 'GA_MEASUREMENT_ID') {
    this.measurementId = measurementId;
    this.isInitialized = false;
    this.hasConsent = false;
    
    this.init();
  }

  init() {
    // Load Google Analytics script
    this.loadGoogleAnalytics();
    
    // Initialize with consent disabled by default
    this.initializeWithoutConsent();
    
    // Listen for consent changes
    this.setupConsentListener();
  }

  loadGoogleAnalytics() {
    if (this.measurementId === 'GA_MEASUREMENT_ID') {
      console.warn('Google Analytics: Please replace GA_MEASUREMENT_ID with your actual measurement ID');
      return;
    }

    // Check if GA script is already loaded
    if (document.querySelector(`script[src*="${this.measurementId}"]`)) {
      console.log('Google Analytics script already loaded');
      return;
    }

    // Load Google Analytics script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this.measurementId}`;
    document.head.appendChild(script);

    // Initialize gtag function
    window.dataLayer = window.dataLayer || [];
    window.gtag = function() {
      dataLayer.push(arguments);
    };
    
    console.log('Google Analytics script loaded');
  }

  initializeWithoutConsent() {
    if (typeof gtag !== 'function') {
      // Wait for gtag to be available
      setTimeout(() => this.initializeWithoutConsent(), 100);
      return;
    }

    gtag('js', new Date());
    
    // Set default consent to denied
    gtag('consent', 'default', {
      'analytics_storage': 'denied',
      'ad_storage': 'denied'
    });

    this.isInitialized = true;
    console.log('Google Analytics initialized without consent');
  }

  enableTracking() {
    if (!this.isInitialized || typeof gtag !== 'function') {
      console.warn('Google Analytics not initialized');
      return;
    }

    if (this.measurementId === 'GA_MEASUREMENT_ID') {
      console.warn('Cannot enable tracking: Invalid measurement ID');
      return;
    }

    // Grant consent for analytics
    gtag('consent', 'update', {
      'analytics_storage': 'granted'
    });

    // Configure GA with measurement ID
    gtag('config', this.measurementId, {
      'anonymize_ip': true,
      'respect_dnt': true,
      'allow_google_signals': false,
      'allow_ad_personalization_signals': false
    });

    this.hasConsent = true;
    console.log('Google Analytics tracking enabled');
  }

  disableTracking() {
    if (typeof gtag !== 'function') {
      return;
    }

    // Revoke consent
    gtag('consent', 'update', {
      'analytics_storage': 'denied',
      'ad_storage': 'denied'
    });

    this.hasConsent = false;
    console.log('Google Analytics tracking disabled');
  }

  setupConsentListener() {
    document.addEventListener('cookieConsentChange', (event) => {
      const { consentType } = event.detail;
      
      if (consentType === 'accepted') {
        this.enableTracking();
      } else {
        this.disableTracking();
      }
    });
  }

  // Custom event tracking
  trackEvent(eventName, parameters = {}) {
    if (!this.hasConsent || typeof gtag !== 'function') {
      console.log('Analytics tracking disabled - event not sent:', eventName);
      return;
    }

    gtag('event', eventName, {
      'event_category': parameters.category || 'engagement',
      'event_label': parameters.label || '',
      'value': parameters.value || 0,
      'custom_parameter_1': parameters.tool || '',
      'custom_parameter_2': parameters.action || '',
      ...parameters
    });

    console.log('Analytics event tracked:', eventName, parameters);
  }

  // Track calculator usage
  trackCalculatorUsage(calculatorName, action = 'calculate') {
    this.trackEvent('calculator_usage', {
      category: 'calculator',
      tool: calculatorName,
      action: action,
      label: `${calculatorName}_${action}`
    });
  }

  // Track page views (for SPA navigation)
  trackPageView(pagePath, pageTitle = document.title) {
    if (!this.hasConsent || typeof gtag !== 'function') {
      return;
    }

    gtag('config', this.measurementId, {
      page_path: pagePath,
      page_title: pageTitle
    });

    console.log('Analytics page view tracked:', pagePath);
  }

  // Track file downloads
  trackDownload(fileName, fileType = '') {
    this.trackEvent('file_download', {
      category: 'downloads',
      label: fileName,
      file_type: fileType
    });
  }

  // Track form submissions
  trackFormSubmission(formName, success = true) {
    this.trackEvent('form_submission', {
      category: 'forms',
      label: formName,
      action: success ? 'success' : 'error'
    });
  }

  // Track external link clicks
  trackExternalLink(url, linkText = '') {
    this.trackEvent('external_link_click', {
      category: 'outbound',
      label: url,
      link_text: linkText
    });
  }

  // Track print actions
  trackPrint(contentType = 'results') {
    this.trackEvent('print_action', {
      category: 'engagement',
      label: contentType,
      action: 'print'
    });
  }

  // Track errors
  trackError(errorType, errorMessage = '', page = window.location.pathname) {
    this.trackEvent('error', {
      category: 'errors',
      label: errorType,
      error_message: errorMessage,
      page: page
    });
  }

  // Get tracking status
  isTrackingEnabled() {
    return this.hasConsent;
  }

  // Static method to create instance
  static create(measurementId = 'GA_MEASUREMENT_ID') {
    return new Analytics(measurementId);
  }
}

// Auto-initialize analytics
document.addEventListener('DOMContentLoaded', function() {
  // Extract measurement ID from script tags or use placeholder
  let measurementId = 'GA_MEASUREMENT_ID';
  
  // Try to find measurement ID in existing script tags
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    if (script.textContent.includes('gtag/js?id=')) {
      const match = script.src ? script.src.match(/id=([^&]+)/) : null;
      if (match) {
        measurementId = match[1];
        break;
      }
    }
    
    // Check for inline measurement ID
    const inlineMatch = script.textContent.match(/gtag\(['"]config['"],\s*['"]([G]-[A-Z0-9]+)['"]/);
    if (inlineMatch) {
      measurementId = inlineMatch[1];
      break;
    }
  }

  // Initialize analytics
  window.analytics = Analytics.create(measurementId);
  
  // Set up automatic event tracking
  setupAutomaticTracking();
  
  console.log('Analytics initialized');
});

function setupAutomaticTracking() {
  // Track print events
  window.addEventListener('beforeprint', () => {
    if (window.analytics) {
      window.analytics.trackPrint();
    }
  });

  // Track external link clicks
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (link && link.href) {
      const url = new URL(link.href, window.location.origin);
      
      // Check if it's an external link
      if (url.hostname !== window.location.hostname) {
        if (window.analytics) {
          window.analytics.trackExternalLink(link.href, link.textContent.trim());
        }
      }
    }
  });

  // Track form submissions
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form.tagName === 'FORM' && form.id && window.analytics) {
      // Track after a short delay to ensure submission completes
      setTimeout(() => {
        window.analytics.trackFormSubmission(form.id, true);
      }, 100);
    }
  });

  // Track calculator button clicks
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button && window.analytics) {
      const buttonText = button.textContent.trim().toLowerCase();
      
      // Track calculate button clicks
      if (buttonText.includes('calculate') || button.type === 'submit') {
        const calculatorName = getCalculatorName();
        if (calculatorName) {
          window.analytics.trackCalculatorUsage(calculatorName, 'calculate');
        }
      }
      
      // Track print button clicks
      if (buttonText.includes('print')) {
        window.analytics.trackPrint();
      }
    }
  });

  // Track JavaScript errors
  window.addEventListener('error', (event) => {
    if (window.analytics) {
      window.analytics.trackError('javascript_error', event.message, window.location.pathname);
    }
  });
}

function getCalculatorName() {
  // Try to determine calculator name from various sources
  const title = document.title.toLowerCase();
  const path = window.location.pathname;
  
  if (title.includes('steel fire') || path.includes('steel_fire')) {
    return 'steel_fire_temperature';
  } else if (title.includes('concrete slab') || path.includes('concrete_slab')) {
    return 'concrete_slab_design';
  } else if (title.includes('concrete beam') || path.includes('concrete_beam')) {
    return 'concrete_beam_design';
  } else if (title.includes('structural') && path.includes('/')) {
    return 'main_page';
  }
  
  return 'unknown';
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Analytics;
}