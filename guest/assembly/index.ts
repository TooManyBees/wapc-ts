import * as wapc from "./wapc";

export class Result {
  readonly error: bool;
  readonly value: Uint8Array;
  constructor(error: bool, value: Uint8Array) {
    this.error = error;
    this.value = value;
  }
}

let userHandler = (op: string, data: Uint8Array): Result => new Result(false, data);

export function __guest_call(opLen: usize, reqLen: usize): bool {
  let opBuf = new Uint8Array(opLen);
  let reqBuf = new Uint8Array(reqLen);

  wapc.__guest_request(opBuf.dataStart, reqBuf.dataStart);
  let op = String.UTF8.decode(opBuf.buffer);
  consoleLog('Performing guest call, operation ' + op);

  let result = userHandler(op, reqBuf);
  let value = result.value;

  if (result.error) {
    let message = 'Guest call failed: ' + String.UTF8.decode(value.buffer);
    let messageBuffer = Uint8Array.wrap(String.UTF8.encode(message));
    wapc.__guest_error(messageBuffer.dataStart, messageBuffer.byteLength);
    return false
  }

  wapc.__guest_response(value.dataStart, value.byteLength);
  return true;
}

export function hostCall(op: string, message: Uint8Array): Result {
  let opBuf = Uint8Array.wrap(String.UTF8.encode(op));
  let callResult = wapc.__host_call(opBuf.dataStart, opBuf.byteLength, message.dataStart, message.byteLength);
  if (!callResult) {
    // Call failed
    let errLen = wapc.__host_error_len();
    let errBuf = new Uint8Array(errLen);
    wapc.__host_error(errBuf.dataStart)
    return new Result(true, errBuf);
  } else {
    let len = wapc.__host_response_len();
    let buf = new Uint8Array(len);
    wapc.__host_response(buf.dataStart);
    return new Result(false, buf);
  }
}

export function consoleLog(message: string): void {
  let messageBuffer = Uint8Array.wrap(String.UTF8.encode(message));
  wapc.__console_log(messageBuffer.dataStart, messageBuffer.byteLength);
}
