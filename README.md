# Frida Android Skill

A skill for Android dynamic instrumentation with Frida used for codex or claude code. It helps an agent check the local Android/Frida environment, generate Java or native hook scripts from templates, run Frida against a target process, and report observed arguments, return values, and errors.

The operational instructions live in [`SKILL.md`](SKILL.md); the scripts and templates in this repository are supporting resources loaded by the agent when needed.

## Features

- Check host and device readiness for Android Frida work.
- Generate Java method hooks with explicit overload selection.
- Generate native hooks by exported symbol or module-relative RVA.
- Generate Java and native call scripts for controlled invocation.
- Prefer attach-by-PID workflows for multi-process Android apps.
- Surface environment warnings such as hidden `frida-server` processes, version mismatch, missing devices, or target process ambiguity.

## Repository Layout

```text
.
├── SKILL.md
├── README.md
├── agents/
│   └── openai.yaml
├── scripts/
│   └── check-frida-android-env.sh
└── templates/
    ├── call-java.js
    ├── call-native.js
    ├── hook-java.js
    └── hook-native.js
```

## Requirements

On the host:

- Android platform-tools, including `adb`
- `frida` and `frida-ps` from `frida-tools`

On the Android device:

- USB debugging enabled and authorized
- A matching `frida-server` running on the device, or Frida Gadget embedded in the target app
- A device and application you are authorized to test

Install Frida tools with:

```bash
python -m pip install -U frida-tools
```

## Quick Start

Run the environment check first:

```bash
bash scripts/check-frida-android-env.sh com.example.app
```

For multiple connected devices, pass the serial as the second argument:

```bash
bash scripts/check-frida-android-env.sh com.example.app 192.168.1.100:5555
```

After the target package, process, class, method, overload, or native symbol is confirmed, fill a template from `templates/` and run it with Frida.

Attach by PID when possible:

```bash
frida -U -p 12345 -l generated-script.js
```

Attach by process name when the name is unambiguous:

```bash
frida -U -n com.example.app -l generated-script.js
```

Spawn mode can be useful when the process is not already running, but may require Gadget on restricted or jailed devices:

```bash
frida -U -f com.example.app -l generated-script.js
```

Some older Frida CLI examples include `--no-pause`; newer Frida versions may reject it. Prefer the syntax supported by your installed `frida --help`.

## Template Usage

Templates intentionally contain placeholders such as `__JAVA_CLASS__` and `__NATIVE_MODULE__`. Replace every placeholder with a valid JavaScript literal before running the script.

Example Java hook target:

```js
const ClassName = 'com.example.MainActivity';
const MethodName = 'selectItem';
const overloadTypes = ['int'];
```

Example native hook target by RVA:

```js
const moduleName = 'libnative.so';
const symbolName = null;
const offset = 0x1234;
const argTypes = ['pointer', 'int'];
```

Native offsets must be RVAs relative to the loaded module base, not raw file offsets from a static analysis tool.

## Safety and Scope

Use this skill only on applications and devices where you have authorization to test. The default hook behavior preserves the original implementation unless the user explicitly asks to modify arguments, return values, or control flow.

The skill is designed to stop and report clear failures when the environment is not ready. In particular, treat these as blockers until resolved:

- no usable ADB device
- `frida-ps` cannot enumerate processes
- `frida-server` version or ABI mismatch
- target package or process cannot be confirmed
- unresolved script placeholders

## Troubleshooting

If `adb` cannot see the device:

```bash
adb devices
```

If Frida cannot enumerate processes:

```bash
frida-ps -U
```

If `frida-server` is missing or mismatched, push a server binary that matches the host Frida version and the device ABI, then start it on the device. Check host version with:

```bash
frida --version
```

If a Java class is not found, the app may load it later through another class loader. Wait for the relevant screen or hook class loading before installing the target hook.

If a native module is not found, it may be loaded lazily. Delay script execution or hook `dlopen` before resolving the module.

## License

No license file is included yet. Add a project license before publishing this repository as open source.
