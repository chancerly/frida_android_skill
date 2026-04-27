---
name: frida-android
description: 用于 Android 平台 Frida 动态插桩：检查主机和设备环境，确认目标 Java/native 方法，生成并运行 hook 脚本，或自动调用用户指定的 Java/native 方法。需要主机安装 adb 和 frida-tools，Android 设备运行 frida-server 或集成 Frida Gadget。
---

# Frida Android

当用户希望用 Frida hook 或调用 Android 应用中的 Java 方法、native 函数时，使用这个 skill。

## 安全边界

- 只分析用户有授权测试的应用和设备。
- 不要替用户静默选择目标方法。运行 hook 或 call 之前，必须确认准确的包名/进程名和方法/函数。
- 如果环境检查失败，停止后报告具体失败项，并给出用户需要执行的命令或动作。
- 除非用户明确要求 spawn 应用，否则优先 attach 到已经运行的进程。
- 生成的脚本默认保存在当前工作区，除非用户要求其他路径。

## 必需流程

1. 收集目标信息：
   - Android 包名或进程名。
   - 操作类型：`hook-java`、`hook-native`、`call-java` 或 `call-native`。
   - Java 方法信息：类名、方法名、静态/实例方法、重载参数类型、已知返回类型、调用参数。
   - native 函数信息：模块名、导出符号或绝对 offset/address、ABI、返回类型、参数类型、调用参数。
2. 运行环境检查：
   ```bash
   bash scripts/check-frida-android-env.sh [package-or-process] [device-serial]
   ```
   必须阅读全部输出行，不要只看最后的 `RESULT`。即使 `RESULT OK`，也要把 `WARN` 行如实告诉用户。如果出现任何 `FAIL`，说明问题并等待用户修复。
3. 和用户确认目标方法/函数。确认内容应包括完整签名，以及计划使用 attach 还是 spawn。
4. 从 `templates/` 中选择对应模板生成 Frida JS 脚本。运行前必须填完所有占位符。
5. 运行 Frida：
   ```bash
   frida -U -p PID -l generated-script.js   # 推荐：PID 明确，不受多进程名影响
   # 或按进程名 attach，多进程 app 可能有歧义：
   frida -U -n PROCESS_NAME -l generated-script.js
   ```
   多设备场景下，用 `-D SERIAL` 替代 `-U`，例如：
   ```bash
   frida -D SERIAL -p PID -l generated-script.js
   ```
   spawn 模式：
   ```bash
   frida -U -f PACKAGE_NAME -l generated-script.js --no-pause
   ```
   如果主机 Frida 为 v15+ 且脚本行为异常，可尝试 `--runtime=v8`。Frida 15 起默认运行时是 QuickJS。
6. 汇报观察结果：参数、返回值、错误、脚本是否修改了行为。

## 环境检查

先运行 `scripts/check-frida-android-env.sh`。它会检查：

- `adb` 是否可用。
- Android 设备是否已连接且可访问。
- 主机 Frida 工具是否可用，包括 `frida`、`frida-ps` 和 `frida --version`。
- 设备 ABI 和 Android 版本是否可读取。
- Frida 是否能通过 USB 枚举进程。
- `adb shell ps` 是否能看到运行中的 `frida-server`，或 Frida 连通性是否实际可用。
- 未运行 server 时，`/data/local/tmp` 下是否存在候选 `frida-server*` 文件。
- 可选目标包名/进程是否存在。
- 枚举失败时的常见 frida-server 修复提示。

**多设备：** 如果连接了多台设备，把 serial 作为第二个参数传入：
```bash
bash scripts/check-frida-android-env.sh com.example.app 192.168.1.100:5555
```

如果 `adb shell ps` 看不到 `frida-server`，但 `frida-ps -U` 可以枚举进程，可以认为 Frida 连通性正常。Android API 29+、SELinux 或 userdebug 构建可能隐藏进程。

如果枚举失败，优先提示：

- 检查 frida-server ABI 是否匹配 `adb shell getprop ro.product.cpu.abilist`。
- 在设备上以 root 启动 frida-server，例如：
  ```bash
  adb shell su -c /data/local/tmp/frida-server
  ```
- 非 root 设备使用 Frida Gadget。

## 模板

- Java hook：`templates/hook-java.js`
- Native hook：`templates/hook-native.js`
- Java call：`templates/call-java.js`
- Native call：`templates/call-native.js`

**不要运行仍含未解析占位符的脚本。**

模板中的占位符应替换成可直接执行的 JS 字面量。也就是说，字符串要带引号，`null` 要保持为真正的 `null`，不要替换成字符串 `'null'`。

### 占位符参考

#### hook-java.js

| 占位符 | 类型 | 示例 |
|---|---|---|
| `__JAVA_CLASS__` | JS 字符串字面量 | `'com.example.MyClass'` |
| `__JAVA_METHOD__` | JS 字符串字面量 | `'doSomething'` |
| `__JAVA_OVERLOAD_TYPES__` | JS 数组字面量 | `['int', 'java.lang.String']` 或 `[]` |

#### hook-native.js

| 占位符 | 类型 | 示例 |
|---|---|---|
| `__NATIVE_MODULE__` | JS 字符串字面量 | `'libnative.so'` |
| `__NATIVE_SYMBOL__` | JS 字符串字面量或 `null` | `'Java_com_example_check'` 或 `null` |
| `__NATIVE_OFFSET__` | 整数或 `null` | `0x1234`（RVA）或 `null` |
| `__NATIVE_ARG_TYPES__` | JS 数组字面量 | `['pointer', 'int']` 或 `[]` |

#### call-java.js

| 占位符 | 类型 | 示例 |
|---|---|---|
| `__JAVA_CLASS__` | JS 字符串字面量 | `'com.example.MyClass'` |
| `__JAVA_METHOD__` | JS 字符串字面量 | `'doSomething'` |
| `__JAVA_OVERLOAD_TYPES__` | JS 数组字面量 | `['int', 'java.lang.String']` 或 `[]` |
| `__JAVA_ARGUMENTS__` | JS 数组字面量 | `[42, 'hello']` 或 `[]` |
| `__JAVA_IS_STATIC__` | 布尔值 | `true` 或 `false` |
| `__JAVA_INSTANCE_PROVIDER__` | JS 字符串字面量 | `'static'`、`'choose'` 或 `'new'` |
| `__JAVA_CONSTRUCTOR_ARGUMENTS__` | JS 展开参数片段 | `'arg1', 2`，仅 provider 为 `'new'` 时使用 |

#### call-native.js

| 占位符 | 类型 | 示例 |
|---|---|---|
| `__NATIVE_MODULE__` | JS 字符串字面量 | `'libnative.so'` |
| `__NATIVE_SYMBOL__` | JS 字符串字面量或 `null` | `'Java_com_example_check'` 或 `null` |
| `__NATIVE_OFFSET__` | 整数或 `null` | `0x1234`（RVA）或 `null` |
| `__NATIVE_RETURN_TYPE__` | JS 字符串字面量 | `'int'` 或 `'pointer'` |
| `__NATIVE_ARG_TYPES__` | JS 数组字面量 | `['pointer', 'int']` 或 `[]` |
| `__NATIVE_ARGUMENTS__` | JS 数组字面量 | `[ptr('0x0'), 42]` 或 `[]` |
| `__NATIVE_ABI__` | JS 字符串字面量 | `'default'`、`'stdcall'` 等 |

**Frida NativeFunction 支持的类型字符串：**
`'void'`、`'bool'`、`'int'`、`'uint'`、`'long'`、`'ulong'`、`'char'`、`'uchar'`、`'float'`、`'double'`、`'int8'`、`'uint8'`、`'int16'`、`'uint16'`、`'int32'`、`'uint32'`、`'int64'`、`'uint64'`、`'size_t'`、`'ssize_t'`、`'pointer'`

**Frida ABI 选项：**
`'default'`、`'sysv'`、`'stdcall'`、`'thiscall'`、`'fastcall'`、`'mscdecl'`、`'win64'`、`'unix64'`、`'vfp'`

## Frida 使用约定

- Java 相关逻辑放在 `Java.perform(function () { ... })` 中。
- 使用 `Java.use('fully.qualified.Class')`，能明确重载时优先使用 `.overload(...)`。
- hook 默认保持原行为，除非用户明确要求修改返回值或参数。
- native 导出符号优先使用 `Process.findModuleByName('libname.so')` 和 `module.getExportByName()`。
- 已知偏移使用 `module.base.add(OFFSET)`。**OFFSET 必须是 RVA（相对模块基址的虚拟地址）**，不是静态分析工具里看到的文件偏移。文件偏移需要先转换为 RVA。
- 只有在 ABI 和类型映射明确时才使用 `new NativeFunction(ptr, returnType, argTypes, { abi: 'default' })`。
- Frida 15+ 默认 QuickJS。模板避免使用 V8 专属语法；确实需要 V8 时再加 `--runtime=v8`。

## 常见问题

- `Failed to spawn: unable to find application`：用 `adb shell pm list packages` 确认包名。
- `frida-ps -U` 无法连接：frida-server 未运行、ABI 不匹配、版本不匹配、被系统限制，或 Gadget 未加载。
- `Java ClassNotFoundException`：目标类可能由后续 DEX 或自定义 ClassLoader 加载，需要等待加载完成或 hook `ClassLoader.loadClass`。
- native symbol not found：枚举 exports，检查符号是否被 strip，或改用模块 RVA。
- native call 崩溃：重新确认 ABI、指针参数、调用线程，以及函数是否依赖已初始化的应用状态。
- **frida-server 版本不匹配：** 如果连接后出现 `Failed to load script` 等不透明错误，确认主机 `frida-tools` 和设备 `frida-server` 版本一致。用 `frida --version` 对比 server 文件名或实际版本。
- **多设备歧义：** 如果命令提示 `more than one device`，指定 serial：`adb -s SERIAL ...`，或把 serial 传给检查脚本。
- **旧 Android（API < 26）：** 检查脚本会回退到不带 `-A` 的 `ps`。如果看不到 `frida-server`，但 `frida-ps` 能枚举进程，则以 Frida 连通性为准。
