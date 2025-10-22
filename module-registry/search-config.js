/**
 * Search Configuration and Logic for Module Discovery
 * Uses Fuse.js for fuzzy search with live autocomplete
 */

// Global variables
let moduleRegistry = null;
let fuseInstance = null;
let searchTimeout = null;

/**
 * Initialize the search system
 */
async function initializeSearch() {
  try {
    // Load module registry
    const response = await fetch('./module-registry/module-registry.json');
    const data = await response.json();
    moduleRegistry = data.modules;

    // Configure Fuse.js for fuzzy search (optimized for speed)
    const fuseOptions = {
      keys: [
        { name: 'title', weight: 0.5 },
        { name: 'description', weight: 0.3 },
        { name: 'keywords', weight: 0.2 }
      ],
      threshold: 0.4, // 0 = exact match, 1 = match anything
      distance: 100,
      minMatchCharLength: 2,
      includeMatches: false, // Disabled for performance (no highlighting)
      includeScore: false,   // Disabled for performance
      ignoreLocation: true,  // Faster matching
      useExtendedSearch: false // Faster, basic search only
    };

    // Initialize Fuse instance
    fuseInstance = new Fuse(moduleRegistry, fuseOptions);

    // Setup event listeners
    setupSearchListeners();

    console.log(`Search initialized with ${moduleRegistry.length} modules`);
  } catch (error) {
    console.error('Failed to initialize search:', error);
  }
}

/**
 * Setup event listeners for search input
 */
function setupSearchListeners() {
  const searchInput = document.getElementById('module-search');
  const searchResults = document.getElementById('search-results');

  if (!searchInput || !searchResults) {
    console.error('Search elements not found in DOM');
    return;
  }

  // Input event with debouncing (100ms delay for faster response)
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();

    // Immediate search for very short queries or empty
    if (query.length < 2) {
      hideResults();
      return;
    }

    // Debounce for longer queries
    searchTimeout = setTimeout(() => {
      handleSearch(query);
    }, 100);
  });

  // Focus event - show results if query exists
  searchInput.addEventListener('focus', (e) => {
    const query = e.target.value.trim();
    if (query.length >= 2) {
      handleSearch(query);
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      hideResults();
    }
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    handleKeyboardNavigation(e);
  });

  // Clear button functionality
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      hideResults();
      clearBtn.style.display = 'none';
    });
  }

  // Show/hide clear button based on input
  searchInput.addEventListener('input', (e) => {
    const clearBtn = document.getElementById('search-clear');
    if (clearBtn) {
      clearBtn.style.display = e.target.value ? 'block' : 'none';
    }
  });
}

/**
 * Handle search query
 */
function handleSearch(query) {
  const searchResults = document.getElementById('search-results');

  if (query.length < 2) {
    hideResults();
    return;
  }

  if (!fuseInstance) {
    console.error('Fuse instance not initialized');
    return;
  }

  // Perform search
  const results = fuseInstance.search(query);

  // Limit to top 8 results
  const topResults = results.slice(0, 8);

  // Display results
  displayResults(topResults, query);
}

/**
 * Display search results in dropdown (optimized)
 */
function displayResults(results, query) {
  const dropdown = document.getElementById('search-results');

  if (results.length === 0) {
    dropdown.innerHTML = `
      <div class="search-no-results">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p class="text-gray-400 text-sm">No modules found for "${escapeHtml(query)}"</p>
      </div>
    `;
    dropdown.classList.remove('hidden');
    return;
  }

  // Use DocumentFragment for faster DOM manipulation
  const fragment = document.createDocumentFragment();

  results.forEach(({ item }) => {
    const categoryIcon = getCategoryIcon(item.category);
    const categoryColor = getCategoryColor(item.category);

    // Create element directly instead of innerHTML
    const link = document.createElement('a');
    link.href = item.url;
    link.className = 'search-result-item';

    link.innerHTML = `
      <div class="search-result-icon ${categoryColor}">
        ${categoryIcon}
      </div>
      <div class="search-result-content">
        <div class="search-result-title">${escapeHtml(item.title)}</div>
        <div class="search-result-description">${truncateText(item.description, 80)}</div>
        <div class="search-result-meta">
          <span class="search-category ${categoryColor}">${item.category}</span>
        </div>
      </div>
    `;

    fragment.appendChild(link);
  });

  // Single DOM update
  dropdown.innerHTML = '';
  dropdown.appendChild(fragment);
  dropdown.classList.remove('hidden');
}

/**
 * Hide results dropdown
 */
function hideResults() {
  const dropdown = document.getElementById('search-results');
  dropdown.classList.add('hidden');
}

/**
 * Handle keyboard navigation in search
 */
function handleKeyboardNavigation(e) {
  const dropdown = document.getElementById('search-results');
  const items = dropdown.querySelectorAll('.search-result-item');

  if (items.length === 0) return;

  const currentActive = dropdown.querySelector('.search-result-item.active');
  let currentIndex = Array.from(items).indexOf(currentActive);

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      currentIndex = Math.min(currentIndex + 1, items.length - 1);
      setActiveItem(items, currentIndex);
      break;

    case 'ArrowUp':
      e.preventDefault();
      currentIndex = Math.max(currentIndex - 1, 0);
      setActiveItem(items, currentIndex);
      break;

    case 'Enter':
      e.preventDefault();
      if (currentActive) {
        window.location.href = currentActive.href;
      } else if (items[0]) {
        window.location.href = items[0].href;
      }
      break;

    case 'Escape':
      e.preventDefault();
      hideResults();
      document.getElementById('module-search').blur();
      break;
  }
}

/**
 * Set active item in keyboard navigation
 */
function setActiveItem(items, index) {
  items.forEach(item => item.classList.remove('active'));
  if (items[index]) {
    items[index].classList.add('active');
    items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// Cache for category data (faster lookups)
const CATEGORY_ICONS = {
  'concrete': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>',
  'steel': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>',
  'structural-analysis': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"></path></svg>',
  'timber': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clip-rule="evenodd"></path></svg>',
  'other': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 2a1 1 0 000 2h6a1 1 0 100-2H7zm6 7a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1zm-3 3a1 1 0 100 2h.01a1 1 0 100-2H10zm-4 1a1 1 0 011-1h.01a1 1 0 110 2H7a1 1 0 01-1-1zm1-4a1 1 0 100 2h.01a1 1 0 100-2H7zm2 1a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm4-4a1 1 0 100 2h.01a1 1 0 100-2H13zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zM7 8a1 1 0 000 2h.01a1 1 0 000-2H7z" clip-rule="evenodd"></path></svg>'
};

const CATEGORY_COLORS = {
  'concrete': 'text-gray-400',
  'steel': 'text-blue-400',
  'structural-analysis': 'text-purple-400',
  'timber': 'text-amber-400',
  'geotechnical': 'text-green-400',
  'other': 'text-cyan-400'
};

/**
 * Get category icon SVG (optimized with cache)
 */
function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS['other'];
}

/**
 * Get category color class (optimized with cache)
 */
function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS['other'];
}

/**
 * Truncate text to max length
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return escapeHtml(text);
  return escapeHtml(text.substring(0, maxLength)) + '...';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape regex special characters
 */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Initialize search when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSearch);
} else {
  initializeSearch();
}
