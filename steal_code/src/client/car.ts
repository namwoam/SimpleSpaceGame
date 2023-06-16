import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import Physics from './physics'
import Player from './player'
import { Socket } from 'socket.io-client'
import Moon from './moon'
import Earth from './earth'
import {
    Lensflare,
    LensflareElement,
} from 'three/examples/jsm/objects/Lensflare.js'

export enum upgrades {
    DASH, JUMP, SPEED, BULLET_COUNT, BULLET_SPEED
}

export default class Car {
    earth: null | Earth = null
    //private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private physics: Physics
    private socket: Socket
    dash_level = 0
    jump_level = 0
    speed_level = 0
    bullet_count_level = 0
    bullet_speed_level = 0
    limit_bullet_count = 3
    frameMesh = new THREE.Mesh()
    turretMesh = new THREE.Mesh()
    private turretPivot = new THREE.Object3D()
    //private targetQuatTurret = new THREE.Quaternion()
    wheelLFMesh = new THREE.Group()
    wheelRFMesh = new THREE.Group()
    wheelLBMesh = new THREE.Group()
    wheelRBMesh = new THREE.Group()

    private tmpVec = new THREE.Vector3()
    private tmpQuat = new THREE.Quaternion()
    private camPos = new THREE.Vector3()
    private camQuat = new THREE.Quaternion()
    chaseCamPivot = new THREE.Object3D()
    chaseCam = new THREE.Object3D()

    frameBody: CANNON.Body
    private turretBody: CANNON.Body
    wheelLFBody: CANNON.Body
    wheelRFBody: CANNON.Body
    wheelLBBody: CANNON.Body
    wheelRBBody: CANNON.Body
    private constraintLF: CANNON.HingeConstraint
    private constraintRF: CANNON.HingeConstraint
    private constraintLB: CANNON.HingeConstraint
    private constraintRB: CANNON.HingeConstraint
    private self_scene: THREE.Scene
    bulletMesh: Array<THREE.Mesh> = []
    private bulletBody: CANNON.Body[] = []
    lastBulletCounter: Array<number> = [] //used to decide if a bullet should instantly be repositioned or smoothly lerped
    private bulletActivated: Array<boolean> = []
    private bulletId = -1
    display_upgrade_hint = false

    thrusting = false
    steering = false
    forwardVelocity = 0
    rightVelocity = 0

    enabled = true

    private score: number = 0
    private past_upgrade: number = 0

    private players: { [id: string]: Player }
    private moons: { [id: string]: Moon }

    private upsideDownCounter = -1
    private dash_ready = false
    private listener: THREE.AudioListener
    carSound: THREE.PositionalAudio
    private shootSound: THREE.PositionalAudio

    cameraTempPosition: THREE.Object3D

    private lensflares: Array<Lensflare> = []
    //debugMesh: THREE.Mesh
    private bulletCount = 20
    colorcode = 0xffffff
    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        physics: Physics,
        players: { [id: string]: Player },
        moons: { [id: string]: Moon },
        socket: Socket,
        listener: THREE.AudioListener
    ) {
        this.self_scene = scene
        this.camera = camera
        this.physics = physics
        this.players = players
        this.moons = moons
        this.socket = socket
        this.listener = listener

        // this.debugMesh = new THREE.Mesh(
        //     new THREE.SphereGeometry(.5),
        //     new THREE.MeshNormalMaterial()
        // )
        // scene.add(this.debugMesh)

        this.cameraTempPosition = new THREE.Object3D()
        scene.add(this.cameraTempPosition)

        const audioLoader = new THREE.AudioLoader()
        const carSound = new THREE.PositionalAudio(this.listener)
        audioLoader.load('sounds/engine.wav', (buffer) => {
            carSound.setBuffer(buffer)
            carSound.setVolume(0.5)
        })
        this.carSound = carSound

        const shootSound = new THREE.PositionalAudio(this.listener)
        audioLoader.load('sounds/rocket.ogg', (buffer) => {
            shootSound.setBuffer(buffer)
            shootSound.setVolume(2)
        })
        this.shootSound = shootSound

        const pipesMaterial = new THREE.MeshStandardMaterial()
        pipesMaterial.color = new THREE.Color('#ffffff')
        pipesMaterial.refractionRatio = 0
        pipesMaterial.roughness = 0.2
        pipesMaterial.metalness = 1

        const flareTexture = new THREE.TextureLoader().load('img/lensflare0.png')

        this.bulletMesh = []
        this.lastBulletCounter = []
        this.lensflares = []
        this.bulletActivated = []
        for (let i = 0; i < this.bulletCount; i++) {
            this.bulletMesh.push(new THREE.Mesh())
            this.lastBulletCounter.push(-1)
            this.lensflares.push(new Lensflare())
            this.bulletActivated.push(false)
        }
        this.lensflares.forEach((l) => {
            l.addElement(
                new LensflareElement(
                    flareTexture,
                    200,
                    0,
                    new THREE.Color(this.colorcode)
                )
            )
        })
        //bullets
        for (let i = 0; i < this.bulletCount; i++) {
            this.bulletMesh[i].geometry = new THREE.SphereGeometry(
                0.3,
                2,
                2
            )
            this.bulletMesh[i].material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                wireframe: true,
            })
            this.bulletMesh[i].castShadow = true
            scene.add(this.bulletMesh[i])
            this.bulletMesh[i].add(this.lensflares[i])
        }

        const loader = new GLTFLoader()
        loader.load(
            'models/frame.glb',
            (gltf) => {
                this.frameMesh = gltf.scene.children[0] as THREE.Mesh
                this.frameMesh.material = pipesMaterial
                this.frameMesh.castShadow = true
                scene.add(this.frameMesh)
                this.carSound.loop = true
                this.frameMesh.add(this.carSound)
                this.frameMesh.add(this.shootSound)

                this.turretPivot = new THREE.Object3D()
                this.turretPivot.position.y = 1.0
                this.turretPivot.position.z = 0.5
                this.frameMesh.add(this.turretPivot)

                const turretGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1.5)
                turretGeometry.rotateX(Math.PI / 2)
                turretGeometry.translate(0, 0, -0.5)
                this.turretMesh = new THREE.Mesh(turretGeometry, pipesMaterial)
                this.turretMesh.castShadow = true
                scene.add(this.turretMesh)

                this.chaseCam.position.set(0, 1.5, 250)
                this.chaseCamPivot.add(this.chaseCam)
                this.frameMesh.add(this.chaseCamPivot)

                loader.load(
                    'models/tyre.glb',
                    (gltf) => {
                        this.wheelLFMesh = gltf.scene
                        this.wheelLFMesh.children[0].castShadow = true
                        this.wheelRFMesh = this.wheelLFMesh.clone()
                        this.wheelLBMesh = this.wheelLFMesh.clone()
                        this.wheelRBMesh = this.wheelLFMesh.clone()
                        this.wheelLFMesh.scale.setScalar(0.87)
                        this.wheelRFMesh.scale.setScalar(0.87)
                        scene.add(this.wheelLFMesh)
                        scene.add(this.wheelRFMesh)
                        scene.add(this.wheelLBMesh)
                        scene.add(this.wheelRBMesh)
                    },
                    (xhr) => {
                        console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
                    },
                    (error) => {
                        console.log(error)
                    }
                )
            },
            (xhr) => {
                console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
            },
            (error) => {
                console.log(error)
            }
        )
        this.frameBody = new CANNON.Body({ mass: 0.1 })
        this.frameBody.addShape(
            new CANNON.Sphere(0.1),
            new CANNON.Vec3(0, 0.8, 0.4)
        )
        this.frameBody.addShape(
            new CANNON.Sphere(0.1),
            new CANNON.Vec3(0, -0.1, -1.3)
        )
        this.frameBody.addShape(
            new CANNON.Sphere(0.1),
            new CANNON.Vec3(0, -0.1, 1.3)
        )
        this.frameBody.addShape(new CANNON.Sphere(0.1), new CANNON.Vec3(1, -0.1, 0))
        this.frameBody.addShape(
            new CANNON.Sphere(0.1),
            new CANNON.Vec3(-1, -0.1, 0)
        )
        this.frameBody.position.set(0, 0, 0)
        //this.physics.world.addBody(this.frameBody)

        this.turretBody = new CANNON.Body({ mass: 0 })
        this.turretBody.addShape(
            new CANNON.Sphere(0.2),
            new CANNON.Vec3(0, 0, -1.0)
        )
        this.turretBody.position.set(0, 1, 0)
        //this.physics.world.addBody(this.turretBody)

        const wheelLFShape = new CANNON.Sphere(0.35)
        this.wheelLFBody = new CANNON.Body({
            mass: 1,
            material: this.physics.wheelMaterial,
        })
        this.wheelLFBody.addShape(wheelLFShape)
        this.wheelLFBody.position.set(-1, 0, -1)
        //this.physics.world.addBody(this.wheelLFBody)

        const wheelRFShape = new CANNON.Sphere(0.35)
        this.wheelRFBody = new CANNON.Body({
            mass: 1,
            material: this.physics.wheelMaterial,
        })
        this.wheelRFBody.addShape(wheelRFShape)
        this.wheelRFBody.position.set(1, 0, -1)
        //this.physics.world.addBody(this.wheelRFBody)

        const wheelLBShape = new CANNON.Sphere(0.4)
        this.wheelLBBody = new CANNON.Body({
            mass: 1,
            material: this.physics.wheelMaterial,
        })
        this.wheelLBBody.addShape(wheelLBShape)
        this.wheelLBBody.position.set(-1, 0, 1)
        //this.physics.world.addBody(this.wheelLBBody)

        const wheelRBShape = new CANNON.Sphere(0.4)
        this.wheelRBBody = new CANNON.Body({
            mass: 1,
            material: this.physics.wheelMaterial,
        })
        this.wheelRBBody.addShape(wheelRBShape)
        this.wheelRBBody.position.set(1, 0, 1)
        //this.physics.world.addBody(this.wheelRBBody)

        const leftFrontAxis = new CANNON.Vec3(1, 0, 0)
        const rightFrontAxis = new CANNON.Vec3(1, 0, 0)
        const leftBackAxis = new CANNON.Vec3(1, 0, 0)
        const rightBackAxis = new CANNON.Vec3(1, 0, 0)

        this.constraintLF = new CANNON.HingeConstraint(
            this.frameBody,
            this.wheelLFBody,
            {
                pivotA: new CANNON.Vec3(-1, 0, -1),
                axisA: leftFrontAxis,
                maxForce: 0.66,
            }
        )
        this.physics.world.addConstraint(this.constraintLF)
        this.constraintRF = new CANNON.HingeConstraint(
            this.frameBody,
            this.wheelRFBody,
            {
                pivotA: new CANNON.Vec3(1, 0, -1),
                axisA: rightFrontAxis,
                maxForce: 0.66,
            }
        )
        this.physics.world.addConstraint(this.constraintRF)
        this.constraintLB = new CANNON.HingeConstraint(
            this.frameBody,
            this.wheelLBBody,
            {
                pivotA: new CANNON.Vec3(-1, 0, 1),
                axisA: leftBackAxis,
                maxForce: 0.66,
            }
        )
        this.physics.world.addConstraint(this.constraintLB)
        this.constraintRB = new CANNON.HingeConstraint(
            this.frameBody,
            this.wheelRBBody,
            {
                pivotA: new CANNON.Vec3(1, 0, 1),
                axisA: rightBackAxis,
                maxForce: 0.66,
            }
        )
        this.physics.world.addConstraint(this.constraintRB)

        // //rear wheel drive
        this.constraintLB.enableMotor()
        this.constraintRB.enableMotor()

        //add bullets
        for (let i = 0; i < this.bulletCount; i++) {
            this.bulletBody[i] = new CANNON.Body({ mass: 1 }) //, material: wheelMaterial })
            this.bulletBody[i].addShape(new CANNON.Sphere(0.15))
            this.bulletBody[i].position.set(i - 1, 1, -1)
            //this.physics.world.addBody(this.bulletBody[i])

            this.bulletBody[i].addEventListener('collide', (e: any) => {
                if (this.bulletActivated[i]) {
                    let contactBody: CANNON.Body
                    let contactPoint: CANNON.Vec3
                    if (this.bulletBody[i].id === e.contact.bi.id) {
                        contactBody = e.contact.bj
                        contactPoint = e.contact.rj
                    } else if (this.bulletBody[i].id === e.contact.bj.id) {
                        contactBody = e.contact.bi
                        contactPoint = e.contact.ri
                    }

                    Object.keys(this.players).forEach((p) => {
                        if (this.players[p].enabled) {
                            if (this.players[p].partIds.includes(contactBody.id)) {
                                console.log('bullet hit a car')
                                this.bulletActivated[i] = false

                                //this.score += 100  // score is awarded server side

                                const pointOfImpact = (
                                    contactBody.position as CANNON.Vec3
                                ).vadd(contactPoint)
                                const v = contactBody.position.vsub(pointOfImpact)

                                if (this.players[p].enabled) {
                                    this.socket.emit(
                                        'hitCar',
                                        p,
                                        this.bulletMesh[i].position,
                                        v
                                    )
                                    this.players[p].enabled = false
                                }
                            }
                        } else {
                            // console.log(
                            //     'player ' + this.players[p] + ' not enabled'
                            // )
                        }
                    })

                    Object.keys(this.moons).forEach((m) => {
                        if (this.moons[m].enabled) {
                            if (contactBody.id === this.moons[m].body.id) {
                                console.log('bullet hit a moon')
                                this.bulletActivated[i] = false

                                //this.score += 10 // points awarded server side

                                const pointOfImpact = (
                                    contactBody.position as CANNON.Vec3
                                ).vadd(contactPoint)

                                const v = contactBody.position.vsub(pointOfImpact)

                                this.socket.emit(
                                    'hitMoon',
                                    m,
                                    this.bulletMesh[i].position,
                                    v
                                )
                            }
                        }
                    })
                }
            })
        }

        setInterval(() => {
            if (this.enabled) {
                if (this.isUpsideDown()) {
                    this.upsideDownCounter += 1
                    if (this.upsideDownCounter > 3) {
                        const liftedPos = (this.earth as Earth).getSpawnPosition(
                            this.frameMesh.position
                        )
                        this.spawn(liftedPos)
                        console.log('flipped car')
                    }
                    console.log('car is upside down')
                } else {
                    this.upsideDownCounter = 0
                }
            }
        }, 1000)
    }
    rebuldFlare() {
        console.log("rebuild flare")
        const flareTexture = new THREE.TextureLoader().load('img/lensflare0.png')
        this.lensflares = []
        for (let i = 0; i < this.bulletCount; i++) {
            this.bulletMesh[i].remove(this.bulletMesh[i].children[0])
            this.lensflares.push(new Lensflare())
        }
        console.log(this.lensflares)
        this.lensflares.forEach((l) => {
            l.addElement(
                new LensflareElement(
                    flareTexture,
                    200,
                    0,
                    new THREE.Color(this.colorcode)
                )
            )
        })
        //bullets
        for (let i = 0; i < this.bulletCount; i++) {
            this.bulletMesh[i].add(this.lensflares[i])
        }
    }
    dash() {
        console.log("request dash")
        if (this.dash_ready === false) {
            return
        }
        console.log("dashing")
        this.dash_ready = false
        this.forwardVelocity = 400.0 + 120*this.dash_level
        setTimeout(() => { this.forwardVelocity = 10.0 }, 300)
        setTimeout(() => { this.dash_ready = true }, 1000*(3-this.dash_level*0.6))
    }
    updateScore(s: number) {
        this.score = s
        this.askUpgrade()
    }
    askUpgrade() {
        let flag = false
        if (this.past_upgrade == 0 && this.score > 100) {
            flag = true
        }
        else if (this.past_upgrade == 1 && this.score > 300) {
            flag = true
        }
        else if (this.past_upgrade == 2 && this.score > 500) {
            flag = true
        }
        this.display_upgrade_hint = flag
    }
    getNextBulletId(): number {
        this.bulletId += 1
        if (this.bulletId > this.limit_bullet_count - 1) {
            this.bulletId = 0
        }
        this.lastBulletCounter[this.bulletId] += 1

        return this.bulletId
    }
    upgrade(target: upgrades) {
        this.past_upgrade += 1
        if (target === upgrades.DASH) {
            this.dash_level += 1
            this.dash_ready = true
        }
        else if (target === upgrades.JUMP) {
            this.jump_level += 1
        }
        else if (target === upgrades.SPEED) {
            this.speed_level += 1
        }
        else if (target === upgrades.BULLET_COUNT) {
            this.bullet_count_level += 1
            if (this.bullet_count_level == 0) {
                this.limit_bullet_count = 3
            }
            else if (this.bullet_count_level == 1) {
                this.limit_bullet_count = 8
            }
            else if (this.bullet_count_level == 2) {
                this.limit_bullet_count = 14
            }
            else if (this.bullet_count_level == 1) {
                this.limit_bullet_count = 20
            }
        }
        else if (target === upgrades.BULLET_SPEED) {
            this.bullet_speed_level += 1
        }

    }

    shoot() {
        if (this.enabled) {
            const bulletId = this.getNextBulletId()
            this.bulletActivated[bulletId] = true
            this.bulletBody[bulletId].velocity.set(0, 0, 0)
            this.bulletBody[bulletId].angularVelocity.set(0, 0, 0)
            let v = new THREE.Vector3(0, 0, -1)
            const q = new THREE.Quaternion()
                .set(
                    this.turretBody.quaternion.x,
                    this.turretBody.quaternion.y,
                    this.turretBody.quaternion.z,
                    this.turretBody.quaternion.w
                )
                .normalize()
            v.applyQuaternion(q)
            v.multiplyScalar(1.5)
            v.add(
                new THREE.Vector3(
                    this.turretBody.position.x,
                    this.turretBody.position.y,
                    this.turretBody.position.z
                )
            )

            this.bulletBody[bulletId].position.set(v.x, v.y, v.z)
            //console.log(this.cars[id].bullet.position)
            v = new THREE.Vector3(0, 0, -1)
            v.applyQuaternion(q)
            v.multiplyScalar(40 + this.bullet_speed_level * 20)
            this.bulletBody[bulletId].velocity.set(v.x, v.y, v.z)
            this.bulletBody[bulletId].wakeUp()

            if (this.shootSound.isPlaying) {
                this.shootSound.stop()
            }
            this.shootSound.play()
        }
    }

    isUpsideDown() {
        const bodyUp = new THREE.Vector3()
        bodyUp.copy(this.frameMesh.up).applyQuaternion(this.frameMesh.quaternion)
        const down = this.frameMesh.position.clone().negate().normalize()
        //console.log(down.dot(bodyUp))
        if (down.dot(bodyUp) > 0) {
            return true
        } else {
            return false
        }
    }

    spawn(startPosition: THREE.Vector3) {
        console.log('Spawn Car')
        //console.log(startPosition)

        //this.debugMesh.position.copy(startPosition)
        this.frameMesh.add(this.chaseCamPivot)

        this.enabled = false
        for (let i = 0; i < 3; i++) {
            this.physics.world.removeBody(this.bulletBody[i])
        }
        this.physics.world.removeBody(this.frameBody)
        this.physics.world.removeBody(this.turretBody)
        this.physics.world.removeBody(this.wheelLFBody)
        this.physics.world.removeBody(this.wheelRFBody)
        this.physics.world.removeBody(this.wheelLBBody)
        this.physics.world.removeBody(this.wheelRBBody)

        const o = new THREE.Object3D()
        o.position.copy(startPosition)
        o.lookAt(new THREE.Vector3())
        o.rotateX(-Math.PI / 2)

        const q = new CANNON.Quaternion().set(
            o.quaternion.x,
            o.quaternion.y,
            o.quaternion.z,
            o.quaternion.w
        )

        this.forwardVelocity = 0
        this.rightVelocity = 0

        this.frameBody.velocity.set(0, 0, 0)
        this.frameBody.angularVelocity.set(0, 0, 0)
        this.frameBody.position.set(
            startPosition.x,
            startPosition.y,
            startPosition.z
        )
        this.frameBody.quaternion.copy(q)

        this.turretBody.velocity.set(0, 0, 0)
        this.turretBody.angularVelocity.set(0, 0, 0)
        this.turretBody.position.set(
            startPosition.x,
            startPosition.y + 1,
            startPosition.z
        )
        this.turretBody.quaternion.copy(q)

        this.wheelLFBody.velocity.set(0, 0, 0)
        this.wheelLFBody.angularVelocity.set(0, 0, 0)
        this.wheelLFBody.position.set(
            startPosition.x - 1,
            startPosition.y,
            startPosition.z - 1
        )
        this.wheelLFBody.quaternion.copy(q)

        this.wheelRFBody.velocity.set(0, 0, 0)
        this.wheelRFBody.angularVelocity.set(0, 0, 0)
        this.wheelRFBody.position.set(
            startPosition.x + 1,
            startPosition.y,
            startPosition.z - 1
        )
        this.wheelRFBody.quaternion.copy(q)

        this.wheelLBBody.velocity.set(0, 0, 0)
        this.wheelLBBody.angularVelocity.set(0, 0, 0)
        this.wheelLBBody.position.set(
            startPosition.x - 1,
            startPosition.y,
            startPosition.z + 1
        )
        this.wheelLBBody.quaternion.copy(q)

        this.wheelRBBody.velocity.set(0, 0, 0)
        this.wheelRBBody.angularVelocity.set(0, 0, 0)
        this.wheelRBBody.position.set(
            startPosition.x + 1,
            startPosition.y,
            startPosition.z + 1
        )
        this.wheelRBBody.quaternion.copy(q)

        setTimeout(() => {
            this.physics.world.addBody(this.frameBody)
            this.physics.world.addBody(this.turretBody)
            this.physics.world.addBody(this.wheelLFBody)
            this.physics.world.addBody(this.wheelRFBody)
            this.physics.world.addBody(this.wheelLBBody)
            this.physics.world.addBody(this.wheelRBBody)
            for (let i = 0; i < this.bulletCount; i++) {
                this.physics.world.addBody(this.bulletBody[i])
            }
            this.enabled = true

            this.socket.emit('enable')
        }, 500)
    }

    update() {
        this.chaseCam.getWorldPosition(this.camPos)
        this.camera.position.lerpVectors(this.camera.position, this.camPos, 0.1)

        this.chaseCam.getWorldQuaternion(this.camQuat)
        this.camera.quaternion.slerp(this.camQuat, 0.1)

        this.frameMesh.position.x = this.frameBody.position.x
        this.frameMesh.position.y = this.frameBody.position.y
        this.frameMesh.position.z = this.frameBody.position.z
        this.frameMesh.quaternion.x = this.frameBody.quaternion.x
        this.frameMesh.quaternion.y = this.frameBody.quaternion.y
        this.frameMesh.quaternion.z = this.frameBody.quaternion.z
        this.frameMesh.quaternion.w = this.frameBody.quaternion.w

        this.turretPivot.getWorldPosition(this.tmpVec)
        this.turretMesh.position.copy(this.tmpVec)
        this.turretMesh.quaternion.slerp(this.camQuat, 0.05)

        this.turretBody.position.set(
            this.turretMesh.position.x,
            this.turretMesh.position.y,
            this.turretMesh.position.z
        )
        this.turretBody.quaternion.set(
            this.turretMesh.quaternion.x,
            this.turretMesh.quaternion.y,
            this.turretMesh.quaternion.z,
            this.turretMesh.quaternion.w
        )

        this.wheelLFMesh.position.x = this.wheelLFBody.position.x
        this.wheelLFMesh.position.y = this.wheelLFBody.position.y
        this.wheelLFMesh.position.z = this.wheelLFBody.position.z
        this.wheelLFMesh.quaternion.x = this.wheelLFBody.quaternion.x
        this.wheelLFMesh.quaternion.y = this.wheelLFBody.quaternion.y
        this.wheelLFMesh.quaternion.z = this.wheelLFBody.quaternion.z
        this.wheelLFMesh.quaternion.w = this.wheelLFBody.quaternion.w

        this.wheelRFMesh.position.x = this.wheelRFBody.position.x
        this.wheelRFMesh.position.y = this.wheelRFBody.position.y
        this.wheelRFMesh.position.z = this.wheelRFBody.position.z
        this.wheelRFMesh.quaternion.x = this.wheelRFBody.quaternion.x
        this.wheelRFMesh.quaternion.y = this.wheelRFBody.quaternion.y
        this.wheelRFMesh.quaternion.z = this.wheelRFBody.quaternion.z
        this.wheelRFMesh.quaternion.w = this.wheelRFBody.quaternion.w

        this.wheelLBMesh.position.x = this.wheelLBBody.position.x
        this.wheelLBMesh.position.y = this.wheelLBBody.position.y
        this.wheelLBMesh.position.z = this.wheelLBBody.position.z
        this.wheelLBMesh.quaternion.x = this.wheelLBBody.quaternion.x
        this.wheelLBMesh.quaternion.y = this.wheelLBBody.quaternion.y
        this.wheelLBMesh.quaternion.z = this.wheelLBBody.quaternion.z
        this.wheelLBMesh.quaternion.w = this.wheelLBBody.quaternion.w

        this.wheelRBMesh.position.x = this.wheelRBBody.position.x
        this.wheelRBMesh.position.y = this.wheelRBBody.position.y
        this.wheelRBMesh.position.z = this.wheelRBBody.position.z
        this.wheelRBMesh.quaternion.x = this.wheelRBBody.quaternion.x
        this.wheelRBMesh.quaternion.y = this.wheelRBBody.quaternion.y
        this.wheelRBMesh.quaternion.z = this.wheelRBBody.quaternion.z
        this.wheelRBMesh.quaternion.w = this.wheelRBBody.quaternion.w

        this.constraintLB.setMotorSpeed(this.forwardVelocity)
        this.constraintRB.setMotorSpeed(this.forwardVelocity)
        this.constraintLF.axisA.z = this.rightVelocity
        this.constraintRF.axisA.z = this.rightVelocity

        for (let i = 0; i < this.bulletCount; i++) {
            this.bulletMesh[i].position.x = this.bulletBody[i].position.x
            this.bulletMesh[i].position.y = this.bulletBody[i].position.y
            this.bulletMesh[i].position.z = this.bulletBody[i].position.z
            this.bulletMesh[i].rotation.x += 0.1
            this.bulletMesh[i].rotation.y += 0.05
        }

        this.carSound.setPlaybackRate(
            Math.abs(this.forwardVelocity / 50) + Math.random() / 9
        )
    }

    explode(v: CANNON.Vec3) {
        //removes all constraints for this car so that parts separate
        this.enabled = false

        this.physics.world.removeConstraint(this.constraintLF)
        this.physics.world.removeConstraint(this.constraintRF)
        this.physics.world.removeConstraint(this.constraintLB)
        this.physics.world.removeConstraint(this.constraintRB)

        this.wheelLFBody.velocity = v.scale(Math.random() * 25)
        this.wheelRFBody.velocity = v.scale(Math.random() * 25)
        this.wheelLBBody.velocity = v.scale(Math.random() * 25)
        this.wheelRBBody.velocity = v.scale(Math.random() * 25)
        this.frameBody.velocity = v.scale(Math.random() * 100)
    }

    updateColor(c: number) {
        if (c === this.colorcode) {
            return
        }
        this.colorcode = c
        for (let i = 0; i < this.bulletCount; i++) {
            if (Array.isArray(this.bulletMesh[i].material)) {
                (this.bulletMesh[i].material as Array<THREE.MeshBasicMaterial>).forEach(mat => {
                    mat.color.setHex(this.colorcode)
                });
            }
            else {
                (this.bulletMesh[i].material as THREE.MeshBasicMaterial).color.setHex(this.colorcode)
            }

        }
        this.rebuldFlare()

    }

    fix() {
        if (this.physics.world.constraints.length === 0) {
            console.log('fixing')
            this.physics.world.addConstraint(this.constraintLF)
            this.physics.world.addConstraint(this.constraintRF)
            this.physics.world.addConstraint(this.constraintLB)
            this.physics.world.addConstraint(this.constraintRB)
        }
    }
}
