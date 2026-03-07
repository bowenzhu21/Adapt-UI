'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type HeroBackdrop3DProps = {
  className?: string;
};

type FloatingDisc = {
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshPhysicalMaterial>;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  baseX: number;
  baseY: number;
  baseZ: number;
  baseRy: number;
  baseRz: number;
  speed: number;
  phase: number;
};

export default function HeroBackdrop3D({ className }: HeroBackdrop3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0.3, 11);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    host.appendChild(renderer.domElement);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();

    const stack = new THREE.Group();
    stack.position.set(2.15, -0.12, 0);
    stack.rotation.set(0.25, -0.58, 0.08);
    scene.add(stack);

    const ambient = new THREE.AmbientLight(0xffffff, 1.08);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffe3cf, 1.55);
    key.position.set(4, 5, 7);
    scene.add(key);

    const rim = new THREE.PointLight(0xff7fa7, 0.95, 20, 2);
    rim.position.set(-4, 2, 4);
    scene.add(rim);

    const fill = new THREE.PointLight(0x6dd5ff, 0.7, 16, 2);
    fill.position.set(5, -2, 6);
    scene.add(fill);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 48, 32),
      new THREE.MeshBasicMaterial({
        color: '#ff8f8c',
        transparent: true,
        opacity: 0.16,
      })
    );
    glow.position.set(0.2, 0.1, -2.8);
    stack.add(glow);

    const glow2 = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 36, 24),
      new THREE.MeshBasicMaterial({
        color: '#ffb577',
        transparent: true,
        opacity: 0.13,
      })
    );
    glow2.position.set(0.8, -1.8, -1.4);
    stack.add(glow2);

    const palette = ['#ff5f88', '#ff7a74', '#ff9a67', '#ffb86f', '#ff7f9f'];
    const discs: FloatingDisc[] = [];

    for (let i = 0; i < 11; i += 1) {
      const radius = 1.36 + (i % 3) * 0.28;
      const thickness = 0.1 + (i % 2) * 0.03;

      const geometry = new THREE.CylinderGeometry(radius, radius * 0.97, thickness, 80);
      const material = new THREE.MeshPhysicalMaterial({
        color: palette[i % palette.length],
        metalness: 0.18,
        roughness: 0.23,
        transmission: 0.2,
        thickness: 0.9,
        clearcoat: 1,
        clearcoatRoughness: 0.14,
        sheen: 0.7,
        sheenColor: new THREE.Color('#ffd3b8'),
      });

      const mesh = new THREE.Mesh(geometry, material);
      const baseY = i * 0.54 - 2.76;
      const baseX = (i % 2 === 0 ? 0.24 : -0.32) + Math.sin(i * 0.88) * 0.12;
      const baseZ = Math.cos(i * 0.6) * 0.85 - i * 0.08;
      const baseRy = -0.18 + (i % 4) * 0.035;
      const baseRz = i * 0.2;

      mesh.position.set(baseX, baseY, baseZ);
      mesh.rotation.set(Math.PI / 2 + 0.35, baseRy, baseRz);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.02, 0.018, 12, 120),
        new THREE.MeshStandardMaterial({
          color: '#fff2e8',
          metalness: 0.45,
          roughness: 0.28,
          emissive: '#ffba95',
          emissiveIntensity: 0.16,
        })
      );
      ring.position.set(baseX, baseY, baseZ + thickness * 0.58);
      ring.rotation.set(mesh.rotation.x, baseRy, baseRz + 0.02);

      stack.add(mesh);
      stack.add(ring);

      discs.push({
        mesh,
        ring,
        baseX,
        baseY,
        baseZ,
        baseRy,
        baseRz,
        speed: 0.34 + (i % 5) * 0.065,
        phase: i * 0.78,
      });
    }

    const clock = new THREE.Clock();
    const pointer = new THREE.Vector2();
    const targetPointer = new THREE.Vector2();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;

    const onPointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      targetPointer.set(x, y);
    };

    const onPointerLeave = () => {
      targetPointer.set(0, 0);
    };

    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    const animate = () => {
      const t = clock.getElapsedTime();
      pointer.lerp(targetPointer, 0.075);

      for (const disc of discs) {
        const drift = reducedMotion ? 0 : t * disc.speed + disc.phase;
        const waveY = Math.sin(drift) * 0.2;
        const waveX = Math.cos(drift * 0.7) * 0.1;

        disc.mesh.position.x = disc.baseX + waveX;
        disc.mesh.position.y = disc.baseY + waveY;
        disc.mesh.rotation.y = disc.baseRy + Math.cos(drift * 0.62) * (reducedMotion ? 0.04 : 0.2);
        disc.mesh.rotation.z = disc.baseRz + Math.sin(drift * 0.58) * (reducedMotion ? 0.04 : 0.12);

        disc.ring.position.x = disc.mesh.position.x;
        disc.ring.position.y = disc.mesh.position.y;
        disc.ring.position.z = disc.baseZ + 0.08;
        disc.ring.rotation.y = disc.mesh.rotation.y;
        disc.ring.rotation.z = disc.mesh.rotation.z + 0.02;
      }

      const pulse = reducedMotion ? 0 : Math.sin(t * 0.22) * 0.08;
      stack.rotation.y = -0.58 + pulse + pointer.x * 0.95;
      stack.rotation.x = 0.24 + (reducedMotion ? 0 : Math.cos(t * 0.18) * 0.04) + pointer.y * 0.55;

      renderer.render(scene, camera);
      rafId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);

      for (const disc of discs) {
        disc.mesh.geometry.dispose();
        disc.mesh.material.dispose();
        disc.ring.geometry.dispose();
        disc.ring.material.dispose();
      }
      (glow.geometry as THREE.BufferGeometry).dispose();
      (glow.material as THREE.Material).dispose();
      (glow2.geometry as THREE.BufferGeometry).dispose();
      (glow2.material as THREE.Material).dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}

