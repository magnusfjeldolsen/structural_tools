/**
 * Cookie Consent Management for Structural Engineering Tools
 * Handles GDPR-compliant cookie consent with Google Analytics integration
 */

class CookieConsent {
  constructor(options = {}) {
    this.options = {
      cookieName: 'cookie-consent',
      expiryDays: 365,
      autoShow: true,
      enableAnalytics: true,
      ...options
    };
    
    this.consentBanner = null;
    this.hasConsent = false;
    this.consentType = null;
    
    this.init();
  }

  init() {
    // Check existing consent
    this.checkExistingConsent();
    
    // Initialize banner if needed
    if (this.options.autoShow && !this.hasConsent) {
      this.showConsentBanner();
    }
    
    // Set up event listeners
    this.setupEventListeners();
  }

  checkExistingConsent() {
    const consent = getCookie(this.options.cookieName);
    if (consent) {
      this.hasConsent = true;
      this.consentType = consent;
      
      // Enable analytics if user previously accepted
      if (consent === 'accepted' && this.options.enableAnalytics) {
        this.enableGoogleAnalytics();
      }
    }
  }

  showConsentBanner() {
    // Create banner if it doesn't exist
    if (!this.consentBanner) {
      this.createConsentBanner();
    }
    
    // Show the banner
    if (this.consentBanner) {
      this.consentBanner.classList.remove('hidden');
      this.consentBanner.style.display = 'flex';
    }
  }

  hideConsentBanner() {
    if (this.consentBanner) {
      this.consentBanner.classList.add('hidden');
      this.consentBanner.style.display = 'none';
    }
  }

  createConsentBanner() {
    // Check if banner already exists in DOM
    this.consentBanner = document.getElementById('cookie-consent');
    
    if (!this.consentBanner) {
      // Create banner HTML
      const bannerHTML = `
        <div id="cookie-consent" class="fixed inset-0 bg-black bg-opacity-90 text-white flex flex-col items-center justify-center z-50 p-6 hidden">
          <div class="bg-gray-800 rounded-xl p-8 max-w-md text-center border border-gray-600">
            <h3 class="text-xl font-semibold mb-4">Cookie Settings</h3>
            <p class="text-gray-300 mb-6">
              We use cookies and Google Analytics to understand how you use our structural engineering tools and improve your experience.
            </p>
            <div class="flex flex-col gap-3">
              <button id="accept-cookies" class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition font-semibold">
                Accept All Cookies
              </button>
              <button id="accept-essential" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition font-semibold">
                Essential Only
              </button>
              <button id="decline-cookies" class="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition">
                Decline All
              </button>
            </div>
            <p class="text-xs text-gray-400 mt-4">
              You can change these settings anytime using the "Cookie Settings" link in the footer.
            </p>
          </div>
        </div>
      `;
      
      // Add to body
      document.body.insertAdjacentHTML('beforeend', bannerHTML);
      this.consentBanner = document.getElementById('cookie-consent');
    }
  }

  setupEventListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.id === 'accept-cookies') {
        this.handleAcceptAll();
      } else if (e.target.id === 'accept-essential') {
        this.handleAcceptEssential();
      } else if (e.target.id === 'decline-cookies') {
        this.handleDeclineAll();
      }
      
      // Handle cookie settings link clicks
      if (e.target.textContent === 'Cookie Settings' || 
          e.target.getAttribute('data-action') === 'cookie-settings') {
        e.preventDefault();
        this.showConsentBanner();
      }
    });
  }

  handleAcceptAll() {
    this.setConsent('accepted');
    if (this.options.enableAnalytics) {
      this.enableGoogleAnalytics();
    }
    this.hideConsentBanner();
    this.onConsentChange('accepted');
  }

  handleAcceptEssential() {
    this.setConsent('essential');
    this.hideConsentBanner();
    this.onConsentChange('essential');
  }

  handleDeclineAll() {
    this.setConsent('declined');
    this.hideConsentBanner();
    this.onConsentChange('declined');
  }

  setConsent(type) {
    this.hasConsent = true;
    this.consentType = type;
    setCookie(this.options.cookieName, type, this.options.expiryDays);
  }

  enableGoogleAnalytics() {
    if (typeof gtag === 'function') {
      // Enable analytics storage and initialize tracking
      gtag('consent', 'update', {
        'analytics_storage': 'granted'
      });
      
      // Initialize GA if measurement ID is available
      const measurementId = this.getGoogleAnalyticsMeasurementId();
      if (measurementId && measurementId !== 'GA_MEASUREMENT_ID') {
        gtag('config', measurementId);
        console.log('Google Analytics enabled with consent');
      }
    }
  }

  getGoogleAnalyticsMeasurementId() {
    // Try to extract GA measurement ID from existing script tags
    const scripts = document.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]');
    for (const script of scripts) {
      const match = script.src.match(/id=([^&]+)/);
      if (match) {
        return match[1];
      }
    }
    
    // Fallback: look for GA_MEASUREMENT_ID placeholder
    const allScripts = document.querySelectorAll('script');
    for (const script of allScripts) {
      if (script.textContent.includes('GA_MEASUREMENT_ID')) {
        const match = script.textContent.match(/['"]([G]-[A-Z0-9]+)['"]/);
        if (match) {
          return match[1];
        }
      }
    }
    
    return 'GA_MEASUREMENT_ID'; // Placeholder
  }

  // Callback for when consent changes
  onConsentChange(consentType) {
    // Dispatch custom event
    const event = new CustomEvent('cookieConsentChange', {
      detail: { consentType }
    });
    document.dispatchEvent(event);
    
    console.log(`Cookie consent: ${consentType}`);
  }

  // Public methods
  getConsentType() {
    return this.consentType;
  }

  hasAnalyticsConsent() {
    return this.consentType === 'accepted';
  }

  revokeConsent() {
    deleteCookie(this.options.cookieName);
    this.hasConsent = false;
    this.consentType = null;
    
    // Disable analytics
    if (typeof gtag === 'function') {
      gtag('consent', 'update', {
        'analytics_storage': 'denied'
      });
    }
    
    this.showConsentBanner();
    this.onConsentChange('revoked');
  }

  // Static method to create instance
  static create(options = {}) {
    return new CookieConsent(options);
  }
}

// Auto-initialize cookie consent when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Only initialize on the main landing page
  if (window.location.pathname.endsWith('/') || 
      window.location.pathname.endsWith('/index.html') ||
      window.location.pathname === '/structural_tools/' ||
      window.location.pathname === '/structural_tools/index.html') {
    
    window.cookieConsent = CookieConsent.create({
      enableAnalytics: true,
      autoShow: true
    });
    
    console.log('Cookie consent initialized');
  }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CookieConsent;
}