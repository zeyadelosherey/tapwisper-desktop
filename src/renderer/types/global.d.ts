import type { ReactElement } from 'react'
import type { TapWisperAPI } from '../../preload/index'

declare global {
  interface Window {
    tapwisper: TapWisperAPI
  }

  namespace JSX {
    type Element = ReactElement
  }
}

export {}
