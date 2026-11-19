/**
 * Avatar3D — Three.js + VRM avatar renderer with:
 *  - Realistic audio-driven lip sync (word-timed viseme animation)
 *  - Natural idle breathing animation
 *  - Blinking
 *  - Subtle head movement
 *  - State-driven behaviour (idle/listening/thinking/speaking/error)
 *  - Proper T-pose fix (arms down)
 *  - Resource cleanup
 *  - 30fps cap for low-end hardware
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import useAppStore, { AVATAR_STATES } from "../store/appStore";
import { useSpeech, visemeToExpressionWeights } from "../hooks/useSpeech";

// Frame rate cap (ms per frame). 33 ≈ 30fps
const FRAME_INTERVAL_MS = 33;

function Avatar3D() {
  const containerRef = useRef(null);
  const avatarStateRef = useRef(AVATAR_STATES.IDLE);
  const { avatarState, setAvatarLoaded } = useAppStore();
  const { getVisemeWeights } = useSpeech();

  // Keep latest avatarState accessible in animation loop without re-mounting
  avatarStateRef.current = avatarState;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Scene setup ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(
      30,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = false; // Off for performance
    container.appendChild(renderer.domElement);

    // ── Lighting ──────────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff8f0, 2.2);
    keyLight.position.set(1.5, 3, 4);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xa8c8ff, 0.8);
    fillLight.position.set(-2, 1, -1);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, 2, -4);
    scene.add(rimLight);

    // ── State ─────────────────────────────────────────────────────────────
    let avatar = null;
    let head = null;
    let neck = null;
    let leftUpperArm = null;
    let rightUpperArm = null;
    let leftLowerArm = null;
    let rightLowerArm = null;
    let disposed = false;
    let lastFrameTime = 0;

    // ── Load VRM ──────────────────────────────────────────────────────────
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      "/avatars/rocketbox-business-male-01.vrm",
      (gltf) => {
        if (disposed) return;

        avatar = gltf.userData.vrm;
        if (!avatar) {
          console.error("VRM could not be initialised from GLTF.");
          return;
        }

        const model = avatar.scene;
        // Face the camera
        model.rotation.y = Math.PI;

        // Centre the model on the XZ plane, bottom at y=0
        const bounds = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        bounds.getSize(size);
        bounds.getCenter(center);
        model.position.x -= center.x;
        model.position.y -= bounds.min.y;
        model.position.z -= center.z;

        // ── Humanoid bone references ─────────────────────────────────
        leftUpperArm = avatar.humanoid.getNormalizedBoneNode("leftUpperArm");
        rightUpperArm = avatar.humanoid.getNormalizedBoneNode("rightUpperArm");
        leftLowerArm = avatar.humanoid.getNormalizedBoneNode("leftLowerArm");
        rightLowerArm = avatar.humanoid.getNormalizedBoneNode("rightLowerArm");
        head = avatar.humanoid.getNormalizedBoneNode("head");
        neck = avatar.humanoid.getNormalizedBoneNode("neck");

        scene.add(model);

        // ── Camera position: close portrait view of Steve ────────────
        const height = Math.max(size.y, 1);
        const targetY = height * 0.74;   // Chest/head level
        const distance = height * 0.88;  // Portrait distance

        camera.position.set(0, targetY, distance);
        camera.lookAt(0, targetY * 0.98, 0);

        setAvatarLoaded(true);
        console.log("Steve (VRM avatar) loaded successfully.");

        // Log available expressions for debugging
        if (avatar.expressionManager) {
          const names = Object.keys(avatar.expressionManager.expressionMap || {});
          console.log("Available VRM expressions:", names);
        }
      },
      undefined,
      (error) => console.error("Error loading VRM:", error)
    );

    // ── Resize handling ───────────────────────────────────────────────────
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // ── Animation loop ────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let animationFrameId;

    // Smooth blinking state
    let blinkTimer = 2 + Math.random() * 2; // first blink in 2-4 seconds
    let blinkPhase = 0;    // 0=open, 1=closing, 2=closed, 3=opening
    let blinkProgress = 0;
    const BLINK_CLOSE_SPEED = 10; // expressions/sec
    const BLINK_HOLD_TIME = 0.1;
    let blinkHeld = 0;

    // Thinking bob
    let thinkingPhase = 0;

    const animate = (timestamp) => {
      animationFrameId = requestAnimationFrame(animate);

      // 30fps cap
      if (timestamp - lastFrameTime < FRAME_INTERVAL_MS) return;
      const delta = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
      lastFrameTime = timestamp;

      const elapsed = clock.getElapsedTime();
      const state = avatarStateRef.current;

      // ── Natural upright standing posture (arms resting straight down at sides) ──
      const armBreath = Math.sin(elapsed * 0.5) * 0.01;

      if (leftUpperArm) {
        // +1.24 rad brings left arm down from horizontal T-pose to hang naturally at side
        leftUpperArm.rotation.z = 1.24 - armBreath;
        leftUpperArm.rotation.x = 0;
        leftUpperArm.rotation.y = 0;
      }

      if (rightUpperArm) {
        // -1.24 rad brings right arm down from horizontal T-pose to hang naturally at side
        rightUpperArm.rotation.z = -1.24 + armBreath;
        rightUpperArm.rotation.x = 0;
        rightUpperArm.rotation.y = 0;
      }

      if (leftLowerArm) {
        leftLowerArm.rotation.set(0, 0, 0);
      }

      if (rightLowerArm) {
        rightLowerArm.rotation.set(0, 0, 0);
      }

      // ── Idle breathing: subtle spine sway ─────────────────────────
      if (avatar?.humanoid) {
        const spine = avatar.humanoid.getNormalizedBoneNode("spine");
        if (spine) {
          spine.rotation.x = Math.sin(elapsed * 0.5) * 0.008;
        }
      }

      if (avatar) {
        avatar.update(delta);
      }

      // ── Head movement ─────────────────────────────────────────────
      if (head) {
        let headYAmp = 0.03;
        let headXAmp = 0.012;
        let headSpeed = 0.5;

        if (state === AVATAR_STATES.LISTENING) {
          headYAmp = 0.015;
          headXAmp = 0.025; // slight tilt down (attentive)
        } else if (state === AVATAR_STATES.THINKING) {
          thinkingPhase += delta * 1.2;
          headYAmp = 0.04;
          headXAmp = 0.03;
          headSpeed = 0.8;
        } else if (state === AVATAR_STATES.SPEAKING) {
          headYAmp = 0.025;
          headXAmp = 0.01;
          headSpeed = 0.6;
        }

        head.rotation.y =
          Math.sin(elapsed * headSpeed * 0.9) * headYAmp +
          Math.sin(elapsed * headSpeed * 0.5) * headYAmp * 0.4;
        head.rotation.x =
          Math.sin(elapsed * headSpeed * 0.7) * headXAmp;
        head.rotation.z =
          Math.sin(elapsed * headSpeed * 0.4) * 0.008;
      }

      if (avatar?.expressionManager) {
        const em = avatar.expressionManager;

        // ── Blinking ──────────────────────────────────────────────────
        blinkTimer -= delta;
        if (blinkTimer <= 0 && blinkPhase === 0) {
          blinkPhase = 1;
          blinkProgress = 0;
          blinkTimer = 3 + Math.random() * 3; // next blink in 3-6s
        }

        let blinkVal = 0;
        if (blinkPhase === 1) {
          // Closing
          blinkProgress = Math.min(1, blinkProgress + delta * BLINK_CLOSE_SPEED);
          blinkVal = blinkProgress;
          if (blinkProgress >= 1) {
            blinkPhase = 2;
            blinkHeld = 0;
          }
        } else if (blinkPhase === 2) {
          // Held closed
          blinkHeld += delta;
          blinkVal = 1;
          if (blinkHeld >= BLINK_HOLD_TIME) {
            blinkPhase = 3;
            blinkProgress = 1;
          }
        } else if (blinkPhase === 3) {
          // Opening
          blinkProgress = Math.max(0, blinkProgress - delta * BLINK_CLOSE_SPEED);
          blinkVal = blinkProgress;
          if (blinkProgress <= 0) blinkPhase = 0;
        }
        em.setValue("blink", blinkVal);

        // ── Lip sync / expressions ────────────────────────────────────
        if (state === AVATAR_STATES.SPEAKING) {
          const weights = getVisemeWeights(delta);
          em.setValue("aa", weights.aa ?? 0);
          em.setValue("ih", weights.ih ?? 0);
          em.setValue("ou", weights.ou ?? 0);
          em.setValue("ee", weights.ee ?? 0);
          em.setValue("oh", weights.oh ?? 0);
          // Clear non-speaking expressions
          em.setValue("happy", 0);
          em.setValue("neutral", 0);
        } else if (state === AVATAR_STATES.LISTENING) {
          // Smooth mouth close, slight happy expression
          ["aa", "ih", "ou", "ee", "oh"].forEach((k) => {
            const cur = em.getValue(k) ?? 0;
            em.setValue(k, Math.max(0, cur - delta * 10));
          });
          em.setValue("happy", 0.15);
        } else if (state === AVATAR_STATES.THINKING) {
          // Close mouth, slight thoughtful expression
          ["aa", "ih", "ou", "ee", "oh"].forEach((k) => {
            const cur = em.getValue(k) ?? 0;
            em.setValue(k, Math.max(0, cur - delta * 10));
          });
          em.setValue("happy", 0);
          // Subtle eye narrowing via blink (don't interfere with blink timer)
        } else {
          // IDLE / ERROR — close everything smoothly
          ["aa", "ih", "ou", "ee", "oh"].forEach((k) => {
            const cur = em.getValue(k) ?? 0;
            em.setValue(k, Math.max(0, cur - delta * 8));
          });
          em.setValue("happy", state === AVATAR_STATES.ERROR ? 0 : 0.05);
        }
      }

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });

      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      setAvatarLoaded(false);
    };
  }, []); // Run once on mount

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "520px",
        overflow: "hidden",
        borderRadius: "16px",
      }}
    />
  );
}

export default Avatar3D;
