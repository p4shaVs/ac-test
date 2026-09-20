"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface Marker3D {
  id: string;
  u: number; // 0..1 (harita X)
  v: number; // 0..1 (harita Y)
  color: string;
  selected: boolean;
  dim: boolean;
}

export type View3D = "iso" | "top" | "city";

const W = 800;          // düzlem genişliği (dünya birimi)
const DISP = 120;       // yükseklik ölçeği

const VIEW_CAM: Record<View3D, { pos: [number, number, number]; target: [number, number, number] }> = {
  iso: { pos: [0, 470, 720], target: [0, 0, 40] },
  top: { pos: [0, 950, 1], target: [0, 0, 0] },
  city: { pos: [40, 300, -470], target: [30, 0, -180] },
};

export default function Map3D({
  markers,
  view,
  onSelect,
}: {
  markers: Marker3D[];
  view: View3D;
  onSelect: (id: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    markerGroup: THREE.Group;
    heightData: ImageData | null;
    raf: number;
  } | null>(null);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Kurulum (bir kez)
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0a1119");
    scene.fog = new THREE.Fog("#0a1119", 900, 2000);

    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 1, 4000);
    const cam = VIEW_CAM.iso;
    camera.position.set(...cam.pos);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 200;
    controls.maxDistance = 1600;
    controls.target.set(...cam.target);

    // Işık
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(-400, 700, 300);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x9fc5ff, 0x2a3a2a, 0.4));

    // Deniz düzlemi
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 2.2, W * 2.2),
      new THREE.MeshStandardMaterial({ color: 0x12314f, metalness: 0.2, roughness: 0.6 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -2;
    scene.add(sea);

    // Arazi
    const loader = new THREE.TextureLoader();
    const geo = new THREE.PlaneGeometry(W, W, 220, 220);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    const terrain = new THREE.Mesh(geo, mat);
    scene.add(terrain);

    loader.load("/map/losantos-sat.jpg", (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.needsUpdate = true;
    });
    loader.load("/map/losantos-height.png", (tex) => {
      mat.displacementMap = tex;
      mat.displacementScale = DISP;
      mat.needsUpdate = true;
    });

    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    // Yükseklik örnekleme için heightmap'i canvas'a al
    let heightData: ImageData | null = null;
    const himg = new Image();
    himg.crossOrigin = "anonymous";
    himg.onload = () => {
      const c = document.createElement("canvas");
      c.width = himg.width; c.height = himg.height;
      const ctx = c.getContext("2d");
      if (ctx) { ctx.drawImage(himg, 0, 0); heightData = ctx.getImageData(0, 0, himg.width, himg.height); }
      if (stateRef.current) stateRef.current.heightData = heightData;
      rebuildMarkers();
    };
    himg.src = "/map/losantos-height.png";

    // Tıklama seçimi
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    function onClick(e: MouseEvent) {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(mouse, camera);
      const hits = ray.intersectObjects(markerGroup.children, true);
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object;
        while (o && !o.userData.id) o = o.parent;
        if (o?.userData.id) onSelectRef.current(o.userData.id as string);
      }
    }
    renderer.domElement.addEventListener("click", onClick);

    function sampleHeight(u: number, v: number): number {
      if (!heightData) return 0;
      const { width, height, data } = heightData;
      const px = Math.max(0, Math.min(width - 1, Math.floor(u * width)));
      const py = Math.max(0, Math.min(height - 1, Math.floor(v * height)));
      const g = data[(py * width + px) * 4];
      return (g / 255) * DISP;
    }

    function rebuildMarkers() {
      const grp = stateRef.current?.markerGroup ?? markerGroup;
      while (grp.children.length) {
        const c = grp.children.pop()!;
        (c as THREE.Mesh).geometry?.dispose?.();
      }
      for (const m of markersRef.current) {
        const x = (m.u - 0.5) * W;
        const z = -(m.v - 0.5) * W; // PlaneGeometry rotateX(-90) sonrası v ekseni -Z olur
        const y = sampleHeight(m.u, m.v);
        const col = new THREE.Color(m.color);
        const holder = new THREE.Object3D();
        holder.position.set(x, 0, z);
        holder.userData.id = m.id;

        const op = m.dim ? 0.25 : 1;
        const pinH = m.selected ? 64 : 44;

        // Yerden yükselen ışık huzmesi (konumu net gösterir)
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(m.selected ? 2.2 : 1.4, 0.4, pinH, 8),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: m.dim ? 0.12 : 0.55 })
        );
        beam.position.set(0, y + pinH / 2, 0);
        holder.add(beam);

        // Zemin halkası (oyuncunun bastığı nokta)
        const spot = new THREE.Mesh(
          new THREE.RingGeometry(m.selected ? 8 : 5, m.selected ? 12 : 8, 28),
          new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: m.dim ? 0.2 : 0.75 })
        );
        spot.rotation.x = -Math.PI / 2;
        spot.position.set(0, y + 0.6, 0);
        holder.add(spot);

        // Tepe küresi
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(m.selected ? 8 : 5.5, 14, 14),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op })
        );
        head.position.set(0, y + pinH, 0);
        holder.add(head);

        if (m.selected) {
          const halo = new THREE.Mesh(
            new THREE.SphereGeometry(13, 16, 16),
            new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18 })
          );
          halo.position.set(0, y + pinH, 0);
          holder.add(halo);
        }
        grp.add(holder);
      }
    }

    stateRef.current = { renderer, scene, camera, controls, markerGroup, heightData, raf: 0 };
    (stateRef.current as any).rebuildMarkers = rebuildMarkers;

    function animate() {
      controls.update();
      renderer.render(scene, camera);
      stateRef.current!.raf = requestAnimationFrame(animate);
    }
    animate();

    function onResize() {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(stateRef.current!.raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      renderer.dispose();
      geo.dispose();
      mat.dispose();
      mount.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, []);

  // Marker güncelle
  useEffect(() => {
    const st = stateRef.current as any;
    if (st?.rebuildMarkers) st.rebuildMarkers();
  }, [markers]);

  // Görünüm değişimi
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    const v = VIEW_CAM[view];
    st.camera.position.set(...v.pos);
    st.controls.target.set(...v.target);
    st.controls.update();
  }, [view]);

  return <div ref={mountRef} className="absolute inset-0" />;
}
