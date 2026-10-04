import * as THREE from './vendor/three/three.module.min.js';
import { calculateGrooveRingCount } from './groove-visualizer.js';
import { calculatePlayCeremony } from './play-ceremony.js';

const stage = document.getElementById('threePlayerStage');

if (stage) {
    const inputSurface = document.getElementById('turntableGestureLayer') || stage;
    const tonearmHotspot = document.getElementById('tonearmHotspot');
    const clock = new THREE.Clock();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(0, 0, 6.1);

    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);

    const root = new THREE.Group();
    root.rotation.x = -0.04;
    scene.add(root);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8e4e1, 2.05));

    const key = new THREE.DirectionalLight(0xffffff, 3.7);
    key.position.set(-2.6, 3.2, 5.6);
    key.castShadow = true;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xffffff, 2.35);
    rim.position.set(3.3, 1.35, 3.25);
    scene.add(rim);

    const magentaGlow = new THREE.PointLight(0xff3fb7, 0.9, 4.2);
    magentaGlow.position.set(-0.55, 0.02, 1.1);
    scene.add(magentaGlow);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const armHitTargets = [];
    const recordHitTargets = [];

    let pointerMode = null;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let activePointerId = null;
    let sliderDragging = false;
    let lastDirectGestureAt = 0;

    const materials = {
        chrome: new THREE.MeshPhysicalMaterial({
            color: 0xdfe5e8,
            roughness: 0.16,
            metalness: 0.9,
            clearcoat: 0.96,
            clearcoatRoughness: 0.07
        }),
        chromeDark: new THREE.MeshPhysicalMaterial({
            color: 0x777f82,
            roughness: 0.27,
            metalness: 0.78,
            clearcoat: 0.72
        }),
        cartridge: new THREE.MeshPhysicalMaterial({
            color: 0xdce5e3,
            roughness: 0.34,
            metalness: 0.12,
            clearcoat: 0.66
        }),
        graphite: new THREE.MeshPhysicalMaterial({
            color: 0x263237,
            roughness: 0.46,
            metalness: 0.16,
            clearcoat: 0.52,
            clearcoatRoughness: 0.2
        }),
        label: new THREE.MeshPhysicalMaterial({
            map: makeLabelTexture(0),
            roughness: 0.28,
            metalness: 0.05,
            clearcoat: 0.86,
            clearcoatRoughness: 0.1
        }),
        neon: new THREE.MeshBasicMaterial({
            color: 0xff42b4,
            transparent: true,
            opacity: 0.64,
            depthWrite: false
        }),
        whiteLine: new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.58,
            depthWrite: false
        }),
        invisible: new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.001,
            depthWrite: false
        })
    };

    const panel = new THREE.Group();
    panel.scale.set(1.0, 1.0, 1.0);
    root.add(panel);

    const panelBase = new THREE.Mesh(
        roundedRectGeometry(3.42, 2.66, 0.24),
        new THREE.MeshPhysicalMaterial({
            map: makeDeckTexture(),
            roughness: 0.36,
            metalness: 0.02,
            clearcoat: 0.56,
            clearcoatRoughness: 0.26,
            transparent: true,
            opacity: 0.16
        })
    );
    panelBase.position.set(0, -0.11, -0.16);
    panelBase.receiveShadow = true;
    panelBase.visible = true;
    panel.add(panelBase);

    const deckShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(3.84, 2.98),
        new THREE.MeshBasicMaterial({
            map: makeSoftShadowTexture(),
            transparent: true,
            opacity: 0.22,
            depthWrite: false
        })
    );
    deckShadow.position.set(0.08, -0.22, -0.36);
    deckShadow.visible = true;
    panel.add(deckShadow);

    const recordHome = new THREE.Vector3(-0.45, 0.14, 0.14);
    const recordGroup = new THREE.Group();
    recordGroup.position.copy(recordHome);
    panel.add(recordGroup);

    const recordSwap = {
        active: false,
        phase: 'idle',
        progress: 0,
        eventName: null,
        direction: new THREE.Vector2(1, 0),
        dragOffset: new THREE.Vector2(0, 0)
    };
    const recordFadeMaterials = [];
    let recordOpacity = 1;
    let interactionHintStrength = 1;

    const recordFace = new THREE.Mesh(
        new THREE.CircleGeometry(1.14, 192),
        new THREE.MeshPhysicalMaterial({
            map: makeRecordTexture(),
            roughness: 0.17,
            metalness: 0.42,
            clearcoat: 1,
            clearcoatRoughness: 0.08
        })
    );
    recordFace.castShadow = true;
    recordFace.receiveShadow = true;
    recordGroup.add(recordFace);
    recordHitTargets.push(recordFace);

    const recordRim = new THREE.Mesh(
        new THREE.TorusGeometry(1.155, 0.03, 14, 192),
        new THREE.MeshPhysicalMaterial({
            color: 0xeff8f7,
            roughness: 0.24,
            metalness: 0.58,
            clearcoat: 0.9
        })
    );
    recordRim.position.z = 0.018;
    recordGroup.add(recordRim);

    const label = new THREE.Mesh(new THREE.CircleGeometry(0.38, 96), materials.label);
    label.position.z = 0.037;
    recordGroup.add(label);
    recordHitTargets.push(label);

    const labelRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.39, 0.012, 10, 96),
        new THREE.MeshBasicMaterial({ color: 0xff83d1, transparent: true, opacity: 0.78 })
    );
    labelRing.position.z = 0.048;
    recordGroup.add(labelRing);

    const spindle = new THREE.Mesh(new THREE.SphereGeometry(0.058, 32, 16), materials.chrome);
    spindle.position.z = 0.132;
    spindle.scale.set(1, 1, 0.62);
    recordGroup.add(spindle);

    const grooveArcs = [];
    const grooveRings = [];
    const grooveEnergy = { bass: 0, mid: 0, treble: 0, ringCount: 0 };
    for (let i = 0; i < 14; i += 1) {
        const radius = 0.5 + i * 0.043;
        const arc = makeArc(radius, 0.0048, 0.22 + i * 0.18, Math.PI * (1.05 + (i % 3) * 0.12), materials.neon);
        arc.position.z = 0.064 + i * 0.0008;
        arc.material = materials.neon.clone();
        arc.material.opacity = 0.15 + (i % 4) * 0.032;
        arc.userData.baseOpacity = arc.material.opacity;
        arc.userData.phase = i * 0.53;
        arc.userData.band = i % 3;
        grooveArcs.push(arc);
        recordGroup.add(arc);
    }
    for (let i = 0; i < 30; i += 1) {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.42 + i * 0.021, 0.0023, 6, 160),
            new THREE.MeshBasicMaterial({
                color: i % 3 === 0 ? 0xff63c6 : 0x9ff4ff,
                transparent: true,
                opacity: 0.028 + (i % 5) * 0.006,
                depthWrite: false
            })
        );
        ring.position.z = 0.056 + i * 0.00045;
        ring.userData.baseOpacity = ring.material.opacity;
        ring.userData.phase = i * 0.41;
        ring.userData.band = i % 3;
        grooveRings.push(ring);
        recordGroup.add(ring);
    }
    registerRecordFadeTargets(recordGroup);

    const tonearm = new THREE.Group();
    tonearm.position.set(0.88, 0.86, 0.22);
    tonearm.rotation.z = 0.30;
    panel.add(tonearm);

    const pivot = new THREE.Mesh(new THREE.CircleGeometry(0.25, 64), materials.chrome);
    pivot.position.set(0, 0, 0.08);
    tonearm.add(pivot);
    armHitTargets.push(pivot);

    const pivotInner = new THREE.Mesh(new THREE.CircleGeometry(0.145, 48), materials.chromeDark);
    pivotInner.position.set(0, 0, 0.095);
    tonearm.add(pivotInner);
    armHitTargets.push(pivotInner);

    const arm = new THREE.Mesh(
        new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([
                new THREE.Vector3(0, 0, 0.12),
                new THREE.Vector3(-0.16, -0.24, 0.16),
                new THREE.Vector3(-0.32, -0.56, 0.17),
                new THREE.Vector3(-0.43, -0.84, 0.16),
                new THREE.Vector3(-0.54, -1.11, 0.15)
            ]),
            90,
            0.026,
            16,
            false
        ),
        materials.chrome
    );
    arm.castShadow = true;
    tonearm.add(arm);
    armHitTargets.push(arm);

    const headBase = new THREE.Mesh(roundedRectGeometry(0.42, 0.3, 0.04), materials.graphite);
    headBase.position.set(-0.56, -1.22, 0.152);
    headBase.rotation.z = -0.47;
    headBase.castShadow = true;
    tonearm.add(headBase);
    armHitTargets.push(headBase);

    const head = new THREE.Mesh(roundedRectGeometry(0.34, 0.24, 0.035), materials.cartridge);
    head.position.set(-0.56, -1.22, 0.18);
    head.rotation.z = -0.47;
    head.castShadow = true;
    tonearm.add(head);
    armHitTargets.push(head);

    const needle = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.2, 18), materials.chromeDark);
    needle.position.set(-0.64, -1.31, 0.09);
    needle.rotation.x = Math.PI;
    needle.rotation.z = -0.48;
    tonearm.add(needle);
    armHitTargets.push(needle);
    const headBaseHomeZ = headBase.position.z;
    const headHomeZ = head.position.z;
    const needleHomeZ = needle.position.z;

    const armHotspot = new THREE.Mesh(roundedRectGeometry(1.18, 1.72, 0.12), materials.invisible);
    armHotspot.position.set(-0.31, -0.58, 0.44);
    tonearm.add(armHotspot);
    armHitTargets.push(armHotspot);

    const slider = new THREE.Group();
    slider.position.set(1.38, -0.68, 0.16);
    panel.add(slider);

    const sliderPlate = new THREE.Mesh(roundedRectGeometry(0.46, 1.02, 0.07), materials.graphite);
    sliderPlate.castShadow = true;
    slider.add(sliderPlate);

    const sliderTrack = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.72, 0.018),
        new THREE.MeshBasicMaterial({ color: 0x80e6e8, transparent: true, opacity: 0.66 })
    );
    sliderTrack.position.z = 0.05;
    slider.add(sliderTrack);

    for (let i = 0; i < 9; i += 1) {
        const tick = new THREE.Mesh(new THREE.BoxGeometry(i % 2 ? 0.08 : 0.13, 0.008, 0.012), materials.whiteLine);
        tick.position.set(0.105, -0.31 + i * 0.078, 0.06);
        slider.add(tick);
    }

    const knob = new THREE.Mesh(roundedRectGeometry(0.25, 0.085, 0.025), materials.chrome);
    knob.position.set(0, 0.05, 0.08);
    knob.castShadow = true;
    slider.add(knob);

    const targets = {
        rotX: -0.04,
        rotY: 0,
        armGlow: 0
    };
    const playCeremony = {
        startedAt: -999,
        previewUntil: -999,
        wasPlaying: false,
        values: calculatePlayCeremony()
    };

    tonearmHotspot?.addEventListener('pointerdown', () => {
        targets.armGlow = 0.82;
    });
    tonearmHotspot?.addEventListener('click', (event) => {
        event.preventDefault();
        cuePlayCeremony();
        dispatchPlayerEvent('vinyl3d:toggle');
        lastDirectGestureAt = performance.now();
    });

    inputSurface.addEventListener('pointerdown', beginInteraction);
    inputSurface.addEventListener('pointermove', moveInteraction);
    inputSurface.addEventListener('pointerup', finishInteraction);
    window.addEventListener('pointermove', movePointerInteraction);
    window.addEventListener('pointerup', finishPointerInteraction);
    inputSurface.addEventListener('click', clickInteraction);
    inputSurface.addEventListener('mousedown', beginMouseInteraction);
    window.addEventListener('mousemove', moveMouseInteraction);
    window.addEventListener('mouseup', finishMouseInteraction);
    inputSurface.addEventListener('touchstart', beginTouchInteraction, { passive: false });
    inputSurface.addEventListener('touchmove', moveTouchInteraction, { passive: false });
    inputSurface.addEventListener('touchend', finishTouchInteraction, { passive: false });
    inputSurface.addEventListener('touchcancel', finishTouchInteraction, { passive: false });

    function clickInteraction(event) {
        if (performance.now() - lastDirectGestureAt < 220) return;
        if (isVolumePointer(event)) {
            setVolumeFromPointer(event);
            return;
        }
        if (isArmPointer(event)) {
            cuePlayCeremony();
            dispatchPlayerEvent('vinyl3d:toggle');
            lastDirectGestureAt = performance.now();
        }
    }


    function cuePlayCeremony() {
        const now = clock.elapsedTime;
        playCeremony.startedAt = now;
        playCeremony.previewUntil = now + 1.48;
        targets.armGlow = 1.15;
        interactionHintStrength = 0;
    }
    function movePointerInteraction(event) {
        if (activePointerId === null || activePointerId !== event.pointerId) return;
        moveInteraction(event);
    }

    function finishPointerInteraction(event) {
        if (activePointerId === null || activePointerId !== event.pointerId) return;
        finishInteraction(event);
    }

    function beginMouseInteraction(event) {
        if (activePointerId !== null) return;
        beginInteraction(event);
    }

    function moveMouseInteraction(event) {
        if (activePointerId !== 'mouse') return;
        moveInteraction(event);
    }

    function finishMouseInteraction(event) {
        if (activePointerId !== 'mouse') return;
        finishInteraction(event);
    }

    function beginTouchInteraction(event) {
        if (activePointerId !== null) return;
        const touch = touchPoint(event);
        if (!touch) return;
        activePointerId = 'touch';
        beginInteraction(touch);
        event.preventDefault();
    }

    function moveTouchInteraction(event) {
        if (activePointerId !== 'touch') return;
        const touch = touchPoint(event);
        if (!touch) return;
        moveInteraction(touch);
        event.preventDefault();
    }

    function finishTouchInteraction(event) {
        if (activePointerId !== 'touch') return;
        const touch = touchPoint(event);
        if (!touch) return;
        finishInteraction(touch);
        event.preventDefault();
    }

    function touchPoint(event) {
        const touch = event.changedTouches?.[0] || event.touches?.[0];
        if (!touch) return null;
        return {
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => event.preventDefault()
        };
    }

    function beginInteraction(event) {
        if (activePointerId !== 'touch') activePointerId = event.pointerId ?? 'mouse';
        interactionHintStrength = 0;
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        updatePointer(event);

        if (isVolumePointer(event)) {
            pointerMode = 'volume';
            sliderDragging = true;
            if (event.pointerId != null) inputSurface.setPointerCapture?.(event.pointerId);
            setVolumeFromPointer(event);
            event.preventDefault?.();
            return;
        }

        if (isArmPointer(event) || raycaster.intersectObjects(armHitTargets, true).length) {
            pointerMode = 'arm';
            if (event.pointerId != null) inputSurface.setPointerCapture?.(event.pointerId);
            event.preventDefault?.();
            return;
        }

        if (isRecordPointer(event) || raycaster.intersectObjects(recordHitTargets, true).length) {
            pointerMode = 'record';
            if (event.pointerId != null) inputSurface.setPointerCapture?.(event.pointerId);
            event.preventDefault?.();
        }
    }

    function moveInteraction(event) {
        const rect = stage.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) - 0.5;
        const y = ((event.clientY - rect.top) / rect.height) - 0.5;
        targets.rotY = x * 0.13;
        targets.rotX = -0.04 - y * 0.1;

        if (sliderDragging) {
            setVolumeFromPointer(event);
            event.preventDefault?.();
        }

        if (pointerMode === 'record' && !recordSwap.active) {
            const dx = event.clientX - pointerStartX;
            const dy = event.clientY - pointerStartY;
            recordSwap.dragOffset.set(clamp(dx * 0.0032, -0.34, 0.34), clamp(-dy * 0.0032, -0.34, 0.34));
            event.preventDefault?.();
        }
    }

    function finishInteraction(event) {
        if (activePointerId === null && !pointerMode) return;
        const dx = event.clientX - pointerStartX;
        const dy = event.clientY - pointerStartY;
        const moved = Math.hypot(dx, dy);

        if (pointerMode === 'arm' && moved < 18) {
            cuePlayCeremony();
            dispatchPlayerEvent('vinyl3d:toggle');
            lastDirectGestureAt = performance.now();
        }

        if (pointerMode === 'record') {
            const swipe = dominantSwipe(dx, dy);
            if (swipe) {
                startRecordSwap(swipe.direction, swipe.eventName);
                lastDirectGestureAt = performance.now();
            }
        }

        endPointer(event);
    }

    inputSurface.addEventListener('pointercancel', endPointer);
    inputSurface.addEventListener('pointerleave', () => {
        if (activePointerId === null) {
            targets.rotX = -0.04;
            targets.rotY = 0;
        }
    });

    window.addEventListener('player3d:press', (event) => {
        if (!event.detail) return;
        if (event.detail.id === 'playPauseBtn' && event.detail.active) cuePlayCeremony();
    });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    window.addEventListener('resize', resize);
    resize();
    animate();

    function endPointer(event) {
        const eventId = event.pointerId ?? activePointerId ?? 'mouse';
        sliderDragging = false;
        pointerMode = null;
        if (activePointerId === eventId) {
            if (event.pointerId != null) inputSurface.releasePointerCapture?.(event.pointerId);
            activePointerId = null;
        }
    }

    function updatePointer(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
        raycaster.setFromCamera(pointer, camera);
    }

    function normalizedPointer(event) {
        const rect = stage.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) / rect.width,
            y: (event.clientY - rect.top) / rect.height
        };
    }

    function isVolumePointer(event) {
        const p = normalizedPointer(event);
        return p.x > 0.72 && p.x < 0.99 && p.y > 0.48 && p.y < 0.75;
    }

    function isRecordPointer(event) {
        const p = normalizedPointer(event);
        const dx = (p.x - 0.39) / 0.37;
        const dy = (p.y - 0.47) / 0.37;
        return dx * dx + dy * dy <= 1;
    }

    function isArmPointer(event) {
        const p = normalizedPointer(event);
        if (isVolumePointer(event)) return false;
        const nearPivot = Math.hypot(p.x - 0.76, p.y - 0.39) < 0.085;
        const nearHead = p.x > 0.59 && p.x < 0.70 && p.y > 0.50 && p.y < 0.62;
        const nearArmTube = distanceToSegment(p, { x: 0.76, y: 0.39 }, { x: 0.63, y: 0.56 }) < 0.055;
        return nearPivot || nearHead || nearArmTube;
    }

    function distanceToSegment(point, start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSq = dx * dx + dy * dy;
        if (!lengthSq) return Math.hypot(point.x - start.x, point.y - start.y);
        const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1);
        return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
    }

    function setVolumeFromPointer(event) {
        const p = normalizedPointer(event);
        const value = clamp(1 - ((p.y - 0.52) / 0.13), 0, 1);
        const input = document.getElementById('volumeControl');
        if (!input) return;
        input.value = value.toFixed(2);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function resize() {
        const rect = stage.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        const aspect = width / height;
        const portraitAmount = clamp((1.05 - aspect) / 0.65, 0, 1);
        camera.aspect = aspect;
        camera.position.z = 6.1 + portraitAmount * 8.6;
        root.position.y = portraitAmount * -0.08;
        root.position.x = portraitAmount * 0.02;
        root.scale.setScalar(1 + portraitAmount * 0.02);
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
    }

    function animate() {
        const delta = Math.min(clock.getDelta(), 0.04);
        const time = clock.elapsedTime;
        const playing = isPlaying();
        const volume = Number(document.getElementById('volumeControl')?.value ?? 0.5);

        if (playing !== playCeremony.wasPlaying) {
            if (playing && time > playCeremony.previewUntil) {
                playCeremony.startedAt = time;
                targets.armGlow = 1.15;
                interactionHintStrength = 0;
            }
            if (!playing) targets.armGlow = Math.max(targets.armGlow, 0.28);
            playCeremony.wasPlaying = playing;
        }
        const visualPlaying = playing || time < playCeremony.previewUntil;
        const ceremony = calculatePlayCeremony({
            elapsed: time - playCeremony.startedAt,
            isPlaying: visualPlaying,
            duration: 1.48
        });
        playCeremony.values = ceremony;

        root.rotation.x += (targets.rotX - root.rotation.x) * 0.07;
        root.rotation.y += (targets.rotY - root.rotation.y) * 0.07;

        if (recordSwap.active) {
            updateRecordSwap(delta);
        } else {
            const hintAmount = !playing ? Math.max(0, Math.min(1, interactionHintStrength)) * Math.max(0, 1 - time / 8.5) : 0;
            const swipeHint = Math.sin(time * 1.75) * 0.055 * hintAmount;
            recordGroup.position.x += ((recordHome.x + recordSwap.dragOffset.x + swipeHint) - recordGroup.position.x) * 0.16;
            recordGroup.position.y += ((recordHome.y + recordSwap.dragOffset.y) - recordGroup.position.y) * 0.16;
            recordGroup.position.z += (recordHome.z - recordGroup.position.z) * 0.16;
            recordGroup.scale.x += (1 - recordGroup.scale.x) * 0.14;
            recordGroup.scale.y += (1 - recordGroup.scale.y) * 0.14;
            recordGroup.scale.z += (1 - recordGroup.scale.z) * 0.14;
            recordGroup.rotation.x += (0 - recordGroup.rotation.x) * 0.12;
            recordGroup.rotation.y += ((-swipeHint * 0.45) - recordGroup.rotation.y) * 0.12;
            recordSwap.dragOffset.multiplyScalar(pointerMode === 'record' ? 1 : 0.82);
        }

        const spinSpeed = visualPlaying ? 0.76 + ceremony.recordBoost * 1.35 : 0.02;
        recordGroup.rotation.z += delta * spinSpeed;

        const landedAngle = -0.16 + Math.sin(time * 0.9) * 0.006 + ceremony.armLift * 0.085 - ceremony.grooveBloom * 0.012;
        const armHint = !visualPlaying ? Math.max(0, 1 - time / 8.5) * Math.max(0, Math.sin(time * 2.25 - 0.35)) : 0;
        const restAngle = 0.30 - armHint * 0.038 * interactionHintStrength;
        const armTarget = visualPlaying ? landedAngle : restAngle;
        tonearm.rotation.z += (armTarget - tonearm.rotation.z) * (visualPlaying ? 0.095 + ceremony.progress * 0.035 : 0.08);
        const needleLift = ceremony.armLift * 0.075;
        headBase.position.z = headBaseHomeZ + needleLift;
        head.position.z = headHomeZ + needleLift;
        needle.position.z = needleHomeZ + needleLift * 0.82 - ceremony.grooveBloom * 0.01;
        needle.scale.setScalar(visualPlaying ? 1 + ceremony.labelGlow * 0.045 : 0.86);
        const labelPulse = ceremony.labelGlow + (visualPlaying ? Math.max(0, Math.sin(time * 5.2)) * 0.08 : 0);
        label.scale.setScalar(1 + labelPulse * 0.025);
        labelRing.scale.setScalar(1 + labelPulse * 0.08);
        labelRing.material.opacity = clamp(0.58 + labelPulse * 0.32, 0.4, 0.94) * recordOpacity;
        panelBase.material.opacity = 0.16 + ceremony.grooveBloom * 0.035;
        knob.position.y += ((-0.31 + volume * 0.62) - knob.position.y) * 0.16;
        magentaGlow.intensity = (visualPlaying ? 1.2 + Math.sin(time * 4.5) * 0.12 : 0.44) + targets.armGlow * 0.7 + ceremony.labelGlow * 1.05;
        targets.armGlow *= 0.9;

        updateGrooveEnergy(visualPlaying, ceremony);
        animateGrooves(time, playing);

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }

    function updateGrooveEnergy(playing, ceremony = calculatePlayCeremony()) {
        const data = playing ? getPlayerState()?.getFrequencyData?.() : null;
        const targetBass = data ? averageFrequency(data, 0, 10) : 0;
        const targetMid = data ? averageFrequency(data, 10, 42) : 0;
        const targetTreble = data ? averageFrequency(data, 42, 96) : 0;
        grooveEnergy.bass += (targetBass - grooveEnergy.bass) * 0.16;
        grooveEnergy.mid += (targetMid - grooveEnergy.mid) * 0.14;
        grooveEnergy.treble += (targetTreble - grooveEnergy.treble) * 0.12;
        const ceremonyFallbackCount = playing ? (ceremony.grooveBloom || 0) * 8 : 0;
        const measuredRingCount = data
            ? calculateGrooveRingCount({
                bass: targetBass,
                mid: targetMid,
                treble: targetTreble,
                maxRings: grooveRings.length
            })
            : 0;
        const ringCountTarget = data ? Math.max(measuredRingCount, ceremonyFallbackCount * 0.45) : ceremonyFallbackCount;
        const ringEase = ringCountTarget > grooveEnergy.ringCount ? 0.22 : 0.32;
        grooveEnergy.ringCount += (ringCountTarget - grooveEnergy.ringCount) * ringEase;
    }

    function animateGrooves(time, playing) {
        const energies = [grooveEnergy.bass, grooveEnergy.mid, grooveEnergy.treble];
        const grooveRatio = grooveRings.length ? grooveEnergy.ringCount / grooveRings.length : 0;
        const ceremonyBloom = playCeremony.values?.grooveBloom || 0;
        const arcCount = Math.max(grooveRatio * grooveArcs.length, ceremonyBloom * 4);
        for (let i = 0; i < grooveArcs.length; i += 1) {
            const arc = grooveArcs[i];
            const energy = energies[arc.userData.band] || 0;
            const arcMask = visibleCountMask(i, arcCount, 1.15);
            const shimmer = Math.sin(time * (playing ? 2.2 : 0.8) + arc.userData.phase) * 0.025;
            const opacity = clamp(arc.userData.baseOpacity + energy * 0.24 + ceremonyBloom * 0.12 + shimmer, 0.045, 0.62);
            const scale = 1 + energy * (0.018 + i * 0.0012) + ceremonyBloom * 0.01 + shimmer * 0.012;
            arc.scale.setScalar(scale);
            arc.material.opacity = opacity * arcMask * recordOpacity;
        }
        for (let i = 0; i < grooveRings.length; i += 1) {
            const ring = grooveRings[i];
            const energy = energies[ring.userData.band] || 0;
            const countMask = visibleCountMask(i, Math.max(grooveEnergy.ringCount, ceremonyBloom * 8), 1.25);
            const ripple = Math.sin(time * (playing ? 2.8 : 0.65) + ring.userData.phase) * 0.012;
            const scale = 1 + energy * (0.022 + i * 0.0009) + grooveEnergy.bass * i * 0.00045 + ceremonyBloom * 0.006 + ripple;
            ring.scale.setScalar(scale);
            const opacity = clamp(
                ring.userData.baseOpacity +
                energy * 0.18 +
                grooveEnergy.mid * 0.05 +
                grooveRatio * 0.09 +
                ceremonyBloom * 0.12 +
                Math.max(0, ripple) * 0.2,
                0.006,
                0.44
            );
            ring.material.opacity = opacity * countMask * recordOpacity;
        }
    }

    function visibleCountMask(index, count, feather = 1) {
        return clamp((count - index) / feather, 0, 1);
    }

    function averageFrequency(data, start, end) {
        if (!data || !data.length) return 0;
        const from = Math.max(0, Math.min(data.length - 1, start));
        const to = Math.max(from + 1, Math.min(data.length, end));
        let sum = 0;
        for (let i = from; i < to; i += 1) sum += data[i];
        return Math.pow((sum / (to - from)) / 255, 1.25);
    }

    function dominantSwipe(dx, dy) {
        const distance = Math.hypot(dx, dy);
        if (distance < 32 || recordSwap.active) return null;
        const isHorizontal = Math.abs(dx) >= Math.abs(dy);
        const eventName = isHorizontal
            ? (dx > 0 ? 'vinyl3d:prev' : 'vinyl3d:next')
            : (dy > 0 ? 'vinyl3d:prev' : 'vinyl3d:next');
        const direction = new THREE.Vector2(dx, -dy);
        if (direction.lengthSq() < 0.001) direction.set(eventName === 'vinyl3d:next' ? -1 : 1, 0);
        direction.normalize();
        return { eventName, direction };
    }

    function startRecordSwap(direction, eventName) {
        if (recordSwap.active) return;
        recordSwap.active = true;
        recordSwap.phase = 'out';
        recordSwap.progress = 0;
        recordSwap.eventName = eventName;
        recordSwap.direction.copy(direction);
        recordSwap.dragOffset.set(0, 0);
        targets.armGlow = 0.55;
    }

    function updateRecordSwap(delta) {
        const travel = 4.25;
        const direction = recordSwap.direction;
        recordSwap.progress = Math.min(1, recordSwap.progress + delta * (recordSwap.phase === 'out' ? 1.05 : 1.45));

        if (recordSwap.phase === 'out') {
            const eased = easeInOut(recordSwap.progress);
            setRecordOpacity(1 - eased);
            const lift = Math.sin(eased * Math.PI);
            recordGroup.position.set(
                recordHome.x + direction.x * travel * eased,
                recordHome.y + direction.y * travel * eased,
                recordHome.z + 0.54 * lift
            );
            const scale = 1 - eased * 0.18;
            recordGroup.scale.set(scale, scale, scale);
            recordGroup.rotation.x = direction.y * 0.28 * lift;
            recordGroup.rotation.y = -direction.x * 0.22 * lift;
            recordGroup.rotation.z += (recordSwap.eventName === 'vinyl3d:next' ? -1 : 1) * delta * 5.2;

            if (recordSwap.progress >= 1) {
                dispatchPlayerEvent(recordSwap.eventName);
                refreshLabelTexture();
                recordSwap.phase = 'in';
                recordSwap.progress = 0;
                setRecordOpacity(0);
                recordGroup.position.set(recordHome.x - direction.x * travel, recordHome.y - direction.y * travel, recordHome.z + 0.05);
                recordGroup.scale.setScalar(0.82);
                recordGroup.rotation.x = -direction.y * 0.18;
                recordGroup.rotation.y = direction.x * 0.14;
            }
            return;
        }

        const eased = easeOutCubic(recordSwap.progress);
        setRecordOpacity(eased);
        const lift = Math.sin((1 - eased) * Math.PI);
        recordGroup.position.set(
            recordHome.x - direction.x * travel * (1 - eased),
            recordHome.y - direction.y * travel * (1 - eased),
            recordHome.z + 0.38 * lift
        );
        const scale = 0.82 + eased * 0.18;
        recordGroup.scale.set(scale, scale, scale);
        recordGroup.rotation.x = -direction.y * 0.18 * (1 - eased);
        recordGroup.rotation.y = direction.x * 0.14 * (1 - eased);
        recordGroup.rotation.z += (recordSwap.eventName === 'vinyl3d:next' ? -1 : 1) * delta * 4.0;

        if (recordSwap.progress >= 1) {
            recordSwap.active = false;
            recordSwap.phase = 'idle';
            recordSwap.eventName = null;
            recordGroup.position.copy(recordHome);
            recordGroup.scale.set(1, 1, 1);
            recordGroup.rotation.x = 0;
            recordGroup.rotation.y = 0;
            setRecordOpacity(1);
        }
    }

    function registerRecordFadeTargets(group) {
        group.traverse((child) => {
            const materialsToRegister = Array.isArray(child.material) ? child.material : [child.material];
            materialsToRegister.forEach((material) => {
                if (!material || recordFadeMaterials.includes(material)) return;
                material.transparent = true;
                material.userData.recordBaseOpacity = material.opacity ?? 1;
                recordFadeMaterials.push(material);
            });
        });
    }

    function setRecordOpacity(value) {
        recordOpacity = clamp(value, 0, 1);
        recordFadeMaterials.forEach((material) => {
            material.opacity = (material.userData.recordBaseOpacity ?? 1) * recordOpacity;
            material.needsUpdate = true;
        });
    }

    function refreshLabelTexture() {
        const nextIndex = Number(getPlayerState()?.getCurrentSongIndex?.() ?? 0);
        if (label.material.map) label.material.map.dispose();
        label.material.map = makeLabelTexture(nextIndex);
        label.material.needsUpdate = true;
    }

    function easeInOut(value) {
        return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
    }

    function easeOutCubic(value) {
        return 1 - Math.pow(1 - value, 3);
    }

    function isPlaying() {
        return Boolean(getPlayerState()?.isPlaying?.());
    }

    function getPlayerState() {
        const detail = { state: window.player3DState || null };
        dispatchPlayerEvent('player3d:request-state', detail);
        return detail.state || window.player3DState || null;
    }

    function dispatchPlayerEvent(name, detail = {}) {
        let event;
        if (typeof CustomEvent === 'function') {
            event = new CustomEvent(name, { detail });
        } else {
            event = document.createEvent('CustomEvent');
            event.initCustomEvent(name, false, false, detail);
        }
        window.dispatchEvent(event);
        return detail;
    }

    function roundedRectGeometry(width, height, radius) {
        const x = -width / 2;
        const y = -height / 2;
        const shape = new THREE.Shape();
        shape.moveTo(x + radius, y);
        shape.lineTo(x + width - radius, y);
        shape.quadraticCurveTo(x + width, y, x + width, y + radius);
        shape.lineTo(x + width, y + height - radius);
        shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        shape.lineTo(x + radius, y + height);
        shape.quadraticCurveTo(x, y + height, x, y + height - radius);
        shape.lineTo(x, y + radius);
        shape.quadraticCurveTo(x, y, x + radius, y);
        return new THREE.ShapeGeometry(shape, 20);
    }

    function makeArc(radius, tubeRadius, start, length, material) {
        const points = [];
        const segments = 56;
        for (let i = 0; i <= segments; i += 1) {
            const angle = start + (i / segments) * length;
            points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
        }
        return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, tubeRadius, 8, false), material);
    }

    function makeDeckTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 800;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#fbfdfc');
        gradient.addColorStop(0.48, '#eef4f2');
        gradient.addColorStop(1, '#dfe9e6');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const shine = ctx.createRadialGradient(260, 118, 18, 260, 118, 560);
        shine.addColorStop(0, 'rgba(255,255,255,0.82)');
        shine.addColorStop(0.42, 'rgba(255,255,255,0.22)');
        shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const lowerShade = ctx.createLinearGradient(0, 620, 0, canvas.height);
        lowerShade.addColorStop(0, 'rgba(112,132,128,0)');
        lowerShade.addColorStop(1, 'rgba(112,132,128,0.11)');
        ctx.fillStyle = lowerShade;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(87,106,103,0.07)';
        for (let i = 0; i < 16; i += 1) {
            ctx.fillRect(60 + i * 62, 708 + (i % 3) * 10, 34 + (i % 4) * 12, 4);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    function makeRecordTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const radius = 500;
        const base = ctx.createRadialGradient(cx - 170, cy - 160, 20, cx, cy, radius);
        base.addColorStop(0, '#626767');
        base.addColorStop(0.1, '#2b2e2e');
        base.addColorStop(0.55, '#101314');
        base.addColorStop(0.82, '#252829');
        base.addColorStop(1, '#070808');
        ctx.fillStyle = base;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 8, 0, Math.PI * 2);
        ctx.clip();
        for (let r = 108; r < radius - 20; r += 11) {
            ctx.beginPath();
            ctx.strokeStyle = r % 33 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.052)';
            ctx.lineWidth = r % 33 === 0 ? 2 : 1;
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (let i = 0; i < 1100; i += 1) {
            const a = Math.random() * Math.PI * 2;
            const r = 92 + Math.random() * 385;
            const alpha = Math.random() * 0.07;
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1);
        }
        const highlight = ctx.createLinearGradient(120, 100, 850, 790);
        highlight.addColorStop(0, 'rgba(255,255,255,0)');
        highlight.addColorStop(0.42, 'rgba(255,255,255,0.19)');
        highlight.addColorStop(0.5, 'rgba(255,255,255,0.045)');
        highlight.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = highlight;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    function makeLabelTexture(index = 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const cx = 256;
        const cy = 256;
        const palette = [
            ['#ff86d6', '#e64dac', '#a82a82'],
            ['#ffce5c', '#ff7a4d', '#c8434d'],
            ['#7ef2ff', '#28b7e6', '#2369c8'],
            ['#b8ff73', '#35c987', '#137c70'],
            ['#d8a3ff', '#9b55ed', '#4d38ad']
        ];
        const colors = palette[Math.abs(index) % palette.length];
        const bg = ctx.createRadialGradient(cx - 80, cy - 88, 18, cx, cy, 230);
        bg.addColorStop(0, colors[0]);
        bg.addColorStop(0.42, colors[1]);
        bg.addColorStop(1, colors[2]);
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(cx, cy, 224, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx, cy, 198, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.beginPath();
        ctx.ellipse(cx - 72, cy - 78, 50, 24, -0.55, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(20,24,25,0.48)';
        ctx.beginPath();
        ctx.arc(cx, cy, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fill();
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    function makeSoftShadowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 420;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(330, 215, 20, 330, 215, 290);
        gradient.addColorStop(0, 'rgba(10, 45, 48, 0.42)');
        gradient.addColorStop(0.45, 'rgba(10, 45, 48, 0.16)');
        gradient.addColorStop(1, 'rgba(10, 45, 48, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
}