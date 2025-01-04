/*****************************************************************
** Author: Fran Pérez
** A plugin for Reveal.js that provides automatic vertical scrolling of images
** within a container, ensuring that large/tall images become visible
** over time.
**
** Version: 1.0.0
**
** License: MIT
**
******************************************************************/

window.RevealScrollingImage = window.RevealScrollingImage || {
    id: 'RevealScrollingImage',
    init: function(deck) {
        initScrollingImage(deck);
    }
};

function initScrollingImage(Reveal) {
    let scrollingData = [];

    const speed = 0.5; // scroll speed in pixels per frame
    let rafID;

    // Called once Reveal is ready
    Reveal.addEventListener('ready', function(event) {
        setupScrollingImages(Reveal);
    });

    // Update measurements and restart animation on slide change
    Reveal.addEventListener('slidechanged', function(event) {
        stopAnimation();
        updateAllMeasurements();
        startAnimation();
    });

    // Also handle window resize
    window.addEventListener('resize', function() {
        // Debounce the resize handling
        clearTimeout(window.__revealScrollingImageResizeTimer);
        window.__revealScrollingImageResizeTimer = setTimeout(() => {
            updateAllMeasurements();
        }, 100);
    });

    function setupScrollingImages(Reveal) {
        // Find all slides that have the data-scrolling-image attribute
        const slides = Reveal.getSlides();
        slides.forEach(slide => {
            if (slide.hasAttribute('data-scrolling')) {
                const img = slide.querySelector('.scrolling');
                let container = slide.querySelector('.scrolling-container');
                if (!container) {
                    container = img.parentElement;
                }
                if (container && img) {
                    const data = {
                        slide: slide,
                        container: container,
                        img: img,
                        scrollPosition: 0,
                        direction: 1,
                        maxScroll: 0
                    };
                    scrollingData.push(data);

                    // Update measurements once image is loaded
                    if (img.complete) {
                        updateMeasurementsFor(data);
                    } else {
                        img.addEventListener('load', () => updateMeasurementsFor(data));
                    }
                }
            }
        });

        updateAllMeasurements();
        startAnimation();
    }

    function updateAllMeasurements() {
        scrollingData.forEach(data => updateMeasurementsFor(data));
    }

    function updateMeasurementsFor(data) {
        const containerRect = data.container.getBoundingClientRect();
        const imgRect = data.img.getBoundingClientRect();

        const imagePadding = 145 // 165
        const containerHeight = imgRect.height; //containerRect.height;
        const imageHeight = data.img.offsetHeight + imagePadding; // imgRect.height;

        if (imageHeight <= containerHeight) {
            // Image fits entirely, no scroll needed
            data.maxScroll = 0;
            data.scrollPosition = 0;
            data.img.style.transform = 'translateY(0)';
            return;
        }

        //console.log("containerRect: " + containerRect.height)
        console.log("imgRect: " + imgRect.height)
        console.log("naturalHeight: " + data.img.naturalHeight)
        console.log("offsetHeight: " + data.img.offsetHeight)

        data.maxScroll = imageHeight - containerHeight;
        // Ensure scrollPosition is within bounds
        if (data.scrollPosition > data.maxScroll) {
            data.scrollPosition = data.maxScroll;
        }
    }

    function animate() {
        // Only animate if the current slide is one of the scrolling slides
        const currentSlide = Reveal.getCurrentSlide();
        scrollingData.forEach(data => {
            if (data.slide === currentSlide && data.maxScroll > 0) {
                data.scrollPosition += data.direction * speed;

                if (data.scrollPosition >= data.maxScroll) {
                    data.scrollPosition = data.maxScroll;
                    data.direction = -1;
                } else if (data.scrollPosition <= 0) {
                    data.scrollPosition = 0;
                    data.direction = 1;
                }

                data.img.style.transform = `translateY(-${data.scrollPosition}px)`;
            } else if (data.slide !== currentSlide) {
                // If it's not the current slide, reset position or do nothing
                // as we don't animate when not visible.
            }
        });

        rafID = requestAnimationFrame(animate);
    }

    function startAnimation() {
        // Start animating only if there is at least one data set for current slide
        // and we are currently on a slide that uses scrolling images
        const currentSlide = Reveal.getCurrentSlide();
        if (scrollingData.some(data => data.slide === currentSlide)) {
            stopAnimation();
            rafID = requestAnimationFrame(animate);
        }
    }

    function stopAnimation() {
        if (rafID) {
            cancelAnimationFrame(rafID);
            rafID = null;
        }
    }
}
