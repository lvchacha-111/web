// materials.js - 中央材质库
import * as THREE from 'three';

// 导出材质对象，供其他页面调用
export const pbrMaterials = {};
export const commonMaterials = {};

const textureLoader = new THREE.TextureLoader();

// ==========================================
// 1. 金属材质生成器 (统一标准)
// ==========================================
function createMetalMat(name, colorHex = null) {
    const mat = new THREE.MeshStandardMaterial({
        // 自动加载贴图
        map: textureLoader.load(`textures/${name}_2K-JPG_Color.jpg`),
        normalMap: textureLoader.load(`textures/${name}_2K-JPG_NormalGl.jpg`),
        roughnessMap: textureLoader.load(`textures/${name}_2K-JPG_Roughness.jpg`),
        
        // 统一的高级金属参数
        metalness: 1.0, 
        roughness: 2.5,       // 稍微有些磨砂感，质感更好
        envMapIntensity: 1.0,  // 环境反射强度
        toneMapped: true,      // 防止过曝
        side: THREE.DoubleSide
    });

    // 颜色空间校正
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;

    // 如果传入了颜色（例如黑钛），则染色
    if (colorHex) mat.color.setHex(colorHex);

    return mat;
}

// ==========================================
// 2. 初始化所有材质 (页面加载时调用)
// ==========================================
export function initMaterials() {
    // --- A. 金属库 ---
    pbrMaterials.metal011 = createMetalMat('Metal011'); // 不锈钢
    pbrMaterials.metal035 = createMetalMat('Metal035'); // 黄铜
    
    // 你可以在这里加新材质，比如黑钛：
    // pbrMaterials.blackMetal = createMetalMat('Metal011', 0x111111); 

    // --- B. 通用功能材质 (LED, Plate, Front) ---
    
    // 1. 强力 LED (发光)
    commonMaterials.led = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        emissive: 0xffffff, 
        emissiveIntensity: 3, // 默认亮度
        toneMapped: false     // 允许辉光
    });

    // 2. 亚克力 Plate (透光不刺眼)
    commonMaterials.plate = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,         
        roughness: 1.0,          
        metalness: 0.0,          
        envMapIntensity: 0.0,    
        transparent: false,      
        opacity: 1.0,            
        emissive: 0xffffff,      
        emissiveIntensity: 0.1,  // 默认微弱透光
        toneMapped: true,
        side: THREE.DoubleSide   
    });

    // 3. 前壳 Front (可改漆色)
    commonMaterials.front = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.6, 
        metalness: 0.1, 
        envMapIntensity: 0.5,
        toneMapped: true
    });

    // 4. 固定件 Fixed (灰色哑光)
    commonMaterials.fixed = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.8,
        metalness: 0.0,
        envMapIntensity: 0
    });
}