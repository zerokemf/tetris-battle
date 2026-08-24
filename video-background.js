// Full-screen gameplay video lifecycle for the menu attract surface.
(() => {
    'use strict';

    const video = document.getElementById('menu-gameplay-video');
    const wrapper = document.getElementById('menu-gameplay-video-wrap');
    if (!video || !wrapper) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let playAttempts = 0;
    let lastError = '';
    let playbackGeneration = 0;
    let retryTimer = 0;
    let transientRetries = 0;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    function shouldPlay() {
        return document.body.classList.contains('at-menu') && !document.hidden && !reducedMotion.matches;
    }

    async function syncPlayback() {
        const generation = ++playbackGeneration;
        if (!shouldPlay()) {
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = 0;
            transientRetries = 0;
            video.pause();
            wrapper.classList.toggle('is-static', reducedMotion.matches);
            return;
        }

        wrapper.classList.remove('is-static');
        playAttempts++;
        try {
            await video.play();
            if (generation !== playbackGeneration || !shouldPlay()) return;
            transientRetries = 0;
            wrapper.classList.add('is-playing');
            lastError = '';
        } catch (error) {
            if (generation !== playbackGeneration) return;
            lastError = String(error && error.message || error);
            wrapper.classList.remove('is-playing');
            const transient = error?.name === 'AbortError' || /interrupted by a call to pause/i.test(lastError);
            if (transient && shouldPlay() && transientRetries < 2) {
                transientRetries++;
                if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) video.load();
                if (retryTimer) clearTimeout(retryTimer);
                retryTimer = setTimeout(() => {
                    retryTimer = 0;
                    syncPlayback();
                }, 120);
            }
        }
    }

    video.addEventListener('loadeddata', () => {
        wrapper.classList.add('is-ready');
        syncPlayback();
    });
    video.addEventListener('playing', () => wrapper.classList.add('is-playing'));
    video.addEventListener('pause', () => wrapper.classList.remove('is-playing'));
    video.addEventListener('error', () => {
        const mediaError = video.error;
        lastError = mediaError ? `MediaError ${mediaError.code}` : 'Unknown video error';
        wrapper.classList.add('has-error');
    });

    if (typeof reducedMotion.addEventListener === 'function') {
        reducedMotion.addEventListener('change', syncPlayback);
    } else if (typeof reducedMotion.addListener === 'function') {
        reducedMotion.addListener(syncPlayback);
    }
    document.addEventListener('visibilitychange', syncPlayback);
    new MutationObserver(syncPlayback).observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
    });

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        wrapper.classList.add('is-ready');
    }
    syncPlayback();

    // Read-only diagnostics for objective production E2E checks.
    window.__videoBackground = Object.freeze({
        get shouldPlay() { return shouldPlay(); },
        get paused() { return video.paused; },
        get currentTime() { return video.currentTime; },
        get duration() { return video.duration; },
        get readyState() { return video.readyState; },
        get dimensions() { return [video.videoWidth, video.videoHeight]; },
        get playAttempts() { return playAttempts; },
        get lastError() { return lastError; }
    });
})();
