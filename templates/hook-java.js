'use strict';

// PLACEHOLDERS (fill all before running):
//   __JAVA_CLASS__          JS string literal  e.g. 'com.example.MyClass'
//   __JAVA_METHOD__         JS string literal  e.g. 'doSomething'
//   __JAVA_OVERLOAD_TYPES__ JS array literal  e.g. ['int', 'java.lang.String'] or [] for no-arg

Java.perform(function () {
  const ClassName = __JAVA_CLASS__;
  const MethodName = __JAVA_METHOD__;
  const overloadTypes = __JAVA_OVERLOAD_TYPES__; // e.g. ['int', 'java.lang.String'] or []
  const Target = Java.use(ClassName);

  // NOTE: If the class is lazily loaded (e.g. loaded via DexClassLoader after app start),
  // this will throw. Hook ClassLoader.loadClass or wait until the class is initialized.
  const overload = overloadTypes.length
    ? Target[MethodName].overload(...overloadTypes)
    : Target[MethodName].overload();

  overload.implementation = function () {
    const args = Array.prototype.slice.call(arguments);
    const argsStr = args.map(function (a) {
      try { return JSON.stringify(a); } catch (_) { return String(a); }
    }).join(', ');
    console.log('[java:onEnter] ' + ClassName + '.' + MethodName + '(' + argsStr + ')');

    const ret = overload.call(this, ...args);
    const retStr = (function () {
      try { return JSON.stringify(ret); } catch (_) { return String(ret); }
    })();
    console.log('[java:onLeave] ' + ClassName + '.' + MethodName + ' => ' + retStr);
    return ret;
  };

  console.log('[ready] Java hook installed for ' + ClassName + '.' + MethodName + '(' + overloadTypes.join(', ') + ')');
});
