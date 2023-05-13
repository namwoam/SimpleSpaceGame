import { Vector3 } from "@react-three/fiber";
import { Euler } from "three";
import { useBox } from "@react-three/cannon";

// this is a blocky world
export class GameObject{
    constructor(public position:Vector3, public rotaion:Euler,public acceleration:Vector3, public max_health:number, public health:number){}
}

export class SpaceShip{
    constructor(public id:number, public position:Vector3, public rotation:Euler){}
}

export class Component{
    constructor(public id:number , public weight:number, public position:Vector3 , public size:Vector3){}
}