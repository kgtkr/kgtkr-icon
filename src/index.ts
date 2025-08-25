import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const scene = new THREE.Scene();
const bones: THREE.Bone[] = [];

class Part {
  constructor(
    public geometry: THREE.BufferGeometry,
    public material: THREE.Material,
    public position: THREE.Vector3,
    public children: Part[] = []
  ) {}

  add(part: Part) {
    this.children.push(part);
  }

  buildMesh(skeleton: THREE.Skeleton): THREE.Group {
    const group = new THREE.Group();
    //this.geometry.translate(this.position.x, this.position.y, this.position.z);
    const skinnedMesh = new THREE.SkinnedMesh(this.geometry, this.material);

    skinnedMesh.bind(skeleton);
    group.add(skinnedMesh);

    for (const child of this.children) {
      const childGroup = child.buildMesh(skeleton);
      group.add(childGroup);
    }

    return group;
  }
}

function addBone(bone: THREE.Bone): number {
  const idx = bones.length;
  bones.push(bone);
  return idx;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  const r = t * t * (3 - 2 * t);
  return Math.max(0, Math.min(1, r));
}

function createArm(namePrefix: "left" | "right") {
  const direction = { left: 1, right: -1 }[namePrefix];

  const color = 0x333333;

  const shoulderBone = new THREE.Bone();
  shoulderBone.name = `${namePrefix}Shoulder`;
  shoulderBone.position.set(0.05 * direction, 0, 0);
  const shoulderBoneIdx = addBone(shoulderBone);

  const upperBone = new THREE.Bone();
  upperBone.name = `${namePrefix}UpperArm`;
  upperBone.position.x = 0.1 * direction;
  shoulderBone.add(upperBone);
  const upperBoneIdx = addBone(upperBone);

  const lowerBone = new THREE.Bone();
  lowerBone.name = `${namePrefix}LowerArm`;
  lowerBone.position.x = 0.2 * direction;
  upperBone.add(lowerBone);
  const lowerBoneIdx = addBone(lowerBone);

  const geometry1 = new THREE.CylinderGeometry(0.15 / 2, 0.15 / 2, 0.3, 16, 16);
  const geometry2 = new THREE.SphereGeometry(0.15 / 2, 16, 16);
  geometry2.translate(0, direction * 0.15, 0);
  const geometry = mergeGeometries([geometry1, geometry2]);
  geometry.rotateZ(Math.PI / 2);
  geometry.translate(0.15 * direction, 0, 0);

  // skinIndices と skinWeights を設定
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const vertexCount = geometry.attributes.position.count;
  const position = geometry.attributes.position;
  for (let i = 0; i < vertexCount; i++) {
    skinIndices.push(upperBoneIdx, lowerBoneIdx, 0, 0);

    const x = position.getX(i) * direction;
    const centerX = 0;
    const threshold = 0.2;
    const edge0 = centerX - threshold;
    const edge1 = centerX + threshold;
    const weight = smoothstep(edge0, edge1, x);
    skinWeights.push(1 - weight, weight, 0, 0);
  }

  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndices, 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeights, 4)
  );

  const material = new THREE.MeshBasicMaterial({ color });

  return {
    part: new Part(
      geometry,
      material,
      new THREE.Vector3(0.4 * direction, 0.2, 0)
    ),
    shoulderBone,
    upperBone,
    lowerBone,
  };
}

function createHand(namePrefix: "left" | "right") {
  const direction = { left: 1, right: -1 }[namePrefix];

  const color = 0xffdca6;
  const bone = new THREE.Bone();
  bone.name = `${namePrefix}Hand`;
  bone.position.x = direction * 0.3;
  const boneIdx = addBone(bone);

  const geometry = new THREE.SphereGeometry(0.1, 16);

  // skinIndices と skinWeights を設定
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const vertexCount = geometry.attributes.position.count;
  for (let i = 0; i < vertexCount; i++) {
    skinIndices.push(boneIdx, 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
  }

  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndices, 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeights, 4)
  );

  const material = new THREE.MeshBasicMaterial({ color });

  return {
    part: new Part(
      geometry,
      material,
      new THREE.Vector3(0.35 * direction, 0, 0)
    ),
    bone,
  };
}

function createLeg(namePrefix: "left" | "right") {
  const direction = { left: 1, right: -1 }[namePrefix];

  const upperLegBone = new THREE.Bone();
  upperLegBone.name = `${namePrefix}UpperLeg`;
  upperLegBone.position.set(0.15 * direction, -0.05, 0);
  const upperLegBoneIdx = addBone(upperLegBone);

  const lowerLegBone = new THREE.Bone();
  lowerLegBone.name = `${namePrefix}LowerLeg`;
  lowerLegBone.position.set(0, -0.3, 0);
  upperLegBone.add(lowerLegBone);
  const lowerLegBoneIdx = addBone(lowerLegBone);

  // const geometry = new THREE.BoxGeometry(0.15, 0.6, 0.15, 1, 8);
  const geometry1 = new THREE.CylinderGeometry(0.15 / 2, 0.15 / 2, 0.4, 16, 16);
  const geometry2 = new THREE.SphereGeometry(0.15 / 2, 16, 16);
  geometry2.translate(0, 0.2, 0);
  const geometry = mergeGeometries([geometry1, geometry2]);
  geometry.translate(0, -0.14, 0);

  const vertexCount = geometry.attributes.position.count;
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const position = geometry.attributes.position;
  for (let i = 0; i < vertexCount; i++) {
    skinIndices.push(upperLegBoneIdx, lowerLegBoneIdx, 0, 0);

    const y = position.getY(i);
    const threshold = 0.15;
    const centerY = 0;
    const edge0 = centerY - threshold;
    const edge1 = centerY + threshold;

    const weight = smoothstep(edge0, edge1, y);
    skinWeights.push(weight, 1 - weight, 0, 0);
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndices, 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeights, 4)
  );

  const bodyMaterial = new THREE.MeshBasicMaterial({
    color: 0x6496ff,
  });

  return {
    part: new Part(
      geometry,
      bodyMaterial,
      new THREE.Vector3(0.15 * direction, -0.65, 0)
    ),
    upperLegBone,
    lowerLegBone,
  };
}

function createFoot(namePrefix: "left" | "right") {
  const direction = { left: 1, right: -1 }[namePrefix];

  const bone = new THREE.Bone();
  bone.name = `${namePrefix}Foot`;
  bone.position.set(0, -0.3, 0);
  const boneIdx = addBone(bone);

  const geometry = new THREE.BoxGeometry(0.2, 0.1, 0.3, 1, 8);
  geometry.translate(0, 0, 0.05);

  const vertexCount = geometry.attributes.position.count;
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    skinIndices.push(boneIdx, 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndices, 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeights, 4)
  );

  const material = new THREE.MeshBasicMaterial({
    color: 0xb4b4b4,
  });

  return {
    part: new Part(geometry, material, new THREE.Vector3(0, -0.3, 0.05)),
    bone,
  };
}

function createHead() {
  const faceTexture = new THREE.CanvasTexture(createFaceTextureCanvas());
  {
    const img = document.createElement("img");
    img.src = faceTexture.image.toDataURL();
    document.body.appendChild(img);
  }

  const bone = new THREE.Bone();
  bone.name = "head";
  bone.position.set(0, 0.05, 0);
  const boneIdx = addBone(bone);

  const geometry = new THREE.SphereGeometry(0.35, 16, 16);
  geometry.rotateY(-Math.PI / 2);
  geometry.scale(0.83, 1, 1);
  geometry.translate(0, 0.3, 0);

  const vertexCount = geometry.attributes.position.count;
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    skinIndices.push(boneIdx, 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
  }
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndices, 4)
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeights, 4)
  );

  const material = new THREE.MeshBasicMaterial({ map: faceTexture });

  return {
    part: new Part(geometry, material, new THREE.Vector3(0, 0.7, 0)),
    bone,
  };
}

function createBody() {
  const hipsBone = new THREE.Bone();
  hipsBone.name = "hips";
  hipsBone.position.set(0, -0.25, 0);
  const hipsBoneIdx = addBone(hipsBone);

  const spineBone = new THREE.Bone();
  spineBone.name = "spine";
  spineBone.position.set(0, 0.1, 0);
  hipsBone.add(spineBone);
  const spineBoneIdx = addBone(spineBone);

  const chestBone = new THREE.Bone();
  chestBone.name = "chest";
  chestBone.position.set(0, 0.2, 0);
  spineBone.add(chestBone);
  const chestBoneIdx = addBone(chestBone);

  const upperChestBone = new THREE.Bone();
  upperChestBone.name = "upperChest";
  upperChestBone.position.set(0, 0.2, 0);
  chestBone.add(upperChestBone);
  const upperChestBoneIdx = addBone(upperChestBone);

  const neckBone = new THREE.Bone();
  neckBone.name = "neck";
  neckBone.position.set(0, 0.05, 0);
  upperChestBone.add(neckBone);
  const neckBoneIdx = addBone(neckBone);

  // 胴体メッシュ
  const bodyGeometry1 = new THREE.CylinderGeometry(0.15, 0.25, 0.4, 16, 16);
  const bodyGeometry2 = new THREE.SphereGeometry(0.15, 16, 16);
  bodyGeometry2.translate(0, 0.2, 0);
  const bodyGeometry3 = new THREE.SphereGeometry(0.25, 16, 16);
  bodyGeometry3.translate(0, -0.25, 0);
  const bodyGeometry = mergeGeometries([
    bodyGeometry1,
    bodyGeometry2,
    bodyGeometry3,
  ]);
  bodyGeometry.translate(0, 0.2, 0);

  // 全頂点に hips の影響（boneIndex: 0, weight: 1.0）
  const vertexCount = bodyGeometry.attributes.position.count;
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const position = bodyGeometry.attributes.position;
  for (let i = 0; i < vertexCount; i++) {
    // yは-0.3～0.4
    const y = position.getY(i);

    if (y < -0.1) {
      skinIndices.push(hipsBoneIdx, spineBoneIdx, 0, 0);
      const weight = smoothstep(-0.3, -0.1, y);
      skinWeights.push(1 - weight, weight, 0, 0);
    } else if (y < 0.1) {
      skinIndices.push(spineBoneIdx, chestBoneIdx, 0, 0);
      const weight = smoothstep(-0.1, 0.1, y);
      skinWeights.push(1 - weight, weight, 0, 0);
    } else if (y < 0.3) {
      skinIndices.push(chestBoneIdx, upperChestBoneIdx, 0, 0);
      const weight = smoothstep(0.1, 0.3, y);
      skinWeights.push(1 - weight, weight, 0, 0);
    } else {
      skinIndices.push(upperChestBoneIdx, neckBoneIdx, 0, 0);
      const weight = smoothstep(0.3, 0.4, y);
      skinWeights.push(1 - weight, weight, 0, 0);
    }
  }
  bodyGeometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndices, 4)
  );
  bodyGeometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeights, 4)
  );

  const bodyMaterial = new THREE.MeshBasicMaterial({
    color: 0x333333,
  });

  return {
    part: new Part(bodyGeometry, bodyMaterial, new THREE.Vector3(0, 0.05, 0)),
    neckBone,
    upperChestBone,
    hipsBone,
    spineBone,
    chestBone,
  };
}

scene.background = new THREE.Color(0x999999);
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 3;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

const head = createHead();

const armL = createArm("left");
const armR = createArm("right");

const handL = createHand("left");
const handR = createHand("right");

const body = createBody();

body.part.add(head.part);
body.neckBone.add(head.bone);
body.upperChestBone.add(armL.shoulderBone);
body.upperChestBone.add(armR.shoulderBone);

body.part.add(armL.part);
body.part.add(armR.part);

armL.lowerBone.add(handL.bone);
armR.lowerBone.add(handR.bone);
armL.part.add(handL.part);
armR.part.add(handR.part);

const legL = createLeg("left");
const legR = createLeg("right");

body.hipsBone.add(legL.upperLegBone);
body.hipsBone.add(legR.upperLegBone);
body.part.add(legL.part);
body.part.add(legR.part);

const footL = createFoot("left");
const footR = createFoot("right");

legL.lowerLegBone.add(footL.bone);
legR.lowerLegBone.add(footR.bone);
legL.part.add(footL.part);
legR.part.add(footR.part);

const skeleton = new THREE.Skeleton(bones);
console.log(skeleton);
console.log(body.part);
const mesh = body.part.buildMesh(skeleton);
mesh.position.add(new THREE.Vector3(0, 1, 0));
console.log(mesh);
mesh.add(body.hipsBone);
scene.add(new THREE.SkeletonHelper(mesh));
scene.add(mesh);
scene.add(new THREE.GridHelper(10));

function createFaceTextureCanvas() {
  const UP_SCALE = 4;
  const width = 256;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width * UP_SCALE;
  canvas.height = height * UP_SCALE;
  const g = canvas.getContext("2d")!;
  g.scale(UP_SCALE, UP_SCALE);

  g.fillStyle = "rgb(255, 220, 170)";
  g.fillRect(0, 0, width, height);

  // 前髪ギザギザ
  g.fillStyle = "black";
  g.beginPath();
  g.moveTo(0, 128);
  for (let i = 0; i <= 30; i++) {
    const x = (i / 30) * width;
    const y = i % 2 === 0 ? 112 : 128;
    g.lineTo(x, y);
  }
  g.lineTo(width, 128);
  g.lineTo(width, 0);
  g.lineTo(0, 0);
  g.closePath();
  g.fill();

  // 後ろ髪
  g.fillStyle = "black";
  g.beginPath();
  g.ellipse(254, 80, 120, 80, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(-8, 80, 120, 80, 0, 0, Math.PI * 2);
  g.fill();

  // 眉毛
  g.strokeStyle = "black";
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(112, 135, 10, 6, 0, Math.PI * (200 / 180), Math.PI * (340 / 180));
  g.stroke();
  g.beginPath();
  g.ellipse(144, 135, 10, 6, 0, Math.PI * (200 / 180), Math.PI * (340 / 180));
  g.stroke();

  // 口
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(118, 185);
  g.lineTo(138, 185);
  g.stroke();

  // 目
  drawEye(g, 113, 146); // 左
  drawEye(g, 143, 146, true); // 右（反転）

  // 鼻
  g.beginPath();
  g.ellipse(128, 168, 5, 3, 0, 0, Math.PI);
  g.lineWidth = 2;
  g.stroke();

  return canvas;
}

function drawEye(g, x, y, flip = false) {
  g.save();
  g.translate(x, y);
  if (flip) {
    g.scale(-1, 1);
  }

  // 白目
  g.fillStyle = "white";
  g.beginPath();
  g.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
  g.fill();

  // 黒目
  g.fillStyle = "black";
  g.beginPath();
  g.ellipse(1, 0, 4.5, 5, 0, 0, Math.PI * 2);
  g.fill();

  // 上まぶた
  g.strokeStyle = "black";
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(0, 0, 9, 6, 0, Math.PI * (185 / 180), Math.PI * (355 / 180));
  g.stroke();

  // 下まぶた
  g.beginPath();
  g.ellipse(0, 0, 9, 6, 0, Math.PI * (5 / 180), Math.PI * (175 / 180));
  g.stroke();

  g.restore();
}

function animate() {
  requestAnimationFrame(animate);

  const t = Date.now() * 0.001;
  head.bone.rotation.z = Math.sin(t + 1.5) * 0.3;
  armL.upperBone.rotation.z = -Math.abs(Math.sin(t)) * 0.7;
  armR.upperBone.rotation.z = Math.abs(Math.sin(t)) * 0.7;

  armL.lowerBone.rotation.z = -Math.abs(Math.sin(t)) * 0.7;
  armR.lowerBone.rotation.z = Math.abs(Math.sin(t)) * 0.7;
  body.hipsBone.rotation.z = Math.sin(t + 2) * 0.3;

  legL.upperLegBone.rotation.x = Math.sin(t * 3) * 0.5;
  legR.upperLegBone.rotation.x = Math.sin(t * 3 + 1) * 0.5;

  legL.lowerLegBone.rotation.x = Math.sin(t * 3) * 0.5;
  legR.lowerLegBone.rotation.x = Math.sin(t * 3 + 1) * 0.5;

  controls.update();
  renderer.render(scene, camera);
}

const exporter = new GLTFExporter();

exporter.register((parser) => {
  return {
    afterParse: (_input) => {
      parser.extensionsUsed["VRMC_vrm"] = true;
      const gltf = (parser as any).json;
      const nodeNameToIndex = new Map<string, number>();
      gltf.nodes.forEach((node: any, index: number) => {
        if (node.name) {
          nodeNameToIndex.set(node.name, index);
        }
      });

      const boneNames = [
        "hips",
        "spine",
        "chest",
        "upperChest",
        "neck",
        "head",
        "leftUpperLeg",
        "leftLowerLeg",
        "leftFoot",
        "rightUpperLeg",
        "rightLowerLeg",
        "rightFoot",
        "leftShoulder",
        "leftUpperArm",
        "leftLowerArm",
        "leftHand",
        "rightShoulder",
        "rightUpperArm",
        "rightLowerArm",
        "rightHand",
      ];
      const humanBones: any = {};
      boneNames.forEach((boneName) => {
        const nodeIndex = nodeNameToIndex.get(boneName);
        if (nodeIndex !== undefined) {
          humanBones[boneName] = { node: nodeIndex };
        } else {
          console.warn(`Bone "${boneName}" not found in the scene.`);
        }
      });

      console.log("Human bones:", humanBones);

      gltf.extensionsUsed = gltf.extensionsUsed || [];
      gltf.extensionsUsed.push("VRMC_vrm");
      gltf.extensions = gltf.extensions || {};
      gltf.extensions.VRMC_vrm = {
        specVersion: "1.0",
        meta: {
          name: "kgtkr",
          version: "1.0",
          authors: ["kgtkr"],
          licenseUrl: "https://vrm.dev/licenses/1.0/",
        },
        humanoid: {
          humanBones,
        },
        expressions: {
          preset: {
            happy: {
              name: "happy",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            angry: {
              name: "angry",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            sad: {
              name: "sad",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            relaxed: {
              name: "relaxed",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            surprised: {
              name: "surprised",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            aa: {
              name: "aa",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "block",
              morphTargetBinds: [],
            },
            ih: {
              name: "ih",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "block",
              morphTargetBinds: [],
            },
            ou: {
              name: "ou",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "block",
              morphTargetBinds: [],
            },
            ee: {
              name: "ee",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "block",
              morphTargetBinds: [],
            },
            oh: {
              name: "oh",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "block",
              morphTargetBinds: [],
            },
            blink: {
              name: "blink",
              isBinary: false,
              overrideBlink: "block",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            blinkLeft: {
              name: "blinkLeft",
              isBinary: false,
              overrideBlink: "block",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            blinkRight: {
              name: "blinkRight",
              isBinary: false,
              overrideBlink: "block",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            lookUp: {
              name: "lookUp",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "block",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            lookDown: {
              name: "lookDown",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "block",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            lookLeft: {
              name: "lookLeft",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "block",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            lookRight: {
              name: "lookRight",
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "block",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
          },
        },
      };
      console.log("afterParse:", JSON.parse(JSON.stringify(gltf)));
    },
  };
});

exporter.parse(
  mesh,
  async (blb: any) => {
    const blob = new Blob([blb], {
      type: "application/octet-stream",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "kgtkr.vrm";

    animate();

    const exportBtn = document.getElementById("exportBtn")!;
    exportBtn.addEventListener("click", () => {
      link.click();
    });

    // 正常に読み込めるかチェック
    const loader = new GLTFLoader();
    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });
    loader.load(
      link.href,
      (gltf) => {
        console.log(gltf.parser.json);
        const vrm = gltf.userData.vrm;
        console.log(gltf);
        console.log(vrm);

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.combineMorphs(vrm);
      },
      (progress) => {},
      (error) => console.error(error)
    );
  },
  (error) => {
    console.error("An error occurred during export:", error);
  },
  { binary: true, includeCustomExtensions: true }
);
