/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { useRef, useEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerspectiveCamera } from '@react-three/drei'
import { Euler, Mesh, Vector3 } from 'three'
import { Physics, useBox, BoxProps } from "@react-three/cannon"
import { HueSaturation, EffectComposer } from '@react-three/postprocessing'
import { BlendFunction } from "postprocessing"
import { triplet_to_euler, triplet_to_vector, vector_to_triplet } from './lib/utils'
import { KeyboardControlsEntry, KeyboardControls, useKeyboardControls } from "@react-three/drei"


function Box(props: BoxProps) {
  const [ref, api] = useBox(
    () => ({ args: [1, 1, 1], mass: 10000000, ...props }),
    useRef<Mesh>(null!)
  )
  return (
    <mesh ref={ref}>
      <boxGeometry />
      <meshLambertMaterial color="hotpink" />
    </mesh>
  )
}

function Spaceship(props: BoxProps) {
  const [, get] = useKeyboardControls<Controls>();
  const [ref, api] = useBox(
    () => ({ args: [1, 1, 1], mass: 1, ...props }),
    useRef<Mesh>(null!)
  )
  const location = useRef<Vector3>(new Vector3(0, 0, 0))
  const velocity = useRef<Vector3>(new Vector3(0, 0, 0))
  const angular_velocity = useRef<Vector3>(new Vector3(0, 0, 0));
  const direction = useRef<Euler>(new Euler(0, 0, 0))
  const full_thrust = new Vector3(0, 0, 10);
  const throttle_level = useRef(0.5);
  useEffect(() => {
    api.velocity.subscribe((v) => {
      console.log("velocity", velocity.current)
      velocity.current = triplet_to_vector(v)
    })
    api.angularVelocity.subscribe((w) => (angular_velocity.current = triplet_to_vector(w)))
    api.rotation.subscribe((theta) => (direction.current = triplet_to_euler(theta)))
    return;
  }, [api.velocity, api.angularVelocity, api.rotation])
  useFrame(({ clock }) => {
    api.applyLocalForce(vector_to_triplet(velocity.current.multiplyScalar(-0.3 * velocity.current.length() * clock.getDelta())), [0, 0, 0])
    api.applyTorque(vector_to_triplet(angular_velocity.current.multiplyScalar(-0.5 * angular_velocity.current.length())))
    api.applyLocalForce(vector_to_triplet(full_thrust.multiplyScalar(throttle_level.current)), [0, 0, 0])
  })
  useFrame(({ clock }) => {
    const controls = get();
    if (controls.pitch_up) {
      api.applyTorque(vector_to_triplet(new Vector3(0.01, 0, 0).multiplyScalar(clock.getElapsedTime())));
    }
    if (controls.pitch_down) {
      api.applyTorque(vector_to_triplet(new Vector3(-0.01, 0, 0).multiplyScalar(clock.getElapsedTime())));
    }
    if (controls.roll_right) {
      api.applyTorque(vector_to_triplet(new Vector3(0, 0, 0.01).multiplyScalar(clock.getElapsedTime())));
    }
    if (controls.roll_left) {
      api.applyTorque(vector_to_triplet(new Vector3(0, 0, -0.01).multiplyScalar(clock.getElapsedTime())));
    }
    if (controls.yaw_right) {
      api.applyTorque(vector_to_triplet(new Vector3(0, 0.01, 0).multiplyScalar(clock.getElapsedTime())));
    }
    if (controls.yaw_left) {
      api.applyTorque(vector_to_triplet(new Vector3(0, -0.01, 0).multiplyScalar(clock.getElapsedTime())));
    }
    if (controls.throttle_up) {
      throttle_level.current += 0.1
      if (throttle_level.current > 1) {
        throttle_level.current = 1
      }
    }
    if (controls.throttle_down) {
      throttle_level.current -= 0.1
      if (throttle_level.current < 0) {
        throttle_level.current = 0
      }
    }
    console.log("throttle", throttle_level.current)
  })
  return (
    <mesh ref={ref}>
      <PerspectiveCamera makeDefault
        fov={30}
        rotation={[0.6, Math.PI, 0]}
        position={[0, 7, -10]} />
      <boxGeometry />
      <meshLambertMaterial color="orange" />
    </mesh>
  )
}

enum Controls {
  fire = "fire",
  pitch_down = "pitch_down",
  pitch_up = "pitch_up",
  roll_right = "roll_right",
  roll_left = "roll_left",
  yaw_right = "yaw_right",
  yaw_left = "yaw_left",
  throttle_up = "throttle_up",
  throttle_down = "throttle_down"
}

export default function App() {
  const map = useMemo<KeyboardControlsEntry<Controls>[]>(() => [
    { name: Controls.fire, keys: ["Space"] },
    { name: Controls.pitch_up, keys: ['KeyS'] },
    { name: Controls.pitch_down, keys: ['KeyW'] },
    { name: Controls.roll_right, keys: ['KeyA'] },
    { name: Controls.roll_left, keys: ['KeyD'] },
    { name: Controls.yaw_right, keys: ['KeyQ'] },
    { name: Controls.yaw_left, keys: ['KeyE'] },
    { name: Controls.throttle_up, keys: ['ArrowUp'] },
    { name: Controls.throttle_down, keys: ['ArrowDown'] },
  ], [])
  return (
    <>
      <Canvas style={{ height: "100vh" }}>
        <color attach="background" args={['#171720']} />
        <ambientLight />
        <pointLight position={[10, 10, 10]} />
        <Physics gravity={[0, 0, 0]}>
          <Box position={[-1.2, 0, 0]} />
          <Box position={[1.2, 0, 0]} />
          <KeyboardControls map={map}>
            <Spaceship />
          </KeyboardControls>
        </Physics>
        <EffectComposer>
          <HueSaturation
            blendFunction={BlendFunction.NORMAL} // blend mode
            hue={0.1} // hue in radians
            saturation={0.2} // saturation in radians
          />
        </EffectComposer>
      </Canvas >
    </>
  )
}
