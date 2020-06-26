import '../css/style.styl'
import 'reset-css'
import 'regenerator-runtime/runtime'

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { NodePass } from 'three/examples/jsm/nodes/postprocessing/NodePass.js';
import * as Nodes from 'three/examples/jsm/nodes/Nodes.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import dat from 'three/examples/jsm/libs/dat.gui.module.js';


window.onload = ()=>{
  const app = new App();
  app.init();
}


class App{
  constructor(){
    this.bloomParams = {
      exposure: 0.88,
      bloomThreshold: 0.51,
      bloomStrength: 0.94,
      bloomRadius: 0.41
    }
  
    this.lightParams = {
      envIntensity: 1,
      directionalIntensity: 1
    }
    
    this.renderInfo = {
      programs: 0,
      geometries: 0,
      textures: 0,
      drawcalls: 0,
      lines: 0,
      points: 0,
      triangles: 0, 
    }
    
    this.colorParams = {
      hue: 0,
      saturation: 0.6,
      vibrance: 0.29,
      brightness: 0,
      contrast: 1,
    }

    this.skymapPath = '../assets/Alexs_Apt_Env.hdr'
    this.modelPath = '../assets/wolf_head_statuine/scene.gltf'
    this.camPos = new THREE.Vector3(-38, 39, -61)
    this.camTarget = new THREE.Vector3(0, 10, 0)
    this.modelMeshes = [];
  }

  async init(){ 
    // setup renderer
    this.renderer = new THREE.WebGLRenderer( { antialias: true } );
    this.renderer.setPixelRatio( window.devicePixelRatio );
    this.renderer.setSize( window.innerWidth, window.innerHeight );
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure =  Math.pow( this.bloomParams.exposure, 4.0 );
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    document.body.appendChild( this.renderer.domElement );


    // create camera
    this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth/window.innerHeight, 0.25, 3000);
    this.camera.position.set(this.camPos.x, this.camPos.y, this.camPos.z);

    // create scene
    this.scene = new THREE.Scene();

    
    // set up scene objects (wait loading assets before starting rendering)
    await this.initScene();

    this.setupRenderPass();

    // gui, controls, devtool, etc...
    this.initUtils();
    
    // execute render loop
    this.render();

    window.addEventListener( 'resize', this.onWindowResize.bind(this), false );
  }

  onWindowResize(){
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize( window.innerWidth, window.innerHeight );
    this.composer.setSize( window.innerWidth, window.innerHeight );
  }

  render(){
    const loop = ()=>{
      requestAnimationFrame( loop );
      const delta = this.clock.getDelta();
      this.updateDebugInfo();
      this.nodeFrame.update(delta).updateNode(this.nodepass.material);
      this.composer.render();
    }
    loop();
  }

  async initScene(){
    // scene params
    const shadowBias = -0.002;

    // load environment map
    const envData = await this.loadRGBE(THREE.UnsignedByteType, this.skymapPath);
    const pmremGenerator = new THREE.PMREMGenerator( this.renderer );
    pmremGenerator.compileEquirectangularShader();

    const envMap = pmremGenerator.fromEquirectangular(envData).texture;
    this.scene.background = envMap;
    this.scene.environment = envMap;

    envData.dispose();
    pmremGenerator.dispose();

    // roughnessMipmapper.dispose();
    await this.loadModel(this.modelPath);

    // put directional light
    this.dirLight = new THREE.DirectionalLight( 0xffffff, this.lightParams.directionalIntensity );
    this.dirLight.name = 'Dir. Light';
    this.dirLight.position.set( -150, 500, 300 );
    this.dirLight.castShadow = true;
    this.dirLight.shadow.camera.near = 1;
    this.dirLight.shadow.camera.far = 1000;
    this.dirLight.shadow.camera.right = 250;
    this.dirLight.shadow.camera.left = -250;
    this.dirLight.shadow.camera.top	= 250;
    this.dirLight.shadow.camera.bottom = -250;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.bias = shadowBias;
    this.scene.add( this.dirLight );

    // helper for debug
    // this.scene.add( new THREE.CameraHelper( dirLight.shadow.camera ) );
  }

  setupRenderPass(){
    // composer
    this.composer = new EffectComposer(this.renderer);

    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // bloom
    this.bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 );
    this.bloomPass.threshold = this.bloomParams.bloomThreshold;
    this.bloomPass.strength = this.bloomParams.bloomStrength;
    this.bloomPass.radius = this.bloomParams.bloomRadius;
    this.composer.addPass(this.bloomPass);

    // SMAAA
    this.smaaPass = new SMAAPass(window.innerWidth * this.renderer.getPixelRatio(), window.innerHeight * this.renderer.getPixelRatio());
    this.composer.addPass(this.smaaPass);

    // ColorCorrection
    this.nodeFrame = new Nodes.NodeFrame();
    this.nodepass = new NodePass();
    this.composer.addPass( this.nodepass );
  }

  initUtils(){
    // clock
    this.clock = new THREE.Clock();

    // control
    this.controls = new OrbitControls( this.camera, this.renderer.domElement );
    this.controls.minDistance = 2;
    this.controls.maxDistance = 5000;
    this.controls.target.set( this.camTarget.x, this.camTarget.y, this.camTarget.z );

    // stats
    this.stats = new Stats();
    document.body.appendChild( this.stats.dom );
    
    // gui
    this.gui = new dat.GUI();

    const guiGroupPerformance = this.gui.addFolder("performance")
    guiGroupPerformance.add(this.renderInfo, 'programs').listen();
    guiGroupPerformance.add(this.renderInfo, 'geometries').listen();
    guiGroupPerformance.add(this.renderInfo, 'textures').listen();
    guiGroupPerformance.add(this.renderInfo, 'drawcalls').listen();
    guiGroupPerformance.add(this.renderInfo, 'lines').listen();
    guiGroupPerformance.add(this.renderInfo, 'points').listen();
    guiGroupPerformance.add(this.renderInfo, 'triangles').listen();
    // guiGroupPerformance.open();

    const guiGroupBloom = this.gui.addFolder("Bloom");
    guiGroupBloom.add( this.bloomParams, 'exposure', 0.1, 2 ).onChange((value)=>{
      this.renderer.toneMappingExposure = Math.pow( value, 4.0 );
    });
    guiGroupBloom.add( this.bloomParams, 'bloomThreshold', 0.0, 1.0 ).onChange((value)=>{
      this.bloomPass.threshold = Number( value );
    });
    guiGroupBloom.add( this.bloomParams, 'bloomStrength', 0.0, 3.0 ).onChange((value)=>{
      this.bloomPass.strength = Number( value );
    });
    guiGroupBloom.add( this.bloomParams, 'bloomRadius', 0.0, 1.0 ).step( 0.01 ).onChange((value)=>{
      this.bloomPass.radius = Number( value );
    });

    const guiGropuColorCorrection = this.gui.addFolder("Color Correction");
    const screen = new Nodes.ScreenNode();

    const hue = new Nodes.FloatNode(this.colorParams.hue);
    const saturation = new Nodes.FloatNode(this.colorParams.saturation);
    const vibrance = new Nodes.FloatNode(this.colorParams.vibrance);
    const brightness = new Nodes.FloatNode(this.colorParams.brightness);
    const contrast = new Nodes.FloatNode(this.colorParams.contrast);

    const hueNode = new Nodes.ColorAdjustmentNode( screen, hue, Nodes.ColorAdjustmentNode.HUE );
    const satNode = new Nodes.ColorAdjustmentNode( hueNode, saturation, Nodes.ColorAdjustmentNode.SATURATION );
    const vibranceNode = new Nodes.ColorAdjustmentNode( satNode, vibrance, Nodes.ColorAdjustmentNode.VIBRANCE );
    const brightnessNode = new Nodes.ColorAdjustmentNode( vibranceNode, brightness, Nodes.ColorAdjustmentNode.BRIGHTNESS );
    const contrastNode = new Nodes.ColorAdjustmentNode( brightnessNode, contrast, Nodes.ColorAdjustmentNode.CONTRAST );

    this.nodepass.input = contrastNode;

    // GUI
    guiGropuColorCorrection.add( this.colorParams, 'hue', 0, 1).step(0.01).onChange((val)=>{
      hue.value = val * Math.PI * 2;
    });
    guiGropuColorCorrection.add( this.colorParams, 'saturation', 0, 2).step(0.01).onChange((val)=>{
      saturation.value = val;;
    });
    guiGropuColorCorrection.add( this.colorParams, 'vibrance', -1, 1).step(0.01).onChange((val)=>{
      vibrance.value = val;;
    });
    guiGropuColorCorrection.add( this.colorParams, 'brightness', 0, 0.5).step(0.01).onChange((val)=>{
      brightness.value = val;;
    });
    guiGropuColorCorrection.add( this.colorParams, 'contrast', 0, 2).step(0.01).onChange((val)=>{
      contrast.value = val;;
    });
  
    const guiGroupLighting = this.gui.addFolder("Lighting");
    guiGroupLighting.add(this.lightParams, 'envIntensity', 0.0, 1.0).onChange((value)=>{
      this.modelMeshes.forEach((mesh)=>{
        mesh.material.envMapIntensity = value;
      })
    });
    guiGroupLighting.add(this.lightParams, 'directionalIntensity', 0.0, 1.0).onChange((value)=>{
      this.dirLight.intensity = value;
    });
    
    // dev tools
    // Observe a scene or a renderer
    if (typeof __THREE_DEVTOOLS__ !== 'undefined') {
      __THREE_DEVTOOLS__.dispatchEvent(new CustomEvent('observe', { detail: this.scene }));
      __THREE_DEVTOOLS__.dispatchEvent(new CustomEvent('observe', { detail: this.renderer }));
    }
  }

  updateDebugInfo(){
    // orbit control
    this.controls.update();

    // stats
    this.stats.update();
    // performance metric
    this.renderInfo.programs = this.renderer.info.programs.length;
    this.renderInfo.geometries = this.renderer.info.memory.geometries;
    this.renderInfo.textures = this.renderer.info.memory.textures;
    this.renderInfo.drawcalls = this.renderer.info.render.calls;
    this.renderInfo.lines = this.renderer.info.render.lines;
    this.renderInfo.points = this.renderer.info.render.points;
    this.renderInfo.triangles = this.renderer.info.render.triangles;

    this.renderer.info.reset();
  }

  async loadRGBE(dataType, filePath){
    return new Promise((resolve, reject)=>{
      new RGBELoader()
        .setDataType(dataType)
        .load(filePath, // onSuccess
          (texture)=>{
            resolve(texture);
          }, 
          null,         // onProgress
          (error)=>{    // onError
            reject(error);
          });
    });
  }

  async loadGLTF(filePath){
    console.log(filePath)
    return new Promise((resolve, reject)=>{
      new GLTFLoader()
        .load(filePath, // onScucess
          (gltf)=>{
            resolve(gltf);
          }, 
          null,         // onProgress
          (error)=>{    // onError
            reject(error);
          });
    });
  }

  async loadModel(modelPath){
  
    const model = await this.loadGLTF(modelPath);
    model.scene.traverse((child)=>{ 
      if(child.isMesh){
        this.modelMeshes.push(child);

        // enable shadow
        child.castShadow = true;
        child.receiveShadow = true;

        // set envmap intensity all meshes
        child.material.envMapIntensity = this.lightParams.envIntensity;
      }
    });
      
    this.scene.add(model.scene);
  }

  
}

