(function () {
    "use strict";
    function enhanceReveal() {
        var items = document.querySelectorAll("[data-reveal]");
        if (!("IntersectionObserver" in window)) {
            items.forEach(function (item) { item.classList.add("is-visible"); });
            return;
        }
        var observer = new IntersectionObserver(function (entries, instance) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                instance.unobserve(entry.target);
            });
        }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
        items.forEach(function (item) { observer.observe(item); });
    }
    function addButtonFeedback() {
        document.addEventListener("pointerdown", function (event) {
            var button = event.target.closest("button, .landing-btn, .landing-header-cta, .landing-text-link");
            if (!button) return;
            button.classList.remove("is-pressed");
            window.requestAnimationFrame(function () { button.classList.add("is-pressed"); });
            window.setTimeout(function () { button.classList.remove("is-pressed"); }, 260);
        }, { passive: true });
    }
    function addKeyboardState() {
        document.addEventListener("keydown", function (event) {
            if (event.key === "Tab") document.documentElement.classList.add("keyboard-user");
        }, { passive: true });
        document.addEventListener("pointerdown", function () {
            document.documentElement.classList.remove("keyboard-user");
        }, { passive: true });
    }
    document.addEventListener("DOMContentLoaded", function () {
        enhanceReveal();
        addButtonFeedback();
        addKeyboardState();
    });
}());
