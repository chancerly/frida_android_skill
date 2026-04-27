'use strict';

// PLACEHOLDERS (fill all before running):
//   __NATIVE_MODULE__    JS string literal  e.g. 'libnative.so'
//   __NATIVE_SYMBOL__    JS string literal | null  exported symbol name, e.g. 'Java_com_example_NativeLib_check'
//                        Set to null when using offset mode.
//   __NATIVE_OFFSET__    integer | null  RVA (relative virtual address from module base), e.g. 0x1234
//                        Set to null when using symbol mode.
//                        NOTE: Use RVA, NOT file offset. File offsets from static analysis tools
//                        must be converted to RVA (subtract the ELF load bias if applicable).
//   __NATIVE_ARG_TYPES__ JS array literal  e.g. ['pointer', 'int'] or []
//                        Valid types: 'void','bool','int','uint','long','ulong','char','uchar',
//                        'float','double','int8','uint8','int16','uint16','int32','uint32',
//                        'int64','uint64','size_t','ssize_t','pointer'

const moduleName = __NATIVE_MODULE__;
const symbolName = __NATIVE_SYMBOL__; // string or null
const offset = __NATIVE_OFFSET__;      // RVA integer or null
const argTypes = __NATIVE_ARG_TYPES__; // e.g. ['pointer', 'int'] or []

// Validate placeholder resolution
if (symbolName === null && offset === null) {
  throw new Error('Provide either symbolName or offset (RVA) — both are null.');
}

// If the module loads lazily (e.g. loaded via System.loadLibrary after app start),
// this will throw. Use Process.findModuleByName and hook dlopen to defer, or add a delay.
const moduleRef = Process.findModuleByName(moduleName);
if (!moduleRef) {
  throw new Error('Module not loaded: ' + moduleName + '. If it loads lazily, hook dlopen or delay script execution.');
}

const target = (symbolName !== null && symbolName !== '')
  ? moduleRef.getExportByName(symbolName)
  : moduleRef.base.add(offset);

Interceptor.attach(target, {
  onEnter(args) {
    const label = symbolName || ('base+0x' + offset.toString(16));
    console.log('[native:onEnter] ' + moduleName + '!' + label + ' @ ' + target);
    for (let i = 0; i < argTypes.length; i++) {
      console.log('  arg' + i + ' (' + argTypes[i] + ')=' + args[i]);
    }
  },
  onLeave(retval) {
    console.log('[native:onLeave] retval=' + retval);
  }
});

const label = symbolName || ('base+0x' + offset.toString(16));
console.log('[ready] Native hook installed at ' + target + ' (' + label + ') in ' + moduleName);
