import { Triplet } from "@react-three/cannon"
import { Euler, Vector3 } from "three"

export const vector_to_triplet = (vector:Vector3):Triplet=>{
    return vector.toArray()
}

export const triplet_to_vector = (triplet:Triplet):Vector3=>{
    return new Vector3(...triplet)
}

export const triplet_to_euler = (triplet:Triplet):Euler=>{
    return new Euler(...triplet)
}