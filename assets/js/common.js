/**
 * Common JavaScript utilities for Structural Engineering Tools
 * Shared functions and utilities used across all calculators
 */

// Cookie management utilities
function getCookie(name) {
  const value = "; " + document.cookie;
  const parts = value.split("; " + name + "=");
  if (parts.length == 2) return parts.pop().split(";").shift();
  return null;
}

function setCookie(name, value, days = 365) {
  const maxAge = days * 24 * 60 * 60; // Convert days to seconds
  document.cookie = `${name}=${value}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

function deleteCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

// Number formatting utilities
function toFixedIfNeeded(num, digits = 2) {
  if (typeof num !== 'number' || isNaN(num)) {
    return '0.00';
  }
  return num.toFixed(digits);
}

function formatNumber(num, decimals = 2) {
  if (typeof num !== 'number' || isNaN(num)) {
    return '0';
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num);
}

function parseNumberInput(value) {
  if (typeof value === 'string') {
    // Handle mathematical expressions like "1/0.008"
    try {
      // Simple expression evaluation (only basic math operations)
      const sanitized = value.replace(/[^0-9+\-*/().\s]/g, '');
      if (sanitized !== value) {
        console.warn('Invalid characters removed from input:', value);
      }
      return Function(`"use strict"; return (${sanitized})`)();
    } catch (e) {
      console.warn('Could not evaluate expression:', value);
      return parseFloat(value) || 0;
    }
  }
  return parseFloat(value) || 0;
}

// DOM utilities
function showElement(element) {
  if (typeof element === 'string') {
    element = document.getElementById(element);
  }
  if (element) {
    element.style.display = 'block';
    element.classList.remove('hidden');
  }
}

function hideElement(element) {
  if (typeof element === 'string') {
    element = document.getElementById(element);
  }
  if (element) {
    element.style.display = 'none';
    element.classList.add('hidden');
  }
}

function toggleElement(element) {
  if (typeof element === 'string') {
    element = document.getElementById(element);
  }
  if (element) {
    if (element.style.display === 'none' || element.classList.contains('hidden')) {
      showElement(element);
    } else {
      hideElement(element);
    }
  }
}

// Smooth scrolling utility
function smoothScrollTo(element, offset = 0) {
  if (typeof element === 'string') {
    element = document.getElementById(element);
  }
  if (element) {
    const elementPosition = element.offsetTop + offset;
    window.scrollTo({
      top: elementPosition,
      behavior: 'smooth'
    });
  }
}

// Form validation utilities
function validateRequired(value) {
  return value !== null && value !== undefined && value !== '';
}

function validateNumber(value, min = null, max = null) {
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  if (min !== null && num < min) return false;
  if (max !== null && num > max) return false;
  return true;
}

function validatePositive(value) {
  return validateNumber(value, 0.001); // Must be positive
}

function showValidationError(elementId, message) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.add('error');
    
    // Remove existing error message
    const existingError = element.parentNode.querySelector('.error-message');
    if (existingError) {
      existingError.remove();
    }
    
    // Add new error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    element.parentNode.appendChild(errorDiv);
  }
}

function clearValidationError(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.remove('error', 'success');
    const errorMessage = element.parentNode.querySelector('.error-message');
    if (errorMessage) {
      errorMessage.remove();
    }
  }
}

// Print utilities
function preparePrintValues(inputIds) {
  inputIds.forEach(id => {
    const input = document.getElementById(id);
    const printElement = document.getElementById(id + '-print');
    if (input && printElement) {
      printElement.textContent = input.value;
    }
  });
}

// Loading state management
function showLoading(elementId, message = 'Calculating...') {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = `
      <div class="flex items-center justify-center p-8">
        <div class="loading-spinner"></div>
        <span class="loading-text ml-3">${message}</span>
      </div>
    `;
  }
}

function hideLoading(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = '';
  }
}

// Event utilities
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// URL utilities
function updateURLParameter(param, value) {
  const url = new URL(window.location);
  url.searchParams.set(param, value);
  window.history.replaceState({}, '', url);
}

function getURLParameter(param) {
  const url = new URL(window.location);
  return url.searchParams.get(param);
}

// Browser detection utilities
function isMobile() {
  return window.innerWidth <= 768;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

// Initialize common functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Add smooth scrolling to internal links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        smoothScrollTo(target, -20); // 20px offset from top
      }
    });
  });

  // Add focus management for better accessibility
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      document.body.classList.add('keyboard-navigation');
    }
  });

  document.addEventListener('mousedown', function() {
    document.body.classList.remove('keyboard-navigation');
  });

  console.log('Common utilities loaded');
});

// Export utilities for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getCookie,
    setCookie,
    deleteCookie,
    toFixedIfNeeded,
    formatNumber,
    parseNumberInput,
    showElement,
    hideElement,
    toggleElement,
    smoothScrollTo,
    validateRequired,
    validateNumber,
    validatePositive,
    showValidationError,
    clearValidationError,
    preparePrintValues,
    showLoading,
    hideLoading,
    debounce,
    throttle,
    updateURLParameter,
    getURLParameter,
    isMobile,
    isIOS,
    isSafari
  };
}