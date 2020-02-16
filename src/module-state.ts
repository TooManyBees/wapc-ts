let GLOBAL_MODULE_COUNT = 0;

export interface Invocation {
  operation: string,
  message: Uint8Array,
}

class ModuleState {
  id: number;
  guestRequest: Invocation | null = null;
  guestResponse: Uint8Array | null = null;
  hostResponse: Uint8Array | null = null;
  guestError: string | null = null;
  hostError: string | null = null;

  constructor() {
    this.id = GLOBAL_MODULE_COUNT++;
  }
}

export default ModuleState;

