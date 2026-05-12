// Fix: Type declaration for OpenTUI runtime modules (avoids any type)
declare global {
  interface GlobalThis {
    opentui?: {
      runtimeModules?: Record<string, unknown>
    }
  }
  type OpenTuiRuntime = NonNullable<GlobalThis['opentui']>
}

export {};