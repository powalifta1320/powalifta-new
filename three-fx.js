/* ============================================================
 * POWALIFTA three-fx — Real 3D barbell in the hero using Three.js.
 *
 * Lives behind the hero text. Plates physically load on as the user
 * scrolls down the page. Bar bends + breathes. Camera tilts with
 * cursor. Lights with red rim glow matching brand.
 *
 * Loads Three.js r128 from cdnjs. Skips gracefully if:
 *   - prefers-reduced-motion is set
 *   - WebGL is unavailable
 *   - Viewport width < 720 (perf/aesthetic)
 *   - Three.js fails to load
 * ============================================================ */
(function () {
  'use strict';

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function loadThree(cb) {
    if (window.THREE) { cb(); return; }
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = cb;
    script.onerror = function () {
      var loading = document.querySelector('.fx-three-loading');
      if (loading) loading.classList.add('fx-hide');
    };
    document.head.appendChild(script);
  }

  function init() {
    var THREE = window.THREE;
    if (!THREE) return;

    var hero = document.querySelector('header.hero');
    if (!hero) return;

    var wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;';

    var canvas = document.createElement('canvas');
    canvas.className = 'fx-three-canvas';
    wrap.appendChild(canvas);

    var loading = document.createElement('div');
    loading.className = 'fx-three-loading';
    loading.textContent = 'Loading 3D scene';
    wrap.appendChild(loading);

    hero.insertBefore(wrap, hero.firstChild);

    var w = hero.clientWidth || window.innerWidth;
    var h = hero.clientHeight || window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      wrap.parentNode.removeChild(wrap);
      return;
    }
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 200);
    camera.position.set(0, 1.6, 22);
    camera.lookAt(0, 0, 0);

    var ambient = new THREE.AmbientLight(0x1a1a22, 0.55);
    scene.add(ambient);

    var keyLight = new THREE.DirectionalLight(0xffe8d4, 0.9);
    keyLight.position.set(7, 12, 9);
    scene.add(keyLight);

    var rimRed = new THREE.PointLight(0xff2d3f, 4.5, 60);
    rimRed.position.set(-8, 4, 3);
    scene.add(rimRed);

    var fillRed = new THREE.PointLight(0xff2d3f, 2.5, 80);
    fillRed.position.set(10, -3, 6);
    scene.add(fillRed);

    var backFill = new THREE.PointLight(0xb71629, 3, 80);
    backFill.position.set(0, 6, -8);
    scene.add(backFill);

    var barbell = new THREE.Group();
    scene.add(barbell);
    barbell.position.y = -0.3;

    var steel = new THREE.MeshStandardMaterial({ color: 0x9a9aa4, metalness: 0.92, roughness: 0.22 });
    var sleeveMat = new THREE.MeshStandardMaterial({ color: 0x6a6a72, metalness: 0.85, roughness: 0.28 });
    var collarMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.7, roughness: 0.38 });
    var plateMat = new THREE.MeshStandardMaterial({
      color: 0xff2d3f, metalness: 0.45, roughness: 0.35,
      emissive: 0x550810, emissiveIntensity: 0.5
    });
    var plateEdgeMat = new THREE.MeshStandardMaterial({ color: 0x1a0608, metalness: 0.6, roughness: 0.5 });

    var BAR_LENGTH = 16;
    var BAR_RADIUS = 0.18;
    var bar = new THREE.Mesh(new THREE.CylinderGeometry(BAR_RADIUS, BAR_RADIUS, BAR_LENGTH, 24, 12), steel);
    bar.rotation.z = Math.PI / 2;
    barbell.add(bar);

    var SLEEVE_LEN = 2.8;
    var SLEEVE_R = 0.36;
    var leftSleeve = new THREE.Mesh(new THREE.CylinderGeometry(SLEEVE_R, SLEEVE_R, SLEEVE_LEN, 28), sleeveMat);
    leftSleeve.rotation.z = Math.PI / 2;
    leftSleeve.position.x = -(BAR_LENGTH / 2) + (SLEEVE_LEN / 2) + 0.1;
    barbell.add(leftSleeve);

    var rightSleeve = leftSleeve.clone();
    rightSleeve.position.x = -leftSleeve.position.x;
    barbell.add(rightSleeve);

    var leftCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.45, 24), collarMat);
    leftCollar.rotation.z = Math.PI / 2;
    leftCollar.position.x = leftSleeve.position.x + SLEEVE_LEN / 2 + 0.1;
    barbell.add(leftCollar);
    var rightCollar = leftCollar.clone();
    rightCollar.position.x = -leftCollar.position.x;
    barbell.add(rightCollar);

    var PLATE_SIZES = [1.65, 1.5, 1.35, 1.2, 1.05, 0.9];
    var PLATE_THICK = 0.20;
    var plates = [];
    function buildPlates(side) {
      var dir = side === 'left' ? -1 : 1;
      var collarInner = leftSleeve.position.x * dir + (SLEEVE_LEN / 2 * dir * -1);
      var startX = (leftSleeve.position.x * dir * -1) - (SLEEVE_LEN / 2 - 0.1) * dir;
      for (var i = 0; i < PLATE_SIZES.length; i++) {
        var size = PLATE_SIZES[i];
        var group = new THREE.Group();
        var face = new THREE.Mesh(new THREE.CylinderGeometry(size, size, PLATE_THICK, 36), plateMat);
        face.rotation.z = Math.PI / 2;
        group.add(face);
        var edge = new THREE.Mesh(new THREE.TorusGeometry(size - 0.01, 0.04, 8, 36), plateEdgeMat);
        edge.rotation.y = Math.PI / 2;
        group.add(edge);
        var targetX = startX + dir * (i * (PLATE_THICK + 0.04) + PLATE_THICK / 2);
        group.position.x = targetX;
        group.userData = { targetX: targetX, restY: 0, size: size, currentScale: 0.01, dir: dir };
        group.scale.set(0.01, 0.01, 0.01);
        barbell.add(group);
        plates.push(group);
      }
    }
    buildPlates('left');
    buildPlates('right');

    var scrollProgress = 0;
    var max = 1;
    function recalcMax() {
      max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    }
    function onScroll() {
      scrollProgress = Math.min(1, Math.max(0, window.scrollY / max));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
      recalcMax();
      onResize();
    }, { passive: true });
    recalcMax();
    onScroll();

    var mouseX = 0, mouseY = 0;
    function onMouseMove(e) {
      var rect = hero.getBoundingClientRect();
      var px = (e.clientX - rect.left) / Math.max(1, rect.width);
      var py = (e.clientY - rect.top) / Math.max(1, rect.height);
      mouseX = (px - 0.5) * 2;
      mouseY = (py - 0.5) * 2;
    }
    hero.addEventListener('mousemove', onMouseMove, { passive: true });

    function onResize() {
      var nw = hero.clientWidth || window.innerWidth;
      var nh = hero.clientHeight || window.innerHeight;
      renderer.setSize(nw, nh, false);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    }

    var camX = 0, camY = 1.6, camZ = 22;
    var groupRotY = 0, groupRotX = 0;
    var t = 0;

    var raf = null;
    function render() {
      raf = requestAnimationFrame(render);

      var rect = hero.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return;

      t += 0.008;

      var targetCamX = mouseX * 2.2;
      var targetCamY = 1.6 - mouseY * 0.9;
      camX += (targetCamX - camX) * 0.05;
      camY += (targetCamY - camY) * 0.05;
      camera.position.set(camX, camY, camZ);
      camera.lookAt(0, 0, 0);

      var targetRotY = mouseX * 0.18 + Math.sin(t * 0.7) * 0.05;
      var targetRotX = -mouseY * 0.08 + Math.sin(t * 0.5) * 0.02;
      groupRotY += (targetRotY - groupRotY) * 0.08;
      groupRotX += (targetRotX - groupRotX) * 0.08;
      barbell.rotation.y = groupRotY;
      barbell.rotation.x = groupRotX;

      var loadAmount = scrollProgress;
      var bendY = -Math.sin(loadAmount * Math.PI) * 0.18;
      bar.position.y = bendY;
      leftSleeve.position.y = bendY * 0.3;
      rightSleeve.position.y = bendY * 0.3;
      leftCollar.position.y = bendY * 0.5;
      rightCollar.position.y = bendY * 0.5;

      var platesToLoad = Math.round(loadAmount * PLATE_SIZES.length);
      for (var i = 0; i < plates.length; i++) {
        var p = plates[i];
        var idx = i % PLATE_SIZES.length;
        var sideIdx = Math.floor(i / PLATE_SIZES.length);
        var shouldShow = idx < platesToLoad;
        var targetScale = shouldShow ? 1 : 0.01;
        p.userData.currentScale += (targetScale - p.userData.currentScale) * 0.15;
        p.scale.setScalar(p.userData.currentScale);
        var settlePos = bendY * (sideIdx === 0 ? 0.65 : 0.65) * (0.5 + idx * 0.1);
        p.position.y = settlePos;
        p.rotation.x = Math.sin(t + i * 0.5) * 0.03 * p.userData.currentScale;
      }

      rimRed.intensity = 4.5 + Math.sin(t * 1.4) * 1.2 + loadAmount * 2;
      fillRed.intensity = 2.5 + Math.sin(t * 0.9 + 1) * 0.8 + loadAmount * 1.5;

      renderer.render(scene, camera);
    }

    setTimeout(function () {
      loading.classList.add('fx-hide');
      canvas.classList.add('fx-ready');
    }, 400);

    onResize();
    render();
  }

  ready(function () {
    if (reduced()) return;
    if (!hasWebGL()) return;
    if (window.innerWidth < 720) return;

    loadThree(init);
  });
})();
