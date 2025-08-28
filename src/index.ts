import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const enableBone = true;
const debugBoneWeights: number | null = null; // ボーンウェイトの可視化デバッグ対象のインデックス
const boneAnimation = true;
const scene = new THREE.Scene();
const bones: THREE.Bone[] = [];

const TextureKind = {
  normal: null,
  aa: null,
  ih: null,
  ou: null,
  ee: null,
  oh: null,
  blinkLeft: null,
  blinkRight: null,
} as const;
type TextureKind = keyof typeof TextureKind;
const TextureKinds = Object.keys(TextureKind) as TextureKind[];
const TextureKindToIndex: { [key in TextureKind]: number } = Object.fromEntries(
  TextureKinds.map((k, i) => [k, i])
) as { [key in TextureKind]: number };
class Part {
  constructor(
    public name: string,
    public geometry: THREE.BufferGeometry,
    public material: THREE.Material | THREE.Material[],
    public position: THREE.Vector3,
    public children: Part[] = []
  ) {
    if (debugBoneWeights !== null) {
      this.material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        wireframe: true,
      });
      addBoneWeightVisualization(geometry);
    }
  }

  add(part: Part) {
    this.children.push(part);
  }

  build(meshes: THREE.SkinnedMesh[]): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(this.position);

    const mesh = enableBone
      ? (() => {
          const mesh = new THREE.SkinnedMesh(this.geometry, this.material);
          // モーフターゲットが存在する場合、morphTargetInfluencesを初期化
          if (
            this.geometry.morphAttributes.position &&
            this.geometry.morphAttributes.position.length > 0
          ) {
            mesh.morphTargetInfluences = new Array(
              this.geometry.morphAttributes.position.length
            ).fill(0);
          }
          meshes.push(mesh);
          return mesh;
        })()
      : new THREE.Mesh(this.geometry, this.material);
    mesh.name = this.name;
    group.name = this.name;
    group.add(mesh);

    for (const child of this.children) {
      const childGroup = child.build(meshes);
      group.add(childGroup);
    }

    return group;
  }
}

function createSphereCylinder({
  radiusTop,
  radiusBottom,
  height,
  sphereTop,
  sphereBottom,
}: {
  radiusTop: number;
  radiusBottom: number;
  height: number;
  sphereTop: boolean;
  sphereBottom: boolean;
}) {
  const geometries: THREE.BufferGeometry[] = [];
  const topHeight = sphereTop ? radiusTop : 0;
  const bottomHeight = sphereBottom ? radiusBottom : 0;
  const cylinderHeight = height - topHeight - bottomHeight;

  if (sphereTop) {
    const geometry = new THREE.SphereGeometry(radiusTop, 16, 16);
    geometry.translate(0, cylinderHeight / 2, 0);
    geometries.push(geometry);
  }

  geometries.push(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, cylinderHeight, 16, 16)
  );

  if (sphereBottom) {
    const geometry = new THREE.SphereGeometry(radiusBottom, 16, 16);
    geometry.translate(0, -cylinderHeight / 2, 0);
    geometries.push(geometry);
  }

  const geometry = mergeGeometries(geometries);
  geometry.translate(0, cylinderHeight / 2 + bottomHeight, 0);

  return geometry;
}

function addBone(bone: THREE.Bone): number {
  const idx = bones.length;
  bones.push(bone);
  return idx;
}

function addBoneWeightVisualization(geometry: THREE.BufferGeometry) {
  const vertexCount = geometry.attributes.position.count;
  const colors: number[] = [];
  const skinIndices = geometry.attributes.skinIndex.array as Uint16Array;
  const skinWeights = geometry.attributes.skinWeight.array as Float32Array;

  // 特定のボーンの影響範囲のみ表示
  for (let i = 0; i < vertexCount; i++) {
    let weight = 0;

    // この頂点が対象ボーンの影響を受けているかチェック
    for (let j = 0; j < 4; j++) {
      const boneIndex = skinIndices[i * 4 + j];
      if (boneIndex === debugBoneWeights) {
        weight = skinWeights[i * 4 + j];
        break;
      }
    }

    // ウェイトに応じて色を設定（赤＝強い影響、黒＝影響なし）
    const red = weight;
    const green = weight * 0.3; // 少し緑を混ぜて見やすく
    const blue = 0;

    colors.push(red, green, blue);
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
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

  const geometry = createSphereCylinder({
    radiusTop: 0.15 / 2,
    radiusBottom: 0.15 / 2,
    height: 0.5,
    sphereTop: true,
    sphereBottom: false,
  });
  geometry.rotateZ(direction * (Math.PI / 2));

  // skinIndices と skinWeights を設定
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const vertexCount = geometry.attributes.position.count;
  const position = geometry.attributes.position;
  for (let i = 0; i < vertexCount; i++) {
    skinIndices.push(upperBoneIdx, lowerBoneIdx, 0, 0);

    const x = position.getX(i) * direction;
    const centerX = -0.2;
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
      `${namePrefix}Arm`,
      geometry,
      material,
      new THREE.Vector3(0.6 * direction, 0.2, 0)
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
      `${namePrefix}Hand`,
      geometry,
      material,
      new THREE.Vector3(0.1 * direction, 0, 0)
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

  const geometry = createSphereCylinder({
    radiusTop: 0.15 / 2,
    radiusBottom: 0.15 / 2,
    height: 0.5,
    sphereTop: true,
    sphereBottom: false,
  });

  const vertexCount = geometry.attributes.position.count;
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const position = geometry.attributes.position;
  for (let i = 0; i < vertexCount; i++) {
    skinIndices.push(upperLegBoneIdx, lowerLegBoneIdx, 0, 0);

    const y = position.getY(i);
    const threshold = 0.15;
    const centerY = 0.25;
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

  const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x6496ff });

  return {
    part: new Part(
      `${namePrefix}Leg`,
      geometry,
      bodyMaterial,
      new THREE.Vector3(0.15 * direction, -0.9, 0)
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

  const material = new THREE.MeshBasicMaterial({ color: 0xb4b4b4 });

  return {
    part: new Part(
      `${namePrefix}Foot`,
      geometry,
      material,
      new THREE.Vector3(0, 0, 0.05)
    ),
    bone,
  };
}

function createHead() {
  // 複数の表情テクスチャを作成

  // テクスチャアトラス生成: 上半分=normal, 下半分=aa
  const atlasTexture = new THREE.CanvasTexture(createFaceTextureAtlasCanvas());
  atlasTexture.flipY = false;

  const atlasTexture2 = new THREE.Texture(
    (() => {
      const c = createFaceTextureAtlasCanvas();
      const g = c.getContext("2d")!;
      g.fillStyle = "magenta";
      g.fillRect(0, 0, c.width, c.height);
      return c;
    })()
  );
  atlasTexture2.flipY = false;

  // デバッグ用に画像を表示
  {
    const img = document.createElement("img");
    img.src = atlasTexture.image.toDataURL();

    img.title = "Face Atlas";
    document.body.appendChild(img);
  }

  const bone = new THREE.Bone();
  bone.name = "head";
  bone.position.set(0, 0.05, 0);
  const boneIdx = addBone(bone);

  const geometry = new THREE.SphereGeometry(0.35, 64, 64);
  geometry.scale(1, 1, 0.83);
  geometry.rotateY((Math.PI / 2) * 3);

  for (let i = 0; i < geometry.attributes.uv.count; i++) {
    const u = geometry.attributes.uv.getX(i);
    const v = geometry.attributes.uv.getY(i);
    // 1 - vでflipY=falseに対応
    // さらにテクスチャ数で割ることで一部テクスチャを使う
    geometry.attributes.uv.setXY(i, u, (1 - v) / TextureKinds.length);
  }
  geometry.attributes.uv.needsUpdate = true;

  // 頂点を分類
  const uv = geometry.attributes.uv;
  const mouthVertexIndices: number[] = [];
  const leftEyeVertexIndices: number[] = [];
  const rightEyeVertexIndices: number[] = [];
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const u = uv.getX(i);
    const v = uv.getY(i);

    if (y < -0.1 && y > -0.3 && z > 0.1 && Math.abs(x) < 0.15) {
      mouthVertexIndices.push(i);
    } else if (0.4 < u && u < 0.5 && 0.05 < v && v < 0.1) {
      leftEyeVertexIndices.push(i);
    } else if (0.5 < u && u < 0.6 && 0.05 < v && v < 0.1) {
      rightEyeVertexIndices.push(i);
    }
  }

  // 口などのパーツを別のマテリアルで描画するために、ジオメトリをグループ分け
  geometry.clearGroups();
  const index = geometry.index;
  const faceCount = index
    ? index.count / 3
    : geometry.attributes.position.count / 3;

  const GROUP_FACE = 0;
  const GROUP_MOUTH = 1;
  const GROUP_LEFT_EYE = 2;
  const GROUP_RIGHT_EYE = 3;

  const faceIndices: number[] = [];
  const mouthIndices: number[] = [];
  const leftEyeIndices: number[] = [];
  const rightEyeIndices: number[] = [];

  for (let f = 0; f < faceCount; f++) {
    // 各三角形の頂点インデックス
    const i0 = index ? index.getX(f * 3) : f * 3;
    const i1 = index ? index.getX(f * 3 + 1) : f * 3 + 1;
    const i2 = index ? index.getX(f * 3 + 2) : f * 3 + 2;
    // 3頂点のうち2つ以上がxxxVertexIndicesに含まれていればそのパーツとみなす
    // TODO: 計算量
    const mouthCount = [i0, i1, i2].filter((i) =>
      mouthVertexIndices.includes(i)
    ).length;
    const leftEyeCount = [i0, i1, i2].filter((i) =>
      leftEyeVertexIndices.includes(i)
    ).length;
    const rightEyeCount = [i0, i1, i2].filter((i) =>
      rightEyeVertexIndices.includes(i)
    ).length;

    if (mouthCount >= 2) {
      mouthIndices.push(i0, i1, i2);
    } else if (leftEyeCount >= 2) {
      leftEyeIndices.push(i0, i1, i2);
    } else if (rightEyeCount >= 2) {
      rightEyeIndices.push(i0, i1, i2);
    } else {
      faceIndices.push(i0, i1, i2);
    }
  }

  // addGroupを行う
  const newIndices = new Uint32Array([
    ...faceIndices,
    ...mouthIndices,
    ...leftEyeIndices,
    ...rightEyeIndices,
  ]);
  geometry.setIndex(new THREE.BufferAttribute(newIndices, 1));
  let indexOffset = 0;
  geometry.addGroup(indexOffset, faceIndices.length, GROUP_FACE);
  indexOffset += faceIndices.length;
  geometry.addGroup(indexOffset, mouthIndices.length, GROUP_MOUTH);
  indexOffset += mouthIndices.length;
  geometry.addGroup(indexOffset, leftEyeIndices.length, GROUP_LEFT_EYE);
  indexOffset += leftEyeIndices.length;
  geometry.addGroup(indexOffset, rightEyeIndices.length, GROUP_RIGHT_EYE);
  indexOffset += rightEyeIndices.length;

  /*
  // モーフターゲット用のジオメトリを作成（口を開いた状態）
  const aaGeometry = geometry.clone();
  const positions = aaGeometry.attributes.position;
  const positionsArray = positions.array as Float32Array;

  // 口の部分の頂点を変形（Y座標が低く、Z座標が前面の頂点を対象）
  for (let i = 0; i < positions.count; i++) {
    const x = positionsArray[i * 3];
    const y = positionsArray[i * 3 + 1];
    const z = positionsArray[i * 3 + 2];

    // 口の領域（顔の下部、前面）を判定
    if (y < -0.2 && y > -0.3 && z > 0.1 && Math.abs(x) < 0.15) {
      // 口を開く変形：下方向に移動
      positionsArray[i * 3 + 1] = y - 0.05; // Y座標を下げる
      // 口の奥行きも少し調整
      positionsArray[i * 3 + 2] = z - 0.02; // Z座標を少し後ろに
    }
  }
  aaGeometry.attributes.position.name = "aa";

  // モーフターゲットを設定
  geometry.morphAttributes.position = [aaGeometry.attributes.position];
  geometry.morphTargetsRelative = false;
  */

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

  const faceMaterial = new THREE.MeshBasicMaterial({
    map: atlasTexture.clone(),
  });
  faceMaterial.name = "headFaceMaterial";
  faceMaterial.map!.offset.set(0, 0);

  const mouthMaterial = new THREE.MeshBasicMaterial({
    map: atlasTexture.clone(),
  });
  mouthMaterial.name = "headMouthMaterial";
  mouthMaterial.map!.offset.set(0, 0);

  const leftEyeMaterial = new THREE.MeshBasicMaterial({
    map: atlasTexture.clone(),
  });
  leftEyeMaterial.name = "headLeftEyeMaterial";
  leftEyeMaterial.map!.offset.set(0, 0);

  const rightEyeMaterial = new THREE.MeshBasicMaterial({
    map: atlasTexture.clone(),
  });
  rightEyeMaterial.name = "headRightEyeMaterial";
  rightEyeMaterial.map!.offset.set(0, 0);

  // 口部分のUV切り替え用情報を返す
  return {
    part: new Part(
      "head",
      geometry,
      [faceMaterial, mouthMaterial, leftEyeMaterial, rightEyeMaterial],
      new THREE.Vector3(0, 0.65, 0)
    ),
    bone,
    faceMaterial,
    mouthMaterial,
    leftEyeMaterial,
    rightEyeMaterial,
    geometry,
    mouthVertexIndices,
    uv,
  };
  function createFaceTextureAtlasCanvas() {
    const width = 256;
    const h = 256;
    const height = h * TextureKinds.length;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d")!;
    for (let i = 0; i < TextureKinds.length; i++) {
      const kind = TextureKinds[i];
      g.drawImage(createFaceTextureCanvas(kind), 0, i * h, width, h);
    }

    return canvas;
  }
}

function createBody() {
  const hipsBone = new THREE.Bone();
  hipsBone.name = "hips";
  hipsBone.position.set(0, -0.3, 0);
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
  neckBone.position.set(0, 0.1, 0);
  upperChestBone.add(neckBone);
  const neckBoneIdx = addBone(neckBone);

  // 胴体メッシュ
  const bodyHeight = 0.8;
  const bodyGeometry = createSphereCylinder({
    radiusTop: 0.15,
    radiusBottom: 0.25,
    height: bodyHeight,
    sphereTop: true,
    sphereBottom: true,
  });

  const bodyOffsetY = -0.5;
  // TODO: ルートなのでtranslateなしで配置するのめんどくさい
  bodyGeometry.translate(0, bodyOffsetY, 0);

  const vertexCount = bodyGeometry.attributes.position.count;
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const position = bodyGeometry.attributes.position;
  for (let i = 0; i < vertexCount; i++) {
    const y = position.getY(i);

    const edge0 = bodyOffsetY;
    const edge1 = bodyOffsetY + bodyHeight * 0.1;
    const edge2 = bodyOffsetY + bodyHeight * 0.4;
    const edge3 = bodyOffsetY + bodyHeight * 0.8;
    const edge4 = bodyOffsetY + bodyHeight;
    if (y < edge1) {
      skinIndices.push(hipsBoneIdx, spineBoneIdx, 0, 0);
      const weight = smoothstep(edge0, edge1, y);
      skinWeights.push(1 - weight, weight, 0, 0);
    } else if (y < edge2) {
      skinIndices.push(spineBoneIdx, chestBoneIdx, 0, 0);
      const weight = smoothstep(edge1, edge2, y);
      skinWeights.push(1 - weight, weight, 0, 0);
    } else if (y < edge3) {
      skinIndices.push(chestBoneIdx, upperChestBoneIdx, 0, 0);
      const weight = smoothstep(edge2, edge3, y);
      skinWeights.push(1 - weight, weight, 0, 0);
    } else {
      skinIndices.push(upperChestBoneIdx, neckBoneIdx, 0, 0);
      const weight = smoothstep(edge3, edge4, y);
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

  const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });

  return {
    part: new Part(
      "body",
      bodyGeometry,
      bodyMaterial,
      new THREE.Vector3(0, -0.05, 0)
    ),
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
const meshes: THREE.SkinnedMesh[] = [];
const model = body.part.build(meshes);
model.position.add(new THREE.Vector3(0, 1, 0));

console.log(model);

if (enableBone) {
  model.add(body.hipsBone);
  model.updateMatrixWorld(true);

  for (const m of meshes) {
    m.bind(skeleton);
  }
  scene.add(new THREE.SkeletonHelper(model));
}
scene.add(model);
scene.add(new THREE.GridHelper(10));

function createFaceTextureCanvas(kind: TextureKind) {
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
  g.strokeStyle = "black";

  if (kind === "aa") {
    g.fillStyle = "black";
    g.beginPath();
    g.ellipse(128, 190, 8, 12, 0, 0, Math.PI * 2);
    g.fill();
  } else if (kind === "ih") {
    g.beginPath();
    g.ellipse(128, 185, 8, 3, 0, 0, Math.PI * 2);
    g.fillStyle = "black";
    g.fill();
  } else if (kind === "ou") {
    g.beginPath();
    g.ellipse(128, 185, 12, 8, 0, 0, Math.PI * 2);
    g.fillStyle = "black";
    g.fill();
  } else if (kind === "ee") {
    g.beginPath();
    g.ellipse(128, 185, 12, 4, 0, 0, Math.PI * 2);
    g.fillStyle = "black";
    g.fill();
  } else if (kind === "oh") {
    g.beginPath();
    g.ellipse(128, 185, 8, 10, 0, 0, Math.PI * 2);
    g.fillStyle = "black";
    g.fill();
  } else {
    g.beginPath();
    g.moveTo(118, 185);
    g.lineTo(138, 185);
    g.stroke();
  }

  // 目
  drawEye(kind === "blinkLeft", g, 113, 146); // 左
  drawEye(kind === "blinkRight", g, 143, 146, true); // 右（反転）

  // 鼻
  g.strokeStyle = "black";
  g.beginPath();
  g.ellipse(128, 168, 5, 3, 0, 0, Math.PI);
  g.lineWidth = 2;
  g.stroke();

  return canvas;
}

function drawEye(
  blink: boolean,
  g: CanvasRenderingContext2D,
  x,
  y,
  flip = false
) {
  g.save();
  g.translate(x, y);
  if (flip) {
    g.scale(-1, 1);
  }

  if (blink) {
    g.strokeStyle = "black";
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(0, -5, 12, 9, 0, Math.PI * (30 / 180), Math.PI * (150 / 180));
    g.stroke();
  } else {
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
    g.ellipse(0, 0.2, 9, 6, 0, Math.PI * (185 / 180), Math.PI * (355 / 180));
    g.stroke();

    // 下まぶた
    g.beginPath();
    g.ellipse(0, -0.2, 9, 6, 0, Math.PI * (5 / 180), Math.PI * (175 / 180));
    g.stroke();
  }

  g.restore();
}

let clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const t = 2 * clock.elapsedTime;

  if (vrm != null) {
    vrm.update(delta);

    if (Math.abs(Math.sin(t * 0.5)) > 0.2) {
      vrm.expressionManager!.setValue("aa", 0);
    } else {
      vrm.expressionManager!.setValue("aa", 1);
    }

    if (Math.abs(Math.sin(t * 0.5 + 1)) > 0.2) {
      vrm.expressionManager!.setValue("blinkLeft", 0);
    } else {
      vrm.expressionManager!.setValue("blinkLeft", 1);
    }

    if (Math.abs(Math.sin(t * 0.5 + 2)) > 0.2) {
      vrm.expressionManager!.setValue("blinkRight", 0);
    } else {
      vrm.expressionManager!.setValue("blinkRight", 1);
    }
  }

  if (boneAnimation) {
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
  }

  controls.update();
  renderer.render(scene, camera);
}

const exporter = new GLTFExporter();

exporter.register((parser) => {
  let nodeCount = 0;
  const meshToNodeIndex = new Map<string, number>();
  let materialCount = 0;
  const materialToIndex = new Map<string, number>();

  return {
    writeNode: (obj, _node) => {
      if (obj instanceof THREE.Mesh) {
        meshToNodeIndex.set(obj.name, nodeCount);
      }
      nodeCount++;
    },
    writeMaterialAsync: async (material) => {
      materialToIndex.set(material.name, materialCount);
      materialCount++;
    },
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
            /*happy: {
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            angry: {
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            sad: {
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            relaxed: {
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            surprised: {
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              morphTargetBinds: [],
            },*/
            aa: {
              isBinary: true,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              /*morphTargetBinds: [
                {
                  node: meshToNodeIndex.get(head.part.name),
                  index: 0,
                  weight: 1,
                },
              ],*/
              textureTransformBinds: [
                {
                  material: materialToIndex.get(head.mouthMaterial.name),
                  offset: [
                    0,
                    TextureKindToIndex["aa"] * (1 / TextureKinds.length),
                  ],
                  scale: [1, 1],
                },
              ],
            },
            ih: {
              isBinary: true,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              textureTransformBinds: [
                {
                  material: materialToIndex.get(head.mouthMaterial.name),
                  offset: [
                    0,
                    TextureKindToIndex["ih"] * (1 / TextureKinds.length),
                  ],
                  scale: [1, 1],
                },
              ],
            },
            ou: {
              isBinary: true,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              textureTransformBinds: [
                {
                  material: materialToIndex.get(head.mouthMaterial.name),
                  offset: [
                    0,
                    TextureKindToIndex["ou"] * (1 / TextureKinds.length),
                  ],
                  scale: [1, 1],
                },
              ],
            },
            ee: {
              isBinary: true,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              textureTransformBinds: [
                {
                  material: materialToIndex.get(head.mouthMaterial.name),
                  offset: [
                    0,
                    TextureKindToIndex["ee"] * (1 / TextureKinds.length),
                  ],
                  scale: [1, 1],
                },
              ],
            },
            oh: {
              isBinary: true,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              textureTransformBinds: [
                {
                  material: materialToIndex.get(head.mouthMaterial.name),
                  offset: [
                    0,
                    TextureKindToIndex["oh"] * (1 / TextureKinds.length),
                  ],
                  scale: [1, 1],
                },
              ],
            },
            blink: {
              isBinary: true,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              textureTransformBinds: [
                {
                  material: materialToIndex.get(head.leftEyeMaterial.name),
                  offset: [
                    0,
                    TextureKindToIndex["blinkLeft"] * (1 / TextureKinds.length),
                  ],
                  scale: [1, 1],
                },
                {
                  material: materialToIndex.get(head.rightEyeMaterial.name),
                  offset: [
                    0,
                    TextureKindToIndex["blinkRight"] *
                      (1 / TextureKinds.length),
                  ],
                  scale: [1, 1],
                },
              ],
            },
            blinkLeft: {
              isBinary: true,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              textureTransformBinds: [
                {
                  material: materialToIndex.get(head.leftEyeMaterial.name),
                  offset: [
                    0,
                    TextureKindToIndex["blinkLeft"] * (1 / TextureKinds.length),
                  ],
                  scale: [1, 1],
                },
              ],
            },
            blinkRight: {
              isBinary: true,
              overrideBlink: "none",
              overrideLookAt: "none",
              overrideMouth: "none",
              textureTransformBinds: [
                {
                  material: materialToIndex.get(head.rightEyeMaterial.name),
                  offset: [
                    0,
                    TextureKindToIndex["blinkRight"] *
                      (1 / TextureKinds.length),
                  ],
                  scale: [1, 1],
                },
              ],
            },
            /*lookUp: {
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "block",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            lookDown: {
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "block",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            lookLeft: {
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "block",
              overrideMouth: "none",
              morphTargetBinds: [],
            },
            lookRight: {
              isBinary: false,
              overrideBlink: "none",
              overrideLookAt: "block",
              overrideMouth: "none",
              morphTargetBinds: [],
            },*/
          },
        },
      };
      console.log("afterParse:", JSON.parse(JSON.stringify(gltf)));
    },
  };
});

let vrm: VRM | null = null;

exporter.parse(
  model,
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
        vrm = gltf.userData.vrm as VRM;
        console.log(gltf);
        console.log(vrm);

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.combineMorphs(vrm);

        gltf.scene.position.x += 1;
        scene.add(gltf.scene);
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
