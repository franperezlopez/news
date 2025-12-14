/**
 * ML NEWS Slide Viewer
 * A cinematic, content-first newsletter presentation viewer
 */

// ==========================================================================
// Configuration
// ==========================================================================

const CONFIG = {
  dataUrl: 'docs/slide_new.yaml',
  assetBasePath: 'data/assets/slide_2025_50/',

  // Timing
  tabBarAutoHideDelay: 3000,
  tabBarDimmedDuration: 800,
  onboardingDuration: 4000,
  sessionTabBarDelay: 2000,

  // Storage keys
  storageKeys: {
    mode: 'newsletterViewerMode',
    onboarded: 'newsletterViewerOnboarded',
    selectedTags: 'newsletterSelectedTags'
  },

  // Section name mapping
  sectionMap: {
    'news': 0,
    'models': 1,
    'papers': 2,
    'blogs': 3,
    'opinion': 4,
    'exit': 5
  }
};

// Merge with any configuration provided by the HTML page
if (window.SLIDE_CONFIG) {
  Object.assign(CONFIG, window.SLIDE_CONFIG);
}

// ==========================================================================
// Visual Primitives - Easily swappable transition effects
// ==========================================================================

const VISUAL_PRIMITIVES = {
  // Duration primitives (ms)
  durations: {
    withinPost: 150,
    betweenPosts: 180,
    betweenGroups: 180,
    betweenSections: 280,
    microSettle: 25,      // Hold at end of post transition
    edgeFlash: 200,
    sheen: 120,           // Directional sheen for group boundaries
    axisHint: 50,         // Micro-drift for section hints
    depthSwap: 280,       // Contrast normalization for vertical transitions
  },

  // Brightness primitives
  brightness: {
    neutral: 1.0,
    dimmed: 0.95,         // For post/group transitions
    groupDimmed: 0.92,    // Slightly more pronounced for groups
  },

  // Motion primitives (px)
  motion: {
    axisHintDrift: 2,     // Upward micro-drift for section hints
    sheenWidth: 3,        // Width of directional sheen effect
  },

  // Contrast primitives
  contrast: {
    depthSwapStart: 0.98, // Starting contrast for depth swap
    depthSwapEnd: 1.0,    // Final contrast
  },

  // Easing primitives
  easing: {
    default: 'cubic-bezier(0.16, 1, 0.3, 1)',      // ease-out
    settle: 'cubic-bezier(0.22, 1, 0.36, 1)',     // Gentle settle
    section: 'cubic-bezier(0.65, 0, 0.35, 1)',    // ease-in-out
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',  // Slight overshoot
  }
};

// Helper to get duration for transition type
function getTransitionDuration(type) {
  const durationMap = {
    withinPost: VISUAL_PRIMITIVES.durations.withinPost,
    betweenPosts: VISUAL_PRIMITIVES.durations.betweenPosts,
    betweenGroups: VISUAL_PRIMITIVES.durations.betweenGroups,
    section: VISUAL_PRIMITIVES.durations.betweenSections,
    sectionHorizontal: 220, // Slightly faster than vertical section transition
  };
  return durationMap[type] || VISUAL_PRIMITIVES.durations.withinPost;
}

// ==========================================================================
// State
// ==========================================================================

const state = {
  newsletter: null,

  // Current position
  currentSlideIndex: 0,

  // Flattened slides for current mode
  allSlides: [],      // All slides
  visibleSlides: [],  // Current mode's slides (filtered by tags in personalized mode)

  // View mode: 'all' | 'personalized'
  mode: 'all',

  // Tag system
  allTags: new Set(),       // All unique tags in the newsletter
  newTags: new Set(),       // Tags marked as "new" in newsletter.new_tags
  selectedTags: new Set(),  // User-selected tags for filtering
  tagPanelVisible: false,   // Whether the tag panel is open

  // UI state
  tabBarVisible: false,
  tabBarTimeout: null,
  tabBarHovered: false,  // Track if mouse is over tab bar
  isAnimating: false,

  // Video activation ranges: Array of { videoIndex, startIndex, endIndex }
  // Each video's range is from its index to the last asset in its post
  videoActivationRanges: [],
  // Currently active video (playing in foreground or background)
  activeVideoIndex: null,

  // Touch tracking
  touchStartX: 0,
  touchStartY: 0,
  touchStartTime: 0
};

// ==========================================================================
// DOM References
// ==========================================================================

const dom = {
  tabBar: null,
  tabs: null,
  modeToggle: null,
  modeAllBtn: null,
  modePersonalizedBtn: null,
  filterButton: null,
  tagPanel: null,
  tagCloud: null,
  progressFill: null,
  progressSections: null,
  slideContainer: null,
  slideTrack: null,
  navPrev: null,
  navNext: null,
  edgeFlashLeft: null,
  edgeFlashRight: null,
  sheenLeft: null,      // Directional sheen for group transitions
  sheenRight: null,
  topTrigger: null,
  onboarding: null,
  errorState: null,
  loadingState: null,
  currentSlideCounter: null,
  totalSlidesCounter: null
};

// ==========================================================================
// Initialization
// ==========================================================================

async function init() {
  cacheDOMReferences();

  try {
    await loadNewsletter();
    buildSlideIndex();
    buildTagIndex();  // Extract all tags from assets
    generateTabBar(); // Create tabs based on sections with content
    cacheDOMReferences(); // Re-cache to include dynamically created tabs
    restoreState();
    renderSlides();
    renderTagCloud(); // Render tag chips
    updateUI();
    bindEvents();
    handleInitialState();
    hideLoading();
  } catch (error) {
    console.error('Failed to initialize viewer:', error);
    showError(error.message);
  }
}

function cacheDOMReferences() {
  dom.tabBar = document.getElementById('tab-bar');
  dom.tabs = document.querySelectorAll('#tabs-container .tab'); // Query only from tabs container
  dom.modeToggle = document.getElementById('mode-toggle');
  dom.modeAllBtn = document.getElementById('mode-all');
  dom.modePersonalizedBtn = document.getElementById('mode-personalized');
  dom.filterButton = document.getElementById('filter-button');
  dom.tagPanel = document.getElementById('tag-panel');
  dom.tagCloud = document.getElementById('tag-cloud');
  dom.progressFill = document.querySelector('.progress-fill');
  dom.progressSections = document.querySelector('.progress-sections');
  dom.slideContainer = document.getElementById('slide-container');
  dom.slideTrack = document.getElementById('slide-track');
  dom.navPrev = document.getElementById('nav-prev');
  dom.navNext = document.getElementById('nav-next');
  dom.edgeFlashLeft = document.getElementById('edge-flash-left');
  dom.edgeFlashRight = document.getElementById('edge-flash-right');
  dom.topTrigger = document.getElementById('top-trigger');
  dom.onboarding = document.getElementById('onboarding');
  dom.errorState = document.getElementById('error-state');
  dom.loadingState = document.getElementById('loading-state');
  dom.currentSlideCounter = document.getElementById('current-slide');
  dom.totalSlidesCounter = document.getElementById('total-slides');

  // Create sheen elements for group transitions (directional highlight)
  createSheenElements();
}

function createSheenElements() {
  // Create left sheen
  dom.sheenLeft = document.createElement('div');
  dom.sheenLeft.id = 'sheen-left';
  dom.sheenLeft.className = 'sheen left';
  document.body.appendChild(dom.sheenLeft);

  // Create right sheen
  dom.sheenRight = document.createElement('div');
  dom.sheenRight.id = 'sheen-right';
  dom.sheenRight.className = 'sheen right';
  document.body.appendChild(dom.sheenRight);
}

// ==========================================================================
// Data Loading
// ==========================================================================

async function loadNewsletter() {
  const response = await fetch(CONFIG.dataUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch newsletter data: ${response.status}`);
  }

  const yamlText = await response.text();
  const data = jsyaml.load(yamlText);

  if (!data || !data.newsletter) {
    throw new Error('Invalid newsletter data format');
  }

  // Ensure sections array exists (can be empty)
  if (!data.newsletter.sections) {
    data.newsletter.sections = [];
  }

  state.newsletter = data.newsletter;
  return state.newsletter;
}

// ==========================================================================
// Tab Bar Generation
// ==========================================================================

function generateTabBar() {
  // Find all unique sections that have content
  const sectionsWithContent = {};

  state.allSlides.forEach(slide => {
    if (!sectionsWithContent[slide.sectionKey]) {
      sectionsWithContent[slide.sectionKey] = slide.sectionName;
    }
  });

  const tabsContainer = document.getElementById('tabs-container');
  tabsContainer.innerHTML = '';

  // Get ordered section names from config for consistent ordering
  const orderedSectionKeys = Object.keys(CONFIG.sectionMap);

  orderedSectionKeys.forEach(sectionKey => {
    if (sectionsWithContent[sectionKey]) {
      const sectionName = sectionsWithContent[sectionKey];
      const button = document.createElement('button');
      button.className = 'tab';
      button.dataset.section = sectionKey;
      button.innerHTML = `
        <span class="tab-name">${sectionName}</span>
        <span class="tab-badge">0</span>
      `;
      tabsContainer.appendChild(button);
    }
  });
}

// ==========================================================================
// Slide Index Building
// ==========================================================================

function buildSlideIndex() {
  const slides = [];
  let globalIndex = 0;

  state.newsletter.sections.forEach((section, sectionIndex) => {
    // Skip sections without a name
    if (!section || !section.name) return;

    const sectionName = section.name.toLowerCase();

    section.groups?.forEach((group, groupIndex) => {
      group.posts?.forEach((post, postIndex) => {
        const postStartIndex = globalIndex;
        const postAssetCount = post.assets?.length || 0;

        post.assets?.forEach((asset, assetIndex) => {
          // Handle source path - strip 'assets/' prefix if present since files
          // are directly in the base directory
          let sourcePath = asset.source;
          if (sourcePath.startsWith('assets/')) {
            sourcePath = sourcePath.slice(7); // Remove 'assets/' prefix
          }

          slides.push({
            sectionIndex,
            sectionName: section.name,
            sectionKey: sectionName,
            groupIndex,
            postIndex,
            postUrl: post.url,
            assetIndex,
            asset: {
              ...asset,
              source: CONFIG.assetBasePath + sourcePath
            },
            globalIndex: globalIndex,
            // Store post boundaries for video activation range
            postStartIndex: postStartIndex,
            postEndIndex: postStartIndex + postAssetCount - 1,
            isHighlight: asset.tags?.includes('highlight') ?? false
          });

          globalIndex++;
        });
      });
    });
  });

  state.allSlides = slides;
  // updateVisibleSlides also rebuilds video activation ranges
  updateVisibleSlides();
}

/**
 * Build video activation ranges based on the spec:
 * Each video's activation range is from its slide index to the last asset in its post.
 */
function buildVideoActivationRanges() {
  state.videoActivationRanges = [];

  state.allSlides.forEach((slide, index) => {
    if (slide.asset.type === 'video') {
      state.videoActivationRanges.push({
        videoIndex: index,
        startIndex: index,
        endIndex: slide.postEndIndex
      });
    }
  });

  // Sort by startIndex for efficient lookup
  state.videoActivationRanges.sort((a, b) => a.startIndex - b.startIndex);
}

function updateVisibleSlides() {
  if (state.mode === 'personalized' && state.selectedTags.size > 0) {
    // Filter slides that have at least one selected tag (OR logic)
    state.visibleSlides = state.allSlides.filter(slide => {
      const slideTags = getSlideTagsSet(slide);
      // Check if any selected tag is present in slide's tags
      for (const tag of state.selectedTags) {
        if (slideTags.has(tag)) {
          return true;
        }
      }
      return false;
    });

    // Fallback to all slides if filter results in empty list
    if (state.visibleSlides.length === 0) {
      state.visibleSlides = [...state.allSlides];
    }
  } else {
    // All mode or personalized with no tags selected - show everything
    state.visibleSlides = [...state.allSlides];
  }

  // Rebuild video activation ranges for current visible slides
  rebuildVideoActivationRangesForVisibleSlides();
}

/**
 * Rebuild video activation ranges based on current visible slides.
 * Needed when switching between highlight/detailed modes.
 */
function rebuildVideoActivationRangesForVisibleSlides() {
  state.videoActivationRanges = [];

  state.visibleSlides.forEach((slide, visibleIndex) => {
    if (slide.asset.type === 'video') {
      // Find the end of this post within visible slides
      let endIndex = visibleIndex;
      for (let i = visibleIndex + 1; i < state.visibleSlides.length; i++) {
        const nextSlide = state.visibleSlides[i];
        if (nextSlide.sectionIndex === slide.sectionIndex &&
            nextSlide.groupIndex === slide.groupIndex &&
            nextSlide.postIndex === slide.postIndex) {
          endIndex = i;
        } else {
          break;
        }
      }

      state.videoActivationRanges.push({
        videoIndex: visibleIndex,
        startIndex: visibleIndex,
        endIndex: endIndex
      });
    }
  });

  // Sort by startIndex for efficient lookup
  state.videoActivationRanges.sort((a, b) => a.startIndex - b.startIndex);
}

// ==========================================================================
// Tag System
// ==========================================================================

/**
 * Build tag index from newsletter data.
 * Extracts all unique tags from assets and identifies "new" tags.
 */
function buildTagIndex() {
  state.allTags = new Set();
  state.newTags = new Set();

  // Extract "new" tags from newsletter level
  if (state.newsletter.new_tags && Array.isArray(state.newsletter.new_tags)) {
    state.newsletter.new_tags.forEach(tag => {
      state.newTags.add(tag.toLowerCase());
    });
  }

  // Extract all tags from assets
  state.allSlides.forEach(slide => {
    if (slide.asset.tags && Array.isArray(slide.asset.tags)) {
      slide.asset.tags.forEach(tag => {
        state.allTags.add(tag.toLowerCase());
      });
    }
  });
}

/**
 * Render the tag cloud with all available tags.
 * Tags are sorted alphabetically.
 */
function renderTagCloud() {
  if (!dom.tagCloud) return;

  dom.tagCloud.innerHTML = '';

  // Sort tags alphabetically
  const sortedTags = Array.from(state.allTags).sort();

  sortedTags.forEach(tag => {
    const chip = document.createElement('button');
    chip.className = 'tag-chip';
    chip.dataset.tag = tag;
    chip.textContent = tag;
    chip.setAttribute('role', 'checkbox');
    chip.setAttribute('aria-checked', 'false');

    // Apply "new" class if tag is in newTags
    if (state.newTags.has(tag)) {
      chip.classList.add('new');
    }

    // Apply "selected" class if tag is selected
    if (state.selectedTags.has(tag)) {
      chip.classList.add('selected');
      chip.setAttribute('aria-checked', 'true');
    }

    chip.addEventListener('click', () => toggleTag(tag));
    dom.tagCloud.appendChild(chip);
  });

  // Update "present" state based on current slide
  updateTagChipPresentState();
}

/**
 * Update the "present" state of tag chips based on current slide.
 */
function updateTagChipPresentState() {
  if (!dom.tagCloud) return;

  const currentSlide = state.visibleSlides[state.currentSlideIndex];
  const currentTags = new Set();

  if (currentSlide?.asset?.tags) {
    currentSlide.asset.tags.forEach(tag => currentTags.add(tag.toLowerCase()));
  }

  const chips = dom.tagCloud.querySelectorAll('.tag-chip');
  chips.forEach(chip => {
    const tag = chip.dataset.tag;
    chip.classList.toggle('present', currentTags.has(tag));
  });
}

/**
 * Toggle a tag's selection state.
 */
function toggleTag(tag) {
  if (state.selectedTags.has(tag)) {
    state.selectedTags.delete(tag);
  } else {
    state.selectedTags.add(tag);
  }

  // Update chip visual state
  const chip = dom.tagCloud.querySelector(`[data-tag="${tag}"]`);
  if (chip) {
    chip.classList.toggle('selected', state.selectedTags.has(tag));
    chip.setAttribute('aria-checked', state.selectedTags.has(tag) ? 'true' : 'false');
  }
}

/**
 * Toggle the tag panel visibility.
 */
function toggleTagPanel() {
  state.tagPanelVisible = !state.tagPanelVisible;

  dom.tagPanel.classList.toggle('visible', state.tagPanelVisible);
  dom.filterButton.classList.toggle('active', state.tagPanelVisible);

  if (!state.tagPanelVisible) {
    // Panel is closing - commit changes
    saveSelectedTags();

    // If in personalized mode, apply filter
    if (state.mode === 'personalized') {
      applyTagFilter();
    }
  }
}

/**
 * Close the tag panel (if open).
 */
function closeTagPanel() {
  if (state.tagPanelVisible) {
    toggleTagPanel();
  }
}

/**
 * Apply tag filter to visible slides (for personalized mode).
 */
function applyTagFilter() {
  // Remember current position
  const currentGlobalIndex = state.visibleSlides[state.currentSlideIndex]?.globalIndex;

  updateVisibleSlides();

  // Find new position
  if (currentGlobalIndex !== undefined && state.visibleSlides.length > 0) {
    let newIndex = state.visibleSlides.findIndex(
      slide => slide.globalIndex === currentGlobalIndex
    );

    if (newIndex === -1) {
      // Current slide not in filtered list - find next available
      newIndex = state.visibleSlides.findIndex(
        slide => slide.globalIndex > currentGlobalIndex
      );
      if (newIndex === -1) {
        // No slide after current - go to last
        newIndex = state.visibleSlides.length - 1;
      }
    }

    state.currentSlideIndex = Math.max(0, newIndex);
  } else {
    state.currentSlideIndex = 0;
  }

  renderSlides();
  updateUI();
}

/**
 * Get tags for a slide's asset.
 */
function getSlideTagsSet(slide) {
  const tags = new Set();
  if (slide?.asset?.tags) {
    slide.asset.tags.forEach(tag => tags.add(tag.toLowerCase()));
  }
  return tags;
}

// ==========================================================================
// State Persistence
// ==========================================================================

function restoreState() {
  // Restore viewing mode
  const savedMode = localStorage.getItem(CONFIG.storageKeys.mode);
  if (savedMode === 'all' || savedMode === 'personalized') {
    state.mode = savedMode;
  }

  // Restore selected tags
  const savedTags = localStorage.getItem(CONFIG.storageKeys.selectedTags);
  if (savedTags) {
    try {
      const tagsArray = JSON.parse(savedTags);
      state.selectedTags = new Set(tagsArray);
    } catch (e) {
      console.warn('Failed to restore selected tags:', e);
      state.selectedTags = new Set();
    }
  }

  updateVisibleSlides();

  // Parse URL hash for initial position
  const hash = window.location.hash.slice(1);
  if (hash) {
    const slideIndex = findSlideFromHash(hash);
    if (slideIndex !== -1) {
      state.currentSlideIndex = slideIndex;
    }
  }

  // Ensure currentSlideIndex is valid (in case of empty slides or mode mismatch)
  if (state.visibleSlides.length > 0) {
    state.currentSlideIndex = Math.max(0, Math.min(state.currentSlideIndex, state.visibleSlides.length - 1));
  } else {
    state.currentSlideIndex = 0;
  }
}

function findSlideFromHash(hash) {
  const parts = hash.split('/');
  if (parts.length !== 4) return -1;

  const [sectionKey, groupStr, postStr, assetStr] = parts;
  const groupIndex = parseInt(groupStr, 10);
  const postIndex = parseInt(postStr, 10);
  const assetIndex = parseInt(assetStr, 10);

  if (isNaN(groupIndex) || isNaN(postIndex) || isNaN(assetIndex)) return -1;

  return state.visibleSlides.findIndex(slide =>
    slide.sectionKey === sectionKey &&
    slide.groupIndex === groupIndex &&
    slide.postIndex === postIndex &&
    slide.assetIndex === assetIndex
  );
}

function updateURLHash() {
  const slide = state.visibleSlides[state.currentSlideIndex];
  if (!slide) return;

  const hash = `${slide.sectionKey}/${slide.groupIndex}/${slide.postIndex}/${slide.assetIndex}`;
  history.replaceState(null, '', `#${hash}`);
}

function saveMode() {
  localStorage.setItem(CONFIG.storageKeys.mode, state.mode);
}

function saveSelectedTags() {
  const tagsArray = Array.from(state.selectedTags);
  localStorage.setItem(CONFIG.storageKeys.selectedTags, JSON.stringify(tagsArray));
}

// ==========================================================================
// Rendering
// ==========================================================================

function renderSlides() {
  dom.slideTrack.innerHTML = '';

  state.visibleSlides.forEach((slide, index) => {
    const slideEl = createSlideElement(slide, index);
    dom.slideTrack.appendChild(slideEl);
  });

  updateActiveSlide();
  renderProgressSections();
}

function createSlideElement(slide, index) {
  const div = document.createElement('div');
  div.className = 'slide';
  div.dataset.index = index;

  if (slide.asset.type === 'video') {
    const video = document.createElement('video');
    video.src = slide.asset.source;
    video.loop = true;
    video.muted = false;
    video.playsInline = true;
    video.preload = 'metadata';
    video.addEventListener('click', () => openPostUrl(slide.postUrl));
    div.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = slide.asset.source;
    img.alt = slide.asset.alt || '';
    img.loading = 'lazy';
    img.addEventListener('click', () => openPostUrl(slide.postUrl));

    img.onerror = () => {
      img.style.display = 'none';
      const placeholder = document.createElement('div');
      placeholder.className = 'slide-placeholder';
      placeholder.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>Asset not found</span>
      `;
      div.appendChild(placeholder);
    };

    div.appendChild(img);
  }

  return div;
}

function openPostUrl(url) {
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function renderProgressSections() {
  dom.progressSections.innerHTML = '';

  // Calculate section proportions
  const sectionCounts = {};
  state.visibleSlides.forEach(slide => {
    const key = slide.sectionKey;
    sectionCounts[key] = (sectionCounts[key] || 0) + 1;
  });

  const total = state.visibleSlides.length;
  const orderedSections = ['news', 'models', 'papers', 'blogs', 'opinion', 'exit'];

  orderedSections.forEach(key => {
    if (sectionCounts[key]) {
      const width = (sectionCounts[key] / total) * 100;
      const div = document.createElement('div');
      div.className = 'progress-section';
      div.style.width = `${width}%`;
      div.dataset.section = key;
      dom.progressSections.appendChild(div);
    }
  });
}

// ==========================================================================
// Navigation
// ==========================================================================

function navigateHorizontal(direction) {
  if (state.isAnimating || state.visibleSlides.length === 0) return;

  const currentIndex = state.currentSlideIndex;
  const targetIndex = direction === 'next'
    ? Math.min(currentIndex + 1, state.visibleSlides.length - 1)
    : Math.max(currentIndex - 1, 0);

  if (targetIndex === currentIndex) return;

  const current = state.visibleSlides[currentIndex];
  const target = state.visibleSlides[targetIndex];

  // Determine transition type based on hierarchy boundary crossed
  let transitionType = 'withinPost';
  if (current.sectionIndex !== target.sectionIndex) {
    // Section boundary crossed via horizontal navigation
    // Uses "sectionHorizontal" for axis hint effect
    transitionType = 'sectionHorizontal';
  } else if (current.groupIndex !== target.groupIndex) {
    transitionType = 'betweenGroups';
  } else if (current.postIndex !== target.postIndex) {
    transitionType = 'betweenPosts';
  }

  goToSlide(targetIndex, direction, transitionType);
}

function navigateVertical(direction) {
  if (state.isAnimating || state.visibleSlides.length === 0) return;

  const current = state.visibleSlides[state.currentSlideIndex];
  if (!current) return;

  const currentSectionIndex = current.sectionIndex;

  // Find next section with content (skip empty sections)
  let targetSectionIndex = currentSectionIndex;
  let found = false;

  if (direction === 'next') {
    const maxSectionIndex = Object.keys(CONFIG.sectionMap).length - 1;
    // Look forward through sections
    for (let i = currentSectionIndex + 1; i <= maxSectionIndex; i++) {
      const slide = state.visibleSlides.find(s => s.sectionIndex === i);
      if (slide) {
        targetSectionIndex = i;
        found = true;
        break;
      }
    }
  } else {
    // Look backward through sections
    for (let i = currentSectionIndex - 1; i >= 0; i--) {
      const slide = state.visibleSlides.find(s => s.sectionIndex === i);
      if (slide) {
        targetSectionIndex = i;
        found = true;
        break;
      }
    }
  }

  if (!found) return;

  // Find first slide of target section
  const targetIndex = state.visibleSlides.findIndex(
    slide => slide.sectionIndex === targetSectionIndex
  );

  if (targetIndex === -1) return;

  goToSlide(targetIndex, direction, 'section');
}

function goToSection(sectionKey) {
  if (state.isAnimating) return;

  const targetIndex = state.visibleSlides.findIndex(
    slide => slide.sectionKey === sectionKey
  );

  if (targetIndex === -1 || targetIndex === state.currentSlideIndex) return;

  const direction = targetIndex > state.currentSlideIndex ? 'next' : 'prev';
  goToSlide(targetIndex, direction, 'section');
}

function goToSlide(targetIndex, direction, transitionType = 'withinPost') {
  if (targetIndex < 0 || targetIndex >= state.visibleSlides.length) return;
  if (state.isAnimating) return;

  state.isAnimating = true;

  // Find the current foreground slide (active but not video-background)
  // If we're on a video slide, use the current slide index
  const currentSlideEl = dom.slideTrack.querySelector(`[data-index="${state.currentSlideIndex}"]`);
  const targetSlideEl = dom.slideTrack.querySelector(`[data-index="${targetIndex}"]`);

  // Also find background video slide if there is one
  const bgVideoSlideEl = state.activeVideoIndex !== null && state.activeVideoIndex !== state.currentSlideIndex
    ? dom.slideTrack.querySelector(`[data-index="${state.activeVideoIndex}"]`)
    : null;

  if (!currentSlideEl || !targetSlideEl) {
    state.isAnimating = false;
    return;
  }

  // Get duration and apply transition effects based on type
  const duration = getTransitionDuration(transitionType);

  // Apply visual effects based on transition type
  applyTransitionEffects(currentSlideEl, targetSlideEl, transitionType, direction);

  // Handle video activation states
  updateVideoStates(targetIndex);

  // Execute the transition based on type
  if (transitionType === 'section') {
    // Vertical transition with depth swap
    executeVerticalTransition(currentSlideEl, targetSlideEl, direction, bgVideoSlideEl);
  } else if (transitionType === 'sectionHorizontal') {
    // Horizontal transition with axis hint (section crossed via left/right)
    executeHorizontalSectionTransition(currentSlideEl, targetSlideEl, direction, bgVideoSlideEl);
  } else {
    // Standard horizontal transitions (within post, between posts, between groups)
    executeHorizontalTransition(currentSlideEl, targetSlideEl, transitionType, direction, bgVideoSlideEl);
  }

  // Update state
  state.currentSlideIndex = targetIndex;

  // Cleanup after animation
  scheduleTransitionCleanup(currentSlideEl, targetSlideEl, duration);

  updateUI();
  updateURLHash();
}

// ==========================================================================
// Visual Effect Primitives
// ==========================================================================

/**
 * Apply CSS transition classes based on transition type
 */
function applyTransitionEffects(currentEl, targetEl, transitionType, direction) {
  // Remove any previous transition classes
  const allTransitionClasses = [
    'transition-within-post', 'transition-posts', 'transition-groups',
    'transition-section', 'transition-section-horizontal',
    'direction-backward', 'transitioning-out', 'micro-settle',
    'depth-swap', 'axis-hint-up', 'axis-hint-down'
  ];

  currentEl.classList.remove(...allTransitionClasses);
  targetEl.classList.remove(...allTransitionClasses);

  // Apply appropriate transition class
  switch (transitionType) {
    case 'withinPost':
      currentEl.classList.add('transition-within-post');
      targetEl.classList.add('transition-within-post');
      break;

    case 'betweenPosts':
      currentEl.classList.add('transition-posts', 'transitioning-out');
      targetEl.classList.add('transition-posts', 'micro-settle');
      break;

    case 'betweenGroups':
      currentEl.classList.add('transition-groups', 'transitioning-out');
      targetEl.classList.add('transition-groups');
      // Trigger edge flash and sheen effect
      triggerGroupTransitionEffects(direction);
      break;

    case 'sectionHorizontal':
      currentEl.classList.add('transition-section-horizontal', 'transitioning-out');
      targetEl.classList.add('transition-section-horizontal');
      // Apply axis hint (micro-drift)
      targetEl.classList.add(direction === 'next' ? 'axis-hint-up' : 'axis-hint-down');
      showTabBar(true);
      break;

    case 'section':
      currentEl.classList.add('transition-section');
      targetEl.classList.add('transition-section', 'depth-swap');
      showTabBar(true);
      break;
  }

  // Direction class affects easing
  if (direction === 'prev') {
    currentEl.classList.add('direction-backward');
    targetEl.classList.add('direction-backward');
  }
}

/**
 * Execute vertical section transition with depth swap effect
 */
function executeVerticalTransition(currentEl, targetEl, direction, bgVideoEl) {
  // Position target slide off-screen
  targetEl.classList.add(direction === 'next' ? 'section-enter-from-bottom' : 'section-enter-from-top');
  targetEl.classList.remove('prev', 'next');

  // Stop background video if any (section change ends all video playback)
  if (bgVideoEl && bgVideoEl !== currentEl) {
    bgVideoEl.classList.remove('video-background', 'active');
    bgVideoEl.classList.add('prev');
  }

  requestAnimationFrame(() => {
    currentEl.classList.remove('active');
    currentEl.classList.add(direction === 'next' ? 'section-exit-up' : 'section-exit-down');
    targetEl.classList.add('active');

    requestAnimationFrame(() => {
      targetEl.classList.remove('section-enter-from-bottom', 'section-enter-from-top');
    });
  });
}

/**
 * Execute horizontal transition when crossing section boundary
 * Adds axis hint (micro-drift) to foreshadow section change
 */
function executeHorizontalSectionTransition(currentEl, targetEl, direction, bgVideoEl) {
  // Stop background video (section change)
  if (bgVideoEl && bgVideoEl !== currentEl) {
    bgVideoEl.classList.remove('video-background', 'active');
    bgVideoEl.classList.add(direction === 'next' ? 'prev' : 'next');
  }

  if (!currentEl.classList.contains('video-background')) {
    currentEl.classList.remove('active');
    currentEl.classList.add(direction === 'next' ? 'prev' : 'next');
  }

  targetEl.classList.remove('prev', 'next');
  targetEl.classList.add('active');
}

/**
 * Execute standard horizontal transition (within post, between posts, between groups)
 */
function executeHorizontalTransition(currentEl, targetEl, transitionType, direction, bgVideoEl) {
  // Check if we're returning to a background video
  const returningToBackgroundVideo = bgVideoEl && targetEl === bgVideoEl;

  // If crossing group boundary, stop background video
  if (transitionType === 'betweenGroups' && bgVideoEl) {
    bgVideoEl.classList.remove('video-background', 'active');
    bgVideoEl.classList.add(direction === 'next' ? 'prev' : 'next');
  }

  // Handle current slide transition
  currentEl.classList.remove('active');
  currentEl.classList.add(direction === 'next' ? 'prev' : 'next');

  // If returning to background video, bring it to foreground
  if (returningToBackgroundVideo) {
    targetEl.classList.remove('video-background', 'prev', 'next');
  } else {
    targetEl.classList.remove('prev', 'next');
  }
  targetEl.classList.add('active');
}

/**
 * Trigger group transition visual effects (edge flash + directional sheen)
 */
function triggerGroupTransitionEffects(direction) {
  // Edge flash
  flashEdge(direction);

  // Directional sheen on entering edge
  triggerSheen(direction);
}

/**
 * Trigger the directional sheen effect
 */
function triggerSheen(direction) {
  const sheen = direction === 'next' ? dom.sheenRight : dom.sheenLeft;
  if (!sheen) return;

  sheen.classList.remove('flash');
  void sheen.offsetWidth; // Force reflow
  sheen.classList.add('flash');
}

/**
 * Schedule cleanup of transition classes after animation completes
 */
function scheduleTransitionCleanup(currentEl, targetEl, duration) {
  // Add micro-settle delay for post transitions
  const additionalDelay = targetEl.classList.contains('micro-settle')
    ? VISUAL_PRIMITIVES.durations.microSettle
    : 0;

  setTimeout(() => {
    // Clean up all transition classes
    const cleanupClasses = [
      'section-exit-up', 'section-exit-down',
      'transitioning-out', 'transitioning-in',
      'transition-within-post', 'transition-posts', 'transition-groups',
      'transition-section', 'transition-section-horizontal',
      'direction-backward', 'micro-settle', 'depth-swap',
      'axis-hint-up', 'axis-hint-down'
    ];

    if (!currentEl.classList.contains('video-background')) {
      currentEl.classList.remove(...cleanupClasses);
    } else {
      // Keep video-background, only remove transition classes
      currentEl.classList.remove(
        'transitioning-out', 'transitioning-in',
        'transition-posts', 'transition-groups',
        'direction-backward'
      );
    }

    targetEl.classList.remove(...cleanupClasses);
    state.isAnimating = false;
  }, duration + additionalDelay);
}

function updateActiveSlide() {
  const slides = dom.slideTrack.querySelectorAll('.slide');
  slides.forEach((slide, index) => {
    slide.classList.remove('active', 'prev', 'next', 'video-background');
    if (index === state.currentSlideIndex) {
      slide.classList.add('active');
    } else if (index < state.currentSlideIndex) {
      slide.classList.add('prev');
    } else {
      slide.classList.add('next');
    }
  });

  // Initialize video states based on activation ranges
  updateVideoStates(state.currentSlideIndex);
}

// ==========================================================================
// Video Activation Range System
// ==========================================================================

/**
 * Find which video's activation range contains the given slide index.
 * Returns the video range object or null if no video is active.
 * If multiple videos overlap, returns the latest one (per spec: only one video plays).
 */
function findActiveVideoRange(slideIndex) {
  let activeRange = null;

  for (const range of state.videoActivationRanges) {
    if (slideIndex >= range.startIndex && slideIndex <= range.endIndex) {
      // Later videos take precedence
      activeRange = range;
    }
  }

  return activeRange;
}

/**
 * Update video states based on current slide index.
 * Handles foreground/background states and stops videos outside activation range.
 */
function updateVideoStates(targetIndex) {
  const activeRange = findActiveVideoRange(targetIndex);
  const newActiveVideoIndex = activeRange?.videoIndex ?? null;
  const previousActiveVideoIndex = state.activeVideoIndex;

  // Handle stopping previous video if needed
  if (previousActiveVideoIndex !== null && previousActiveVideoIndex !== newActiveVideoIndex) {
    stopVideo(previousActiveVideoIndex);
  }

  // Update active video tracking
  state.activeVideoIndex = newActiveVideoIndex;

  if (activeRange) {
    const videoSlideEl = dom.slideTrack.querySelector(`[data-index="${activeRange.videoIndex}"]`);
    const video = videoSlideEl?.querySelector('video');

    if (targetIndex === activeRange.videoIndex) {
      // Video is in foreground - show as active slide
      videoSlideEl?.classList.remove('video-background');
      if (video && video.paused) {
        video.muted = false;
        video.play().catch(() => {});
      }
    } else {
      // Video is in background - keep playing but layer behind current slide
      videoSlideEl?.classList.add('video-background');
      videoSlideEl?.classList.add('active'); // Keep visible
      if (video && video.paused) {
        video.muted = false;
        video.play().catch(() => {});
      }
    }
  }
}

/**
 * Stop and reset a video at the given slide index.
 */
function stopVideo(slideIndex) {
  const slideEl = dom.slideTrack.querySelector(`[data-index="${slideIndex}"]`);
  if (slideEl) {
    slideEl.classList.remove('video-background', 'active');
    // Reset position classes
    if (slideIndex < state.currentSlideIndex) {
      slideEl.classList.add('prev');
    } else if (slideIndex > state.currentSlideIndex) {
      slideEl.classList.add('next');
    }
    const video = slideEl.querySelector('video');
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  }
}

/**
 * Check if we're returning to a video slide that's already playing in background.
 * Returns true if we should continue playback without restarting.
 */
function isReturningToActiveVideo(targetIndex) {
  return state.activeVideoIndex === targetIndex;
}

function flashEdge(direction) {
  const edge = direction === 'next' ? dom.edgeFlashRight : dom.edgeFlashLeft;
  edge.classList.remove('flash');
  void edge.offsetWidth; // Trigger reflow
  edge.classList.add('flash');
}

// ==========================================================================
// Mode Toggle
// ==========================================================================

/**
 * Set the viewing mode (all or personalized).
 */
function setMode(newMode) {
  if (newMode === state.mode) return;
  if (newMode !== 'all' && newMode !== 'personalized') return;

  state.mode = newMode;
  saveMode();

  // Remember current position in global index
  const currentGlobalIndex = state.visibleSlides[state.currentSlideIndex]?.globalIndex;

  updateVisibleSlides();

  // Find closest slide in new mode
  if (currentGlobalIndex !== undefined && state.visibleSlides.length > 0) {
    let newIndex = state.visibleSlides.findIndex(
      slide => slide.globalIndex === currentGlobalIndex
    );

    if (newIndex === -1) {
      // Find nearest visible slide
      newIndex = state.visibleSlides.findIndex(
        slide => slide.globalIndex > currentGlobalIndex
      );
      if (newIndex === -1) {
        newIndex = state.visibleSlides.length - 1;
      }
    }

    state.currentSlideIndex = Math.max(0, newIndex);
  }

  renderSlides();
  updateUI();
}

/**
 * Legacy toggle function for keyboard shortcut.
 */
function toggleMode() {
  setMode(state.mode === 'all' ? 'personalized' : 'all');
}

// ==========================================================================
// UI Updates
// ==========================================================================

function updateUI() {
  updateTabBadges();
  updateActiveTab();
  updateModeToggle();
  updateProgress();
  updateSlideCounter();
  updateTagChipPresentState();
}

function updateTabBadges() {
  const counts = {};
  state.visibleSlides.forEach(slide => {
    const key = slide.sectionKey;
    counts[key] = (counts[key] || 0) + 1;
  });

  dom.tabs.forEach(tab => {
    const section = tab.dataset.section;
    const badge = tab.querySelector('.tab-badge');
    badge.textContent = counts[section] || 0;
  });
}

function updateActiveTab() {
  const current = state.visibleSlides[state.currentSlideIndex];
  if (!current) return;

  dom.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.section === current.sectionKey);
  });
}

function updateModeToggle() {
  if (dom.modeAllBtn && dom.modePersonalizedBtn) {
    dom.modeAllBtn.classList.toggle('active', state.mode === 'all');
    dom.modePersonalizedBtn.classList.toggle('active', state.mode === 'personalized');
  }
}

function updateProgress() {
  if (state.visibleSlides.length === 0) {
    dom.progressFill.style.width = '0%';
    return;
  }
  const progress = ((state.currentSlideIndex + 1) / state.visibleSlides.length) * 100;
  dom.progressFill.style.width = `${progress}%`;
}

function updateSlideCounter() {
  const currentSlide = state.currentSlideIndex + 1; // 1-indexed
  const totalSlides = state.visibleSlides.length;
  dom.currentSlideCounter.textContent = currentSlide;
  dom.totalSlidesCounter.textContent = totalSlides;
}

// ==========================================================================
// Tab Bar Visibility
// ==========================================================================

function showTabBar(dimmed = false) {
  clearTimeout(state.tabBarTimeout);

  dom.tabBar.classList.remove('collapsed');

  // Never dim if mouse is hovering over tab bar
  if (state.tabBarHovered) {
    dom.tabBar.classList.remove('dimmed');
  } else {
    dom.tabBar.classList.toggle('dimmed', dimmed);
  }

  state.tabBarVisible = true;

  // Only auto-hide if not being hovered
  if (!state.tabBarHovered) {
    const delay = dimmed ? CONFIG.tabBarDimmedDuration : CONFIG.tabBarAutoHideDelay;
    state.tabBarTimeout = setTimeout(() => {
      if (!state.tabBarHovered) {
        hideTabBar();
      }
    }, delay);
  }
}

function hideTabBar() {
  // Don't hide if mouse is over the tab bar
  if (state.tabBarHovered) return;

  dom.tabBar.classList.add('collapsed');
  dom.tabBar.classList.remove('dimmed');
  state.tabBarVisible = false;
}

function toggleTabBar() {
  if (state.tabBarVisible) {
    hideTabBar();
  } else {
    showTabBar();
  }
}

function handleTabBarMouseEnter() {
  state.tabBarHovered = true;
  clearTimeout(state.tabBarTimeout);
  // If tab bar was dimmed, make it fully visible
  dom.tabBar.classList.remove('dimmed');
}

function handleTabBarMouseLeave() {
  state.tabBarHovered = false;
  // Dim then hide immediately when mouse leaves
  dom.tabBar.classList.add('dimmed');
  state.tabBarTimeout = setTimeout(() => {
    hideTabBar();
  }, CONFIG.tabBarDimmedDuration);
}

// ==========================================================================
// Event Handling
// ==========================================================================

function bindEvents() {
  // Keyboard navigation
  document.addEventListener('keydown', handleKeydown);

  // Touch/swipe navigation
  dom.slideContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
  dom.slideContainer.addEventListener('touchend', handleTouchEnd, { passive: true });

  // Mouse navigation
  dom.navPrev.addEventListener('click', () => navigateHorizontal('prev'));
  dom.navNext.addEventListener('click', () => navigateHorizontal('next'));

  // Tab bar triggers
  dom.topTrigger.addEventListener('mouseenter', () => showTabBar());
  dom.topTrigger.addEventListener('click', () => showTabBar());

  // Tab clicks
  dom.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      goToSection(tab.dataset.section);
      // Blur to prevent focus outline when pressing arrow keys after click
      tab.blur();
    });
  });

  // Filter button - toggle tag panel
  if (dom.filterButton) {
    dom.filterButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleTagPanel();
    });
  }

  // Mode toggle buttons
  if (dom.modeAllBtn) {
    dom.modeAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setMode('all');
    });
  }
  if (dom.modePersonalizedBtn) {
    dom.modePersonalizedBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setMode('personalized');
    });
  }

  // Close tag panel when clicking outside
  document.addEventListener('click', (e) => {
    if (state.tagPanelVisible) {
      const isClickInsidePanel = dom.tagPanel.contains(e.target);
      const isClickOnFilterButton = dom.filterButton.contains(e.target);
      if (!isClickInsidePanel && !isClickOnFilterButton) {
        closeTagPanel();
      }
    }
  });

  // Keep tab bar visible on hover
  dom.tabBar.addEventListener('mouseenter', handleTabBarMouseEnter);
  dom.tabBar.addEventListener('mouseleave', handleTabBarMouseLeave);
}

function handleKeydown(e) {
  switch (e.key) {
    case 'ArrowRight':
      navigateHorizontal('next');
      break;
    case 'ArrowLeft':
      navigateHorizontal('prev');
      break;
    case 'ArrowDown':
      navigateVertical('next');
      break;
    case 'ArrowUp':
      navigateVertical('prev');
      break;
    case 'm':
      toggleMode();
      break;
    case 'f':
      toggleTagPanel();
      break;
    case 'h':
      showOnboarding();
      break;
    case 'Escape':
      if (state.tagPanelVisible) {
        closeTagPanel();
      } else {
        hideTabBar();
      }
      break;
  }
}

function handleTouchStart(e) {
  state.touchStartX = e.touches[0].clientX;
  state.touchStartY = e.touches[0].clientY;
  state.touchStartTime = Date.now();
}

function handleTouchEnd(e) {
  const deltaX = e.changedTouches[0].clientX - state.touchStartX;
  const deltaY = e.changedTouches[0].clientY - state.touchStartY;
  const deltaTime = Date.now() - state.touchStartTime;

  const minSwipeDistance = 50;
  const maxSwipeTime = 300;

  if (deltaTime > maxSwipeTime) return;

  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX > absY && absX > minSwipeDistance) {
    // Horizontal swipe
    if (deltaX > 0) {
      navigateHorizontal('prev');
    } else {
      navigateHorizontal('next');
    }
  } else if (absY > absX && absY > minSwipeDistance) {
    // Vertical swipe
    if (deltaY > 0) {
      navigateVertical('prev');
    } else {
      navigateVertical('next');
    }
  } else if (absX < 10 && absY < 10) {
    // Tap on top edge
    const tapY = e.changedTouches[0].clientY;
    if (tapY < 60) {
      toggleTabBar();
    }
  }
}

// ==========================================================================
// Initial State & Onboarding
// ==========================================================================

function handleInitialState() {
  // Check for first-time visitor
  const hasOnboarded = localStorage.getItem(CONFIG.storageKeys.onboarded);

  if (!hasOnboarded) {
    showOnboarding();
    localStorage.setItem(CONFIG.storageKeys.onboarded, 'true');
  } else {
    // Show dimmed tab bar on session start
    setTimeout(() => {
      showTabBar(true);
    }, 500);
  }
}

function showOnboarding() {
  dom.onboarding.classList.remove('hidden');

  setTimeout(() => {
    dom.onboarding.classList.add('fading-out');

    setTimeout(() => {
      dom.onboarding.classList.add('hidden');
      dom.onboarding.classList.remove('fading-out');

      // Show dimmed tab bar after onboarding
      showTabBar(true);
    }, 500);
  }, CONFIG.onboardingDuration);
}

// ==========================================================================
// Loading & Error States
// ==========================================================================

function hideLoading() {
  dom.loadingState.classList.add('hidden');
}

function showError(message) {
  dom.loadingState.classList.add('hidden');
  dom.errorState.classList.remove('hidden');
  dom.errorState.querySelector('.error-message').textContent = message;
}

// ==========================================================================
// Initialize on DOM Ready
// ==========================================================================

// Expose state for debugging
window.getSlideState = () => ({
  allTags: Array.from(state.allTags),
  newTags: Array.from(state.newTags),
  selectedTags: Array.from(state.selectedTags),
  mode: state.mode,
  slidesCount: state.allSlides.length,
  firstSlideAsset: state.allSlides[0]?.asset,
  newsletter: state.newsletter
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
