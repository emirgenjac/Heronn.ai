import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { CustomEase } from 'gsap/CustomEase'

gsap.registerPlugin(useGSAP, CustomEase)
CustomEase.create('apple', '0.32,0.72,0,1')

export { gsap, useGSAP }

export const EASE_APPLE = 'apple'
export const DUR_EXPAND = 0.32
export const DUR_FADE = 0.22

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function dur(seconds: number): number {
  return prefersReducedMotion() ? 0 : seconds
}
