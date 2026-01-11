import React, { useEffect, useRef, useState } from "react";
import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders";

export default function TattooEditor() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const engineRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);

  const activeTattooRef = useRef(null);
  const tattooSizeRef = useRef(0.25);
  const tattooRotationRef = useRef(0); // radians (NEGATIVE for Babylon)
  const appliedDecalsRef = useRef([]);

  const [tattoos, setTattoos] = useState([]);
  const [activeTattoo, setActiveTattoo] = useState(null);
  const [tattooSize, setTattooSize] = useState(0.25);
  const [tattooRotation, setTattooRotation] = useState(0); // degrees (UI)

  /* ================= INIT BABYLON ================= */

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    const preventZoom = e => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    container.addEventListener("wheel", preventZoom, { passive: false });

    const engine = new BABYLON.Engine(canvas, true);
    engineRef.current = engine;

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
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
    camera.angularSensibilityX = 250;
    camera.angularSensibilityY = 250;
    camera.zoomToMouseLocation = true;
    camera.useNaturalPinchZoom = true;
    camera.wheelDeltaPercentage = 0.015;
    camera.wheelPrecision = 0;
    cameraRef.current = camera;

    /* ===== LIGHT ===== */
    new BABYLON.HemisphericLight(
      "hemi",
      new BABYLON.Vector3(0, 1, 0),
      scene
    ).intensity = 1;

    /* ===== ENV ===== */
    scene.environmentTexture =
      BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/studio.env",
        scene
      );

    /* ===== LOAD MODEL ===== */
    BABYLON.SceneLoader.Append("/models/", "jhon.glb", scene, () => {
      const meshes = scene.meshes.filter(m => m instanceof BABYLON.Mesh);
      meshes.forEach(m => (m.isPickable = true));

      const bounds = meshes[0].getHierarchyBoundingVectors(true);
      const center = bounds.min.add(bounds.max).scale(0.5);
      const size = bounds.max.subtract(bounds.min).length();

      meshes.forEach(m => m.position.subtractInPlace(center));
      camera.setTarget(BABYLON.Vector3.Zero());
      camera.radius = size * 0.6;
    });

    /* ===== POINTER MOVE (PREVIEW) ===== */
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
        tattooSizeRef.current,
        tattooRotationRef.current,
        scene
      );
    };

    /* ===== APPLY ===== */
    scene.onPointerDown = () => {
      if (!activeTattooRef.current) return;

      const pick = scene.pick(scene.pointerX, scene.pointerY);
      if (!pick?.hit || !pick.pickedMesh) return;

      disposePreview();

      const decal = applyTattooDecal(
        pick,
        activeTattooRef.current,
        tattooSizeRef.current,
        tattooRotationRef.current,
        scene
      );

      appliedDecalsRef.current.push(decal);
    };

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    return () => {
      engine.dispose();
      container.removeEventListener("wheel", preventZoom);
    };
  }, []);

  /* ================= STATE → REF ================= */

  useEffect(() => {
    activeTattooRef.current = activeTattoo;
  }, [activeTattoo]);

  useEffect(() => {
    tattooSizeRef.current = tattooSize;
  }, [tattooSize]);

  useEffect(() => {
    // IMPORTANT: negative sign to match CSS rotation
    tattooRotationRef.current = -BABYLON.Tools.ToRadians(tattooRotation);
  }, [tattooRotation]);

  /* ================= UI ================= */

  function removeLastTattoo() {
    const list = appliedDecalsRef.current;
    if (!list.length) return;
    list.pop().dispose();
  }

  function handleUpload(e) {
    Array.from(e.target.files).forEach(file => {
      const url = URL.createObjectURL(file);
      setTattoos(prev => [...prev, { url }]);
    });
  }

  return (
    <div className="container" ref={containerRef}>
      <div className="sidebar">
        <h3>Tattoos</h3>

        {activeTattoo && (
          <>
            <div className="previewLabel">Selected Tattoo</div>

            <div className="previewBox">
              <img
                src={activeTattoo}
                alt="preview"
                style={{
                  transform: `rotate(${tattooRotation}deg) scale(${tattooSize * 2})`
                }}
              />
            </div>
          </>
        )}

        <input type="file" accept="image/*" multiple onChange={handleUpload} />

        {activeTattoo && (
          <>
            <label>Size</label>
            <input
              type="range"
              min="0.05"
              max="0.6"
              step="0.01"
              value={tattooSize}
              onChange={e => setTattooSize(+e.target.value)}
            />

            <label>Rotation</label>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={tattooRotation}
              onChange={e => setTattooRotation(+e.target.value)}
            />
          </>
        )}

        <button onClick={removeLastTattoo}>Remove Last Tattoo</button>

        <div className="tattooGrid">
          {tattoos.map((t, i) => (
            <img
              key={i}
              src={t.url}
              className={`tattooImg ${activeTattoo === t.url ? "active" : ""}`}
              onClick={() => setActiveTattoo(t.url)}
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
