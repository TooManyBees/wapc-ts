import * as Ops from './ops';
import ModuleState, { Invocation } from './module-state'

interface HostResult {
  readonly error?: Uint8Array,
  readonly value?: Uint8Array,
}
type HostCallback = (moduleId: number, operation: string, message: Uint8Array) => HostResult;

interface InstanceWrapper {
  instance: WebAssembly.Instance | null,
  state: ModuleState,
  hostCallback: HostCallback,
}

function writeBytesToMemory(memory: ArrayBuffer, ptr: number, message: Uint8Array) {
  let view = new DataView(memory, ptr);
  for (let i = 0; i < message.byteLength; i++) {
    view.setUint8(i, message[i]);
  }
}

function instantiate(bytes: Buffer, hostCallback: HostCallback): InstanceWrapper {
  const wrapper: InstanceWrapper = {
    instance: null,
    state: new ModuleState(),
    hostCallback,
  };

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  function getMemoryBuffer(): ArrayBuffer {
    const memory = wrapper.instance!.exports.memory as WebAssembly.Memory;
    return memory.buffer;
  }

  const importObj = {
    env: {
      abort: () => {
        console.debug(`Abort called from module ${wrapper.state.id}`);
        process.exit(0);
      },
    },
    [Ops.HOST_NAMESPACE]: {
      [Ops.HOST_CONSOLE_LOG]: (ptr: number, len: number) => {
        const array = new Uint8Array(getMemoryBuffer(), ptr, len);
        const text = decoder.decode(array);
        console.debug(text);
      },
      [Ops.HOST_CALL]: (opPtr: number, opLen: number, ptr: number, len: number): boolean => {
        wrapper.state.hostResponse = null;
        wrapper.state.hostError = null;
        const id = wrapper.state.id;
        const memory = getMemoryBuffer();
        let buf = new Uint8Array(memory, ptr, len);
        let opBuf = new Uint8Array(memory, opPtr, opLen);
        let op = decoder.decode(opBuf);
        console.debug(`Guest module ${id} invoking op ${op}`);
        let { value, error } = wrapper.hostCallback(id, op, buf);
        if (value) {
          wrapper.state.hostResponse = value;
          return true;
        } else if (error) {
          wrapper.state.hostError = decoder.decode(error);
          return false;
        }
        return false;
      },
      [Ops.HOST_RESPONSE_FN]: (ptr: number) => {
        if (wrapper.state.hostResponse) {
          let memory = getMemoryBuffer();
          writeBytesToMemory(memory, ptr, wrapper.state.hostResponse);
        }
      },
      [Ops.HOST_RESPONSE_LEN_FN]: () => wrapper.state.hostResponse ? wrapper.state.hostResponse.length : 0,
      [Ops.GUEST_REQUEST_FN]: (opPtr: number, ptr: number) => {
        let invocation = wrapper.state.guestRequest;
        let memory = getMemoryBuffer();
        if (invocation) {
          writeBytesToMemory(memory, ptr, invocation.message);
          writeBytesToMemory(memory, opPtr, encoder.encode(invocation.operation));
        }
      },
      [Ops.GUEST_RESPONSE_FN]: (ptr: number, len: number) => {
        let memory = getMemoryBuffer();
        wrapper.state.guestResponse = Uint8Array.from(new Uint8Array(memory, ptr, len));
      },
      [Ops.GUEST_ERROR_FN]: (ptr: number, len: number) => {
        let memory = getMemoryBuffer();
        wrapper.state.guestError = decoder.decode(new Uint8Array(memory, ptr, len));
      },
      [Ops.HOST_ERROR_FN]: (ptr: number) => {
        if (wrapper.state.hostError) {
          let memory = getMemoryBuffer();
          writeBytesToMemory(memory, ptr, encoder.encode(wrapper.state.hostError));
        }
      },
      [Ops.HOST_ERROR_LEN_FN]: () => wrapper.state.hostError ? wrapper.state.hostError.length : 0,
    },
  };

  const module = new WebAssembly.Module(bytes);
  const instance = new WebAssembly.Instance(module, importObj);
  wrapper.instance = instance;
  return wrapper;
}

export interface Result {
  error?: string;
  value?: Uint8Array;
}

type GuestCall = (opLen: number, messageLen: number) => boolean;

export class WapcHost {
  static create(hostCallback: HostCallback, bytes: Buffer): WapcHost {
    const { instance, state } = instantiate(bytes, hostCallback);
    return new WapcHost(hostCallback, instance, state);
  }

  hostCallback: HostCallback;
  instance: WebAssembly.Instance | null;
  state: ModuleState;

  constructor(hostCallback: HostCallback, instance: WebAssembly.Instance | null, state: ModuleState) {
    this.hostCallback = hostCallback;
    this.instance = instance;
    this.state = state;
  }

  replaceModule(bytes: Buffer) {
    const { instance, state } = instantiate(bytes, this.hostCallback);
    this.instance = instance;
    this.state = state;
  }

  call(op: string, payload: Uint8Array) {
    const inv: Invocation = { operation: op, message: payload };
    this.state.guestResponse = null;
    this.state.guestRequest = inv;
    this.state.guestError = null;

    if (this.instance == null) {
      throw new Error("WASM module not loaded");
    }
    const callResult = (<GuestCall>this.instance.exports.__guest_call)(inv.operation.length, inv.message.length);
    if (callResult) {
      if (this.state.guestResponse) {
        return { value: this.state.guestResponse };
      } else if (this.state.guestError) {
        return { error: this.state.guestError };
      } else {
        return { error: "No error message OR response set for call success" };
      }
    } else {
      const error = this.state.guestError || "No error message left for call failure";
      return { error };
    }
  }
}
