import { useEffect, useRef } from "react";
import * as THREE from "three";
import khadimMark from "../assets/khadim-mark-transparent.svg";

export function KhadimLogoScene(): React.JSX.Element {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = sceneRef.current;
    const canvas = container?.querySelector("canvas");
    if (!container || !(canvas instanceof HTMLCanvasElement)) return;

    const context = canvas.getContext("webgl2", { alpha: true, antialias: true });
    if (!context) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    camera.position.z = 5;

    const logoGroup = new THREE.Group();
    scene.add(logoGroup);

    const geometry = new THREE.PlaneGeometry(2.25, 2.25);
    const materials: THREE.MeshBasicMaterial[] = [];
    let disposed = false;
    const texture = new THREE.TextureLoader().load(khadimMark, () => {
      if (disposed) return;
      texture.colorSpace = THREE.SRGBColorSpace;

      for (let layer = 6; layer >= 0; layer -= 1) {
        const depth = layer * 0.035;
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: layer === 0 ? 1 : 0.12 - layer * 0.012,
          color: layer === 0 ? 0xffffff : 0x69d2d5,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(depth * 0.48, -depth * 0.3, -depth);
        logoGroup.add(mesh);
        materials.push(material);
      }

      canvas.dataset.ready = "true";
      renderFrame(performance.now());
    });

    let width = 0;
    let height = 0;
    const resize = (): void => {
      const nextWidth = Math.max(container.clientWidth, 1);
      const nextHeight = Math.max(container.clientHeight, 1);
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();

    const pointer = new THREE.Vector2();
    const pointerTarget = new THREE.Vector2();
    const onPointerMove = (event: PointerEvent): void => {
      const bounds = container.getBoundingClientRect();
      pointerTarget.set(
        ((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 2,
        ((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 2,
      );
    };
    const onPointerLeave = (): void => {
      pointerTarget.set(0, 0);
    };
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);

    let animationFrame = 0;
    let previousTime = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function renderFrame(time: number): void {
      resize();
      const delta = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      pointer.lerp(pointerTarget, 1 - Math.exp(-delta * 5));

      if (!reducedMotion) {
        logoGroup.rotation.x = -pointer.y * 0.16 + Math.sin(time * 0.00055) * 0.035;
        logoGroup.rotation.y = pointer.x * 0.2 + Math.cos(time * 0.00045) * 0.045;
        logoGroup.position.y = Math.sin(time * 0.0011) * 0.055;
      }

      renderer.render(scene, camera);
    }

    function animate(time: number): void {
      renderFrame(time);
      animationFrame = window.requestAnimationFrame(animate);
    }

    if (!reducedMotion) animationFrame = window.requestAnimationFrame(animate);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(container);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      texture.dispose();
      geometry.dispose();
      materials.forEach((material) => material.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <div className="khadim-logo-scene" ref={sceneRef} aria-hidden="true">
      <img src={khadimMark} alt="" />
      <canvas />
    </div>
  );
}
