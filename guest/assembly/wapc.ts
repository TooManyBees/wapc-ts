export declare function __console_log(ptr: usize, len: usize): void;
export declare function __host_call(opPtr: usize, opLen: usize, ptr: usize, len: usize): bool;
export declare function __host_response(ptr: usize): void;
export declare function __host_response_len(): usize;
export declare function __host_error(ptr: usize): void;
export declare function __host_error_len(): usize;
export declare function __guest_response(ptr: usize, len: usize): void;
export declare function __guest_error(ptr: usize, len: usize): void;
export declare function __guest_request(opPtr: usize, ptr: usize): void;
