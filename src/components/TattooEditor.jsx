import React, { useEffect, useRef, useState } from "react";
import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders";

export default function TattooEditor({ modelUrl }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const engineRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);

  const activeTattooRef = useRef(null);
  const sizeRef = useRef(0.25);
  const rotationRef = useRef(0);
  const decalsRef = useRef([]);

  const [tattoos, setTattoos] = useState([]);
  const [activeTattoo, setActiveTattoo] = useState(null);
  const [size, setSize] = useState(0.25);
  const [rotation, setRotation] = useState(0);

  /* ================= INIT BABYLON ================= */

  useEffect(() => {
    if (!modelUrl) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    /* 🔒 PREVENT BROWSER ZOOM */
    const preventZoom = e => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    container.addEventListener("wheel", preventZoom, { passive: false });

    const engine = new BABYLON.Engine(canvas, true);
    engineRef.current = engine;

    const scene = new BABYLON.Scene(engine);
    sceneRef.current = scene;

    /* ===== CAMERA ===== */
    const camera = new BABYLON.ArcRotateCamera(
      "cam",
      Math.PI / 2,
      Math.PI / 2.2,
      4,
      BABYLON.Vector3.Zero(),
      scene
    );
    camera.attachControl(canvas, true);
    camera.zoomToMouseLocation = true;
    camera.wheelDeltaPercentage = 0.015;
    cameraRef.current = camera;

    /* ===== LIGHT ===== */
    new BABYLON.HemisphericLight(
      "hemi",
      new BABYLON.Vector3(0, 1, 0),
      scene
    ).intensity = 1;

    /* ===== LOAD MODEL ===== */
    BABYLON.SceneLoader.Append("", modelUrl, scene, () => {
      const meshes = scene.meshes.filter(m => m instanceof BABYLON.Mesh);
      meshes.forEach(m => (m.isPickable = true));

      const bounds = meshes[0].getHierarchyBoundingVectors(true);
      const center = bounds.min.add(bounds.max).scale(0.5);
      const size = bounds.max.subtract(bounds.min).length();

      meshes.forEach(m => m.position.subtractInPlace(center));
      camera.setTarget(BABYLON.Vector3.Zero());
      camera.radius = size * 0.6;
    });

    /* ===== PREVIEW ON HOVER ===== */
    scene.onPointerMove = () => {
      if (!activeTattooRef.current) {
        disposePreview();
        return;
      }

      const pick = scene.pick(scene.pointerX, scene.pointerY);
      if (!pick?.hit || !pick.pickedMesh) {
        disposePreview();
        return;
      }

      showPreviewDecal(
        pick,
        activeTattooRef.current,
        sizeRef.current,
        rotationRef.current,
        scene
      );
    };

    /* ===== APPLY ON CLICK ===== */
    scene.onPointerDown = () => {
      if (!activeTattooRef.current) return;

      const pick = scene.pick(scene.pointerX, scene.pointerY);
      if (!pick?.hit || !pick.pickedMesh) return;

      disposePreview();

      const decal = applyTattooDecal(
        pick,
        activeTattooRef.current,
        sizeRef.current,
        rotationRef.current,
        scene
      );

      decalsRef.current.push(decal);
    };

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    return () => {
      engine.dispose();
      container.removeEventListener("wheel", preventZoom);
    };
  }, [modelUrl]);

  /* ================= STATE → REF ================= */

  useEffect(() => {
    activeTattooRef.current = activeTattoo;
  }, [activeTattoo]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    rotationRef.current = -BABYLON.Tools.ToRadians(rotation);
  }, [rotation]);

  /* ================= UI ================= */

  function uploadTattoo(e) {
    Array.from(e.target.files).forEach(file => {
      const url = URL.createObjectURL(file);
      setTattoos(prev => [...prev, url]);
    });
  }

  function removeLastTattoo() {
    const list = decalsRef.current;
    if (!list.length) return;
    list.pop().dispose();
  }

  return (
    <div className="container" ref={containerRef}>
      <div className="sidebar">
        <h3>Tattoos</h3>

        {activeTattoo && (
          <div className="previewBox">
            <img
              src={activeTattoo}
              alt="preview"
              style={{
                transform: `rotate(${rotation}deg) scale(${size * 2})`
              }}
            />
          </div>
        )}

        <input type="file" accept="image/*" multiple onChange={uploadTattoo} />

        {activeTattoo && (
          <>
            <label>Size</label>
            <input
              type="range"
              min="0.05"
              max="0.6"
              step="0.01"
              value={size}
              onChange={e => setSize(+e.target.value)}
            />

            <label>Rotation</label>
            <input
              type="range"
              min="0"
              max="360"
              value={rotation}
              onChange={e => setRotation(+e.target.value)}
            />
          </>
        )}

        <button onClick={removeLastTattoo}>Remove Last Tattoo</button>

        <div className="tattooGrid">
          {tattoos.map((t, i) => (
            <img
              key={i}
              src={t}
              className={activeTattoo === t ? "active" : ""}
              onClick={() => setActiveTattoo(t)}
            />
          ))}
        </div>
      </div>

      <canvas ref={canvasRef} className="renderCanvas" />
    </div>
  );
}

/* ================= HELPERS ================= */

function disposePreview() {
  if (window._previewDecal) {
    window._previewDecal.dispose();
    window._previewDecal = null;
  }
}

function showPreviewDecal(pick, imageUrl, size, rotation, scene) {
  disposePreview();

  const texture = new BABYLON.Texture(imageUrl, scene);
  const aspect = texture.getSize().width / texture.getSize().height;

  const decal = BABYLON.MeshBuilder.CreateDecal("preview", pick.pickedMesh, {
    position: pick.pickedPoint,
    normal: pick.getNormal(true),
    size: new BABYLON.Vector3(size * aspect, size, size * 0.5),
    angle: rotation
  });

  const mat = new BABYLON.StandardMaterial("previewMat", scene);
  mat.diffuseTexture = texture;
  mat.diffuseTexture.hasAlpha = true;
  mat.alpha = 0.5;
  mat.backFaceCulling = false;
  mat.zOffset = -3;

  decal.material = mat;
  window._previewDecal = decal;
}

function applyTattooDecal(pick, imageUrl, size, rotation, scene) {
  const texture = new BABYLON.Texture(imageUrl, scene);
  const aspect = texture.getSize().width / texture.getSize().height;

  const decal = BABYLON.MeshBuilder.CreateDecal("tattoo", pick.pickedMesh, {
    position: pick.pickedPoint,
    normal: pick.getNormal(true),
    size: new BABYLON.Vector3(size * aspect, size, size * 0.5),
    angle: rotation
  });

  const mat = new BABYLON.StandardMaterial("tattooMat", scene);
  mat.diffuseTexture = texture;
  mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling = false;
  mat.zOffset = -2;

  decal.material = mat;
  return decal;
}
