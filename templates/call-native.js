'use strict';

// PLACEHOLDERS (fill all before running):
//   __NATIVE_MODULE__      JS string literal  e.g. 'libnative.so'
//   __NATIVE_SYMBOL__      JS string literal | null  exported symbol, e.g. 'Java_com_example_check'
//                          Set to null when using offset mode.
//   __NATIVE_OFFSET__      integer | null  RVA from module base, e.g. 0x1234
//                          Set to null when using symbol mode.
//                          NOTE: Must be RVA, NOT a file offset from a static analysis tool.
//   __NATIVE_RETURN_TYPE__ JS string literal  e.g. 'int' or 'pointer'
//                          Valid types: 'void','bool','int','uint','long','ulong','char','uchar',
//                          'float','double','int8','uint8','int16','uint16','int32','uint32',
//                          'int64','uint64','size_t','ssize_t','pointer'
//   __NATIVE_ARG_TYPES__   JS array literal  e.g. ['pointer', 'int'] or []
//   __NATIVE_ARGUMENTS__   JS array literal  e.g. [ptr('0x0'), 42] or []
//   __NATIVE_ABI__         JS string literal  ABI convention — use 'default' unless you know otherwise.
//                          Options: 'default','sysv','stdcall','thiscall','fastcall',
//                          'mscdecl','win64','unix64','vfp'

const moduleName   = __NATIVE_MODULE__;
const symbolName   = __NATIVE_SYMBOL__;     // string or null
const offset       = __NATIVE_OFFSET__;     // RVA integer or null
const returnType   = __NATIVE_RETURN_TYPE__;
const argTypes     = __NATIVE_ARG_TYPES__;  // e.g. ['pointer', 'int'] or []
const callArgs     = __NATIVE_ARGUMENTS__;  // e.g. [ptr('0x0'), 42] or []
const nativeAbi    = __NATIVE_ABI__;        // e.g. 'default'

// Validate placeholders
if (symbolName === null && offset === null) {
  throw new Error('Provide either symbolName or offset (RVA) — both are null.');
}

// If the module loads lazily, this throws. Use Process.findModuleByName and check for null.
const moduleRef = Process.findModuleByName(moduleName);
if (!moduleRef) {
  throw new Error('Module not loaded: ' + moduleName + '. If it loads lazily, hook dlopen or delay script execution.');
}

const target = (symbolName !== null && symbolName !== '')
  ? moduleRef.getExportByName(symbolName)
  : moduleRef.base.add(offset);

const fn = new NativeFunction(target, returnType, argTypes, { abi: nativeAbi });

const label = symbolName || ('base+0x' + offset.toString(16));
try {
  const result = fn(...callArgs);
  console.log('[native:call] ' + moduleName + '!' + label + ' => ' + result);
} catch (e) {
  console.error('[native:call] ERROR calling ' + moduleName + '!' + label + ': ' + e.message);
}
