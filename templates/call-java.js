'use strict';

// PLACEHOLDERS (fill all before running):
//   __JAVA_CLASS__                JS string literal  e.g. 'com.example.MyClass'
//   __JAVA_METHOD__               JS string literal  e.g. 'doSomething'
//   __JAVA_OVERLOAD_TYPES__       JS array literal  e.g. ['int', 'java.lang.String'] or []
//   __JAVA_ARGUMENTS__            JS array literal  e.g. [42, 'hello'] or []
//   __JAVA_IS_STATIC__            boolean  true or false
//   __JAVA_INSTANCE_PROVIDER__    JS string literal  'static' | 'choose' | 'new'
//                                 'static' = static method (use when __JAVA_IS_STATIC__ is true)
//                                 'choose'  = find a live instance via Java.choose (heap scan)
//                                 'new'     = construct a new instance via $new
//   __JAVA_CONSTRUCTOR_ARGUMENTS__ JS spread args  e.g. 'arg1, arg2' — only used when provider='new'

Java.perform(function () {
  const ClassName = __JAVA_CLASS__;
  const MethodName = __JAVA_METHOD__;
  const overloadTypes = __JAVA_OVERLOAD_TYPES__; // e.g. ['int', 'java.lang.String'] or []
  const callArgs = __JAVA_ARGUMENTS__;           // e.g. [42, 'hello'] or []
  const isStatic = __JAVA_IS_STATIC__;           // true or false
  const instanceProvider = __JAVA_INSTANCE_PROVIDER__; // 'static' | 'choose' | 'new'

  // NOTE: If the class is lazily loaded, this throws. Hook ClassLoader or wait.
  const Target = Java.use(ClassName);
  const overload = overloadTypes.length
    ? Target[MethodName].overload(...overloadTypes)
    : Target[MethodName].overload();

  function invokeWithReceiver(receiver) {
    if (!receiver) {
      console.error('[java:call] No receiver found for ' + ClassName + '. Cannot call method.');
      return;
    }
    try {
      const result = overload.call(receiver, ...callArgs);
      const resultStr = (function () {
        try { return JSON.stringify(result); } catch (_) { return String(result); }
      })();
      console.log('[java:call] ' + ClassName + '.' + MethodName + ' => ' + resultStr);
    } catch (e) {
      console.error('[java:call] ERROR calling ' + ClassName + '.' + MethodName + ': ' + e.message);
    }
  }

  if (isStatic || instanceProvider === 'static') {
    invokeWithReceiver(Target);
  } else if (instanceProvider === 'choose') {
    // Java.choose scans the heap; onComplete fires after all instances are enumerated.
    let called = false;
    Java.choose(ClassName, {
      onMatch: function (instance) {
        called = true;
        invokeWithReceiver(instance);
        return 'stop'; // call only the first found instance
      },
      onComplete: function () {
        if (!called) {
          console.error('[java:call] Java.choose found no live instance for ' + ClassName);
        } else {
          console.log('[java:call] Java.choose scan complete for ' + ClassName);
        }
      }
    });
  } else if (instanceProvider === 'new') {
    // Construct a new instance. If there are multiple constructors, specify the overload:
    //   Target.$new.overload(...constructorOverloadTypes).call(Target, ...constructorArgs)
    let receiver;
    try {
      receiver = Target.$new(__JAVA_CONSTRUCTOR_ARGUMENTS__);
    } catch (e) {
      console.error('[java:call] ERROR constructing ' + ClassName + ': ' + e.message);
      return;
    }
    invokeWithReceiver(receiver);
  } else {
    throw new Error('[java:call] Unknown instanceProvider: "' + instanceProvider + '". Use "static", "choose", or "new".');
  }
});
