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
    betweenPosts: 150,
    betweenGroups: 250,   // Bundle transitions
    betweenSections: 400, // Section transitions
    microSettle: 25,      // Hold at end of post transition
    edgeFlash: 200,
    sheen: 250,           // Directional sheen for group boundaries
    axisHint: 400,        // Micro-drift for section hints
    depthSwap: 400,       // Scale normalization for vertical transitions
    overlay: 400,         // Section overlay duration
  },

  // Brightness primitives
  brightness: {
    neutral: 1.0,
    postDimmed: 0.9,      // For post transitions
    bundleDimmed: 0.8,    // For bundle/group transitions
    sectionDimmed: 0.6,   // For section transitions
  },

  // Scale primitives
  scale: {
    bundleStart: 0.98,    // Bundle entrance scale
    sectionStart: 0.96,   // Section entrance scale
  },

  // Motion primitives (px)
  motion: {
    axisHintDrift: 3,     // Upward micro-drift for section hints
    sheenWidth: 120,      // Width of directional sheen effect
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
    sectionHorizontal: VISUAL_PRIMITIVES.durations.betweenSections,
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

  // Currently active video (playing in foreground or background)
  activeVideoIndex: null,

  // Bundle stack state
  bundleStack: [],          // Array of slide indices in current stack
  currentBundleId: null,    // Current bundle identifier (sectionIndex + groupIndex)

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
  sectionOverlay: null, // Dark overlay for section transitions
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
  dom.sectionOverlay = document.getElementById('section-overlay');
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

    // Process section.items[] which contains both posts and groups
    section.items?.forEach((item, itemIndex) => {
      // Determine if this is a post or a group
      const isGroup = item.items !== undefined;  // Groups have "items" property
      const isPost = item.assets !== undefined;  // Posts have "assets" property

      if (isPost) {
        // Non-bundled post at section level
        const postStartIndex = globalIndex;
        const postAssetCount = item.assets?.length || 0;

        item.assets?.forEach((asset, assetIndex) => {
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
            groupIndex: null,  // Not in a group
            postIndex: itemIndex,
            postId: item.id,
            postUrl: asset.url || item.url,  // Use asset.url if available, fallback to post.url
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
      } else if (isGroup) {
        // Bundled group
        const groupIndex = itemIndex;

        item.items?.forEach((post, postIndex) => {
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
              postId: post.id,
              postUrl: asset.url || post.url,  // Use asset.url if available, fallback to post.url
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
      }
    });
  });

  // Add exit slide at the end
  const exitSectionIndex = CONFIG.sectionMap['exit'];
  slides.push({
    sectionIndex: exitSectionIndex,
    sectionName: 'Exit',
    sectionKey: 'exit',
    groupIndex: null,
    postIndex: 0,
    postId: 'exit',
    postUrl: null,
    assetIndex: 0,
    asset: {
      type: 'html',
      html: `
        <div class="exit-slide-content">
          <div class="exit-slide-inner">
            <img src="assets/qr.png" alt="QR Code" class="exit-qr-code" />
            <div class="exit-message">
              <p class="exit-label">📚 <a href="index_all.html"><strong>view all previous issues</strong></a></p>
              <p class="exit-tagline">✨ see you next week!</p>
            </div>
          </div>
        </div>
      `
    },
    globalIndex: globalIndex,
    postStartIndex: globalIndex,
    postEndIndex: globalIndex,
    isHighlight: false
  });

  state.allSlides = slides;
  updateVisibleSlides();
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
}

// ==========================================================================
// Video Management - Simplified
// ==========================================================================

/**
 * Check if a video is the last video in its group.
 */
function isLastVideoInGroup(videoSlide, videoIndex) {
  // Standalone posts (not in a group) don't have this concept
  if (videoSlide.groupIndex === null) {
    return false;
  }

  // Look ahead for any more videos in the same group
  for (let i = videoIndex + 1; i < state.visibleSlides.length; i++) {
    const slide = state.visibleSlides[i];

    // Left the group
    if (slide.sectionIndex !== videoSlide.sectionIndex ||
        slide.groupIndex !== videoSlide.groupIndex) {
      break;
    }

    // Found another video in the group
    if (slide.asset.type === 'video') {
      return false;
    }
  }

  return true; // No more videos found in this group
}

/**
 * Find the last slide index in a group.
 */
function findGroupEndIndex(slide, startIndex) {
  let endIndex = startIndex;

  for (let i = startIndex + 1; i < state.visibleSlides.length; i++) {
    const nextSlide = state.visibleSlides[i];

    if (nextSlide.sectionIndex === slide.sectionIndex &&
        nextSlide.groupIndex === slide.groupIndex) {
      endIndex = i;
    } else {
      break;
    }
  }

  return endIndex;
}

/**
 * Calculate the activation range for a video slide.
 * Returns the end index where this video should stop being active.
 *
 * Rules:
 * - Videos extend to the end of their post
 * - If a video is the LAST video in a group, it extends to the END of the group
 */
function calculateVideoEndIndex(videoSlide, videoIndex) {
  // Default: end of the video's post
  let endIndex = videoSlide.postEndIndex;

  // If this is the last video in a group, extend to end of group
  if (isLastVideoInGroup(videoSlide, videoIndex)) {
    endIndex = findGroupEndIndex(videoSlide, videoIndex);
  }

  return endIndex;
}

/**
 * Find which video should be active for a given slide index.
 * Returns the video's slide index, or null if no video should be active.
 */
function findActiveVideoForSlide(slideIndex) {
  const currentSlide = state.visibleSlides[slideIndex];
  if (!currentSlide) return null;

  // If current slide is itself a video, return it
  if (currentSlide.asset.type === 'video') {
    return slideIndex;
  }

  // Look backwards for the most recent video
  for (let i = slideIndex - 1; i >= 0; i--) {
    const slide = state.visibleSlides[i];

    if (slide.asset.type === 'video') {
      // Check if current slide is within this video's range
      const videoEndIndex = calculateVideoEndIndex(slide, i);

      if (slideIndex >= i && slideIndex <= videoEndIndex) {
        return i; // This video covers the current slide
      }

      // Video found but doesn't cover current slide - no video is active
      return null;
    }
  }

  return null; // No video found
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

    // Resume normal tab bar auto-hide behavior
    if (!state.tabBarHovered) {
      clearTimeout(state.tabBarTimeout);
      state.tabBarTimeout = setTimeout(() => {
        hideTabBar();
      }, CONFIG.tabBarAutoHideDelay);
    }
  } else {
    // Panel is opening - ensure tab bar is visible and cancel any pending hide
    clearTimeout(state.tabBarTimeout);
    showTabBar(false);
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
  // Clear bundle stack when applying filter
  clearBundleStack();

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
  if (parts.length !== 2) return -1;

  const [sectionKey, slideNumStr] = parts;
  const slideNumInSection = parseInt(slideNumStr, 10);

  if (isNaN(slideNumInSection)) return -1;

  // Find the slide by counting slides within the section
  let countInSection = 0;
  return state.visibleSlides.findIndex(slide => {
    if (slide.sectionKey === sectionKey) {
      if (countInSection === slideNumInSection) {
        return true;
      }
      countInSection++;
    }
    return false;
  });
}

function updateURLHash() {
  const slide = state.visibleSlides[state.currentSlideIndex];
  if (!slide) return;

  // Calculate slide number within its section (0-indexed)
  let slideNumInSection = 0;
  for (let i = 0; i < state.currentSlideIndex; i++) {
    if (state.visibleSlides[i].sectionKey === slide.sectionKey) {
      slideNumInSection++;
    }
  }

  const hash = `${slide.sectionKey}/${slideNumInSection}`;
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

  if (slide.asset.type === 'html') {
    // Custom HTML content (can come from YAML or programmatically created)
    const container = document.createElement('div');
    container.innerHTML = slide.asset.html;
    div.appendChild(container);
  } else if (slide.asset.type === 'video') {
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
// Bundle Stack Management
// ==========================================================================

/**
 * Get unique bundle identifier for a slide.
 * Returns null if slide is not in a bundle (standalone post).
 */
function getBundleId(slide) {
  if (!slide || slide.groupIndex === null) {
    return null;
  }
  return `${slide.sectionIndex}-${slide.groupIndex}`;
}

/**
 * Check if two slides are in the same bundle.
 */
function isInSameBundle(slide1, slide2) {
  if (!slide1 || !slide2) return false;
  const id1 = getBundleId(slide1);
  const id2 = getBundleId(slide2);
  return id1 !== null && id1 === id2;
}

/**
 * Check if a slide is in a bundle.
 */
function isInBundle(slide) {
  return slide && slide.groupIndex !== null;
}

/**
 * Clear the bundle stack and fade out all stacked slides.
 */
function clearBundleStack() {
  // Fade out all stacked slides
  state.bundleStack.forEach(slideIndex => {
    const slideEl = dom.slideTrack.querySelector(`[data-index="${slideIndex}"]`);
    if (slideEl) {
      slideEl.classList.add('stack-fade-out');
      // Clean up after fade animation
      setTimeout(() => {
        slideEl.classList.remove('stacked', 'stack-fade-out',
          'stack-depth-2', 'stack-depth-3', 'stack-depth-4');
      }, 200);
    }
  });

  state.bundleStack = [];
  state.currentBundleId = null;
}

/**
 * Push a slide onto the bundle stack.
 */
function pushToStack(slideIndex) {
  // Add to stack
  state.bundleStack.push(slideIndex);

  // Update all stack depths
  updateStackDepths();
}

/**
 * Pop the top slide from the stack and return it.
 */
function popFromStack() {
  if (state.bundleStack.length === 0) return null;

  const poppedIndex = state.bundleStack.pop();
  const slideEl = dom.slideTrack.querySelector(`[data-index="${poppedIndex}"]`);

  if (slideEl) {
    // Remove stacked classes - it will become active
    slideEl.classList.remove('stacked', 'stack-depth-2', 'stack-depth-3', 'stack-depth-4');
  }

  // Update remaining stack depths
  updateStackDepths();

  return poppedIndex;
}

/**
 * Update depth classes on all stacked slides.
 * Most recent (top of stack) gets no depth class, older ones get increasing depth.
 */
function updateStackDepths() {
  const stackLength = state.bundleStack.length;

  state.bundleStack.forEach((slideIndex, i) => {
    const slideEl = dom.slideTrack.querySelector(`[data-index="${slideIndex}"]`);
    if (!slideEl) return;

    // Calculate depth from top of stack (0 = just below active, 1 = next, etc.)
    const depthFromTop = stackLength - 1 - i;

    // Add stacked class and appropriate depth
    slideEl.classList.add('stacked');
    slideEl.classList.remove('stack-depth-2', 'stack-depth-3', 'stack-depth-4', 'prev', 'next');

    if (depthFromTop === 1) {
      slideEl.classList.add('stack-depth-2');
    } else if (depthFromTop === 2) {
      slideEl.classList.add('stack-depth-3');
    } else if (depthFromTop >= 3) {
      slideEl.classList.add('stack-depth-4');
    }
  });
}

/**
 * Check if the target slide is in our current stack (for backward navigation).
 */
function isInCurrentStack(slideIndex) {
  return state.bundleStack.includes(slideIndex);
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
  let stackAction = null; // 'push', 'pop', 'clear', or null

  if (current.sectionIndex !== target.sectionIndex) {
    // Section boundary crossed - clear stack
    transitionType = 'sectionHorizontal';
    stackAction = 'clear';
  } else if (current.groupIndex !== target.groupIndex) {
    // Bundle boundary crossed - clear stack
    transitionType = 'betweenGroups';
    stackAction = 'clear';
  } else if (current.postIndex !== target.postIndex) {
    // Post boundary within same bundle
    transitionType = 'betweenPosts';

    // Check if we're in a bundle
    if (isInBundle(current)) {
      if (isInCurrentStack(targetIndex)) {
        // Target is already in stack - pop it (un-dim in place)
        stackAction = 'pop';
      } else {
        // Target not in stack - push current and slide in target
        // Works for both directions: forward builds stack left-to-right,
        // backward (re-entering from end) builds stack right-to-left
        stackAction = 'push';
      }
    }
  }

  // Initialize bundle tracking if entering a bundle
  const targetBundleId = getBundleId(target);
  if (targetBundleId && state.currentBundleId !== targetBundleId) {
    // Entering a new bundle - start fresh stack
    if (state.bundleStack.length > 0) {
      clearBundleStack();
    }
    state.currentBundleId = targetBundleId;
  }

  goToSlide(targetIndex, direction, transitionType, stackAction);
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

  // Clear stack when changing sections
  goToSlide(targetIndex, direction, 'section', 'clear');
}

function goToSection(sectionKey) {
  if (state.isAnimating) return;

  const targetIndex = state.visibleSlides.findIndex(
    slide => slide.sectionKey === sectionKey
  );

  if (targetIndex === -1 || targetIndex === state.currentSlideIndex) return;

  const direction = targetIndex > state.currentSlideIndex ? 'next' : 'prev';
  // Clear stack when changing sections
  goToSlide(targetIndex, direction, 'section', 'clear');
}

function goToSlide(targetIndex, direction, transitionType = 'withinPost', stackAction = null) {
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

  // Handle stack actions before transition
  if (stackAction === 'clear') {
    clearBundleStack();
  }

  // Get duration and apply transition effects based on type
  const duration = getTransitionDuration(transitionType);

  // Handle video activation states
  updateVideoStates(targetIndex);

  // Execute transition based on stack action
  if (stackAction === 'pop') {
    // Backward navigation within bundle - pop from stack (no slide for target)
    executeStackPopTransition(currentSlideEl, targetSlideEl, direction, duration);
  } else if (stackAction === 'push') {
    // Forward navigation within bundle - push current to stack
    executeStackPushTransition(currentSlideEl, targetSlideEl, direction, duration);
  } else {
    // Standard transitions
    applyTransitionEffects(currentSlideEl, targetSlideEl, transitionType, direction);

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
    'depth-swap', 'axis-hint-up', 'axis-hint-down', 'scale-enter'
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
      // Trigger thin edge flash for post transitions
      flashEdge(direction);
      break;

    case 'betweenGroups':
      currentEl.classList.add('transition-groups', 'transitioning-out');
      targetEl.classList.add('transition-groups', 'scale-enter');
      // Trigger thick edge glow and sheen effect
      triggerGroupTransitionEffects(direction);
      break;

    case 'sectionHorizontal':
      currentEl.classList.add('transition-section-horizontal', 'transitioning-out');
      targetEl.classList.add('transition-section-horizontal');
      // Apply axis hint (micro-drift) with scale
      targetEl.classList.add(direction === 'next' ? 'axis-hint-up' : 'axis-hint-down');
      // Trigger section transition effects
      triggerSectionTransitionEffects();
      showTabBar(false);
      break;

    case 'section':
      currentEl.classList.add('transition-section', 'transitioning-out');
      targetEl.classList.add('transition-section', 'depth-swap');
      // Trigger section transition effects
      triggerSectionTransitionEffects();
      showTabBar(false);
      break;
  }

  // Direction class affects easing
  if (direction === 'prev') {
    currentEl.classList.add('direction-backward');
    targetEl.classList.add('direction-backward');
  }
}

/**
 * Trigger section transition visual effects (overlay + tab pulse)
 */
function triggerSectionTransitionEffects() {
  // Show dark overlay
  if (dom.sectionOverlay) {
    dom.sectionOverlay.classList.add('active');
    setTimeout(() => {
      dom.sectionOverlay.classList.remove('active');
    }, VISUAL_PRIMITIVES.durations.overlay);
  }

  // Pulse the active tab after a short delay (when new section is visible)
  setTimeout(() => {
    pulseActiveTab();
  }, VISUAL_PRIMITIVES.durations.overlay * 0.3);
}

/**
 * Pulse the currently active tab to draw attention
 */
function pulseActiveTab() {
  const activeTab = document.querySelector('.tab.active');
  if (activeTab) {
    activeTab.classList.remove('transitioning');
    void activeTab.offsetWidth; // Force reflow
    activeTab.classList.add('transitioning');
    // Remove class after animation
    setTimeout(() => {
      activeTab.classList.remove('transitioning');
    }, 400);
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
 * Execute stack push transition (navigation within bundle).
 * Current slide gets pushed to stack, target slides in from the navigation direction.
 * Works for both forward (→) and backward (←) navigation.
 */
function executeStackPushTransition(currentEl, targetEl, direction, duration) {
  const currentIndex = parseInt(currentEl.dataset.index);

  // Push current slide to stack (it will stay visible but dimmed)
  pushToStack(currentIndex);

  // Current slide loses 'active' but stays visible as 'stacked'
  currentEl.classList.remove('active');
  currentEl.classList.add('stack-top'); // Temporarily higher z-index during transition

  // Target slide enters from the appropriate side based on direction
  targetEl.classList.remove('prev', 'next', 'stacked');
  targetEl.classList.add('active', 'stack-top');

  // Trigger edge flash for the transition
  flashEdge(direction);

  // Clean up stack-top class after transition
  setTimeout(() => {
    currentEl.classList.remove('stack-top');
    targetEl.classList.remove('stack-top');
  }, duration);
}

/**
 * Execute stack pop transition (returning to a stacked slide).
 * Current slide slides out, target (already in stack) un-dims in place.
 * Works for both directions: popping when going backward or forward.
 */
function executeStackPopTransition(currentEl, targetEl, direction, duration) {
  // Pop target from stack (removes stacked classes)
  popFromStack();

  // Current slide exits in the direction we're navigating FROM
  // (opposite to where we're going)
  currentEl.classList.remove('active');
  currentEl.classList.add(direction === 'next' ? 'prev' : 'next');

  // Target slide is already visible (was stacked) - just make it active
  targetEl.classList.remove('stacked', 'stack-depth-2', 'stack-depth-3', 'stack-depth-4', 'prev', 'next');
  targetEl.classList.add('active', 'unstacking');

  // Clean up unstacking class after transition
  setTimeout(() => {
    targetEl.classList.remove('unstacking');
  }, duration);
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
      'axis-hint-up', 'axis-hint-down', 'scale-enter',
      'stack-top', 'unstacking'
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

  // Initialize video states
  updateVideoStates(state.currentSlideIndex);
}

/**
 * Update video states based on current slide index.
 * Handles foreground/background states and stops videos outside their range.
 */
function updateVideoStates(targetIndex) {
  const newActiveVideoIndex = findActiveVideoForSlide(targetIndex);
  const previousActiveVideoIndex = state.activeVideoIndex;

  // Stop previous video if it's different from the new one
  if (previousActiveVideoIndex !== null && previousActiveVideoIndex !== newActiveVideoIndex) {
    stopVideo(previousActiveVideoIndex);
  }

  // Update tracking
  state.activeVideoIndex = newActiveVideoIndex;

  // Start/continue the active video
  if (newActiveVideoIndex !== null) {
    const videoSlideEl = dom.slideTrack.querySelector(`[data-index="${newActiveVideoIndex}"]`);
    const video = videoSlideEl?.querySelector('video');

    if (video) {
      if (targetIndex === newActiveVideoIndex) {
        // Video is in foreground - show as active slide
        videoSlideEl.classList.remove('video-background');
        if (video.paused) {
          video.muted = false;
          video.play().catch(() => {});
        }
      } else {
        // Video is in background - keep playing but layer behind current slide
        videoSlideEl.classList.add('video-background', 'active');
        if (video.paused) {
          video.muted = false;
          video.play().catch(() => {});
        }
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

  // Clear bundle stack when changing modes
  clearBundleStack();

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

  // Never dim if mouse is hovering over tab bar or tag panel is open
  if (state.tabBarHovered || state.tagPanelVisible) {
    dom.tabBar.classList.remove('dimmed');
  } else {
    dom.tabBar.classList.toggle('dimmed', dimmed);
  }

  state.tabBarVisible = true;

  // Only auto-hide if not being hovered and tag panel is not open
  if (!state.tabBarHovered && !state.tagPanelVisible) {
    const delay = dimmed ? CONFIG.tabBarDimmedDuration : CONFIG.tabBarAutoHideDelay;
    state.tabBarTimeout = setTimeout(() => {
      if (!state.tabBarHovered && !state.tagPanelVisible) {
        hideTabBar();
      }
    }, delay);
  }
}

function hideTabBar() {
  // Don't hide if mouse is over the tab bar or tag panel is open
  if (state.tabBarHovered || state.tagPanelVisible) return;

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

  // Don't auto-hide if tag panel is open - keep both visible together
  if (state.tagPanelVisible) {
    return;
  }

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
      const isClickOnTabBar = dom.tabBar.contains(e.target);
      if (!isClickInsidePanel && !isClickOnFilterButton && !isClickOnTabBar) {
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
