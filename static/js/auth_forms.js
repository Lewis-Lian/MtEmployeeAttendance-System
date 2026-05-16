(function () {
  function bindPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      const targetSelector = btn.getAttribute("data-password-toggle");
      const input = targetSelector ? document.querySelector(targetSelector) : null;
      if (!input) return;

      btn.addEventListener("click", () => {
        const visible = input.type === "text";
        input.type = visible ? "password" : "text";
        btn.setAttribute("aria-label", visible ? "显示密码" : "隐藏密码");
        btn.classList.toggle("is-visible", !visible);
      });
      btn.dataset.bound = "1";
    });
  }

  function bindBrandSlider() {
    const slider = document.querySelector("[data-login-slider]");
    const slides = slider ? Array.from(slider.querySelectorAll(".login-brand-slide")) : [];
    const dots = Array.from(document.querySelectorAll(".login-brand-dot"));
    if (!slider || !slides.length || !dots.length || slider.dataset.bound === "1") return;

    let activeIndex = 0;
    let timer = null;

    function showSlide(index) {
      activeIndex = index;
      slides.forEach((slide, slideIndex) => {
        slide.classList.toggle("is-active", slideIndex === index);
      });
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("is-active", dotIndex === index);
        dot.setAttribute("aria-selected", dotIndex === index ? "true" : "false");
      });
    }

    function startSlider() {
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        showSlide((activeIndex + 1) % slides.length);
      }, 4200);
    }

    dots.forEach((dot, index) => {
      dot.addEventListener("click", () => {
        showSlide(index);
        startSlider();
      });
    });

    slider.addEventListener("mouseenter", () => {
      window.clearInterval(timer);
    });
    slider.addEventListener("mouseleave", startSlider);

    showSlide(0);
    startSlider();
    slider.dataset.bound = "1";
  }

  function bindAuthSlider() {
    document.querySelectorAll("[data-auth-slider]").forEach((root) => {
      if (root.dataset.bound === "1") return;

      const track = root.querySelector(".auth-slider-track");
      const thumb = root.querySelector(".auth-slider-thumb");
      const fill = root.querySelector(".auth-slider-fill");
      const label = root.querySelector(".auth-slider-label");
      const hidden = root.querySelector('input[name="slider_verified"]');
      const form = root.closest("form");
      if (!track || !thumb || !fill || !label || !hidden || !form) return;

      let dragging = false;
      let verified = false;
      let startX = 0;
      let startLeft = 0;

      function maxOffset() {
        return Math.max(0, track.clientWidth - thumb.offsetWidth - 4);
      }

      function setOffset(offset) {
        const safeOffset = Math.max(0, Math.min(offset, maxOffset()));
        thumb.style.transform = `translateX(${safeOffset}px)`;
        fill.style.width = `${safeOffset + thumb.offsetWidth / 2}px`;
      }

      function markVerified() {
        verified = true;
        hidden.value = "1";
        root.classList.add("is-verified");
        label.textContent = "验证通过";
        setOffset(maxOffset());
      }

      function resetSlider() {
        verified = false;
        hidden.value = "0";
        root.classList.remove("is-verified");
        label.textContent = "请按住滑块，拖动到最右侧完成验证";
        setOffset(0);
      }

      function onPointerMove(clientX) {
        if (!dragging || verified) return;
        const offset = startLeft + (clientX - startX);
        setOffset(offset);
      }

      function onPointerUp() {
        if (!dragging) return;
        dragging = false;
        root.classList.remove("is-dragging");
        const current = parseFloat((thumb.style.transform.match(/translateX\(([-\d.]+)px\)/) || [0, 0])[1]);
        if (current >= maxOffset() - 2) {
          markVerified();
        } else {
          resetSlider();
        }
      }

      thumb.addEventListener("mousedown", (event) => {
        if (verified) return;
        dragging = true;
        startX = event.clientX;
        startLeft = parseFloat((thumb.style.transform.match(/translateX\(([-\d.]+)px\)/) || [0, 0])[1]);
        root.classList.add("is-dragging");
        event.preventDefault();
      });

      thumb.addEventListener("touchstart", (event) => {
        if (verified) return;
        dragging = true;
        startX = event.touches[0].clientX;
        startLeft = parseFloat((thumb.style.transform.match(/translateX\(([-\d.]+)px\)/) || [0, 0])[1]);
        root.classList.add("is-dragging");
      }, { passive: true });

      window.addEventListener("mousemove", (event) => onPointerMove(event.clientX));
      window.addEventListener("touchmove", (event) => onPointerMove(event.touches[0].clientX), { passive: true });
      window.addEventListener("mouseup", onPointerUp);
      window.addEventListener("touchend", onPointerUp);

      window.addEventListener("resize", () => {
        if (verified) {
          setOffset(maxOffset());
        } else {
          resetSlider();
        }
      });

      form.addEventListener("submit", (event) => {
        if (hidden.value === "1") return;
        event.preventDefault();
        root.classList.add("is-error");
        label.textContent = "请先完成滑动验证";
      });

      root.addEventListener("mousedown", () => {
        root.classList.remove("is-error");
      });
      root.addEventListener("touchstart", () => {
        root.classList.remove("is-error");
      }, { passive: true });

      resetSlider();
      root.dataset.bound = "1";
    });
  }

  function bindSuccessRedirect() {
    const successAlert = document.querySelector("[data-success-redirect]");
    if (!successAlert || successAlert.dataset.bound === "1") return;

    const redirectUrl = successAlert.getAttribute("data-success-redirect");
    const countdownNode = successAlert.querySelector("[data-success-countdown]");
    let remaining = Number(successAlert.getAttribute("data-success-seconds") || 2);
    if (!redirectUrl || !countdownNode || !Number.isFinite(remaining) || remaining <= 0) return;

    countdownNode.textContent = String(remaining);
    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(timer);
        window.location.href = redirectUrl;
        return;
      }
      countdownNode.textContent = String(remaining);
    }, 1000);

    successAlert.dataset.bound = "1";
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindPasswordToggles();
    bindBrandSlider();
    bindAuthSlider();
    bindSuccessRedirect();
  });
})();
