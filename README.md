# Application Compiler: Single File Applications Re-Imagined

[![NPM version](https://img.shields.io/npm/v/application-compiler.svg?style=flat)](https://www.npmjs.com/package/application-compiler)
[![NPM downloads](https://img.shields.io/npm/dm/application-compiler.svg?style=flat)](https://www.npmjs.com/package/application-compiler)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/kartikk221/application-compiler.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/kartikk221/application-compiler/context:javascript)
[![GitHub issues](https://img.shields.io/github/issues/kartikk221/application-compiler)](https://github.com/kartikk221/application-compiler/issues)
[![GitHub stars](https://img.shields.io/github/stars/kartikk221/application-compiler)](https://github.com/kartikk221/application-compiler/stargazers)
[![GitHub license](https://img.shields.io/github/license/kartikk221/application-compiler)](https://github.com/kartikk221/application-compiler/blob/master/LICENSE)

## Motivation
This package aims to bring an "include" method to Node applications that performs similar to include implementations in other languages such as PHP. Unlike Node's built in module system, this compiler aims to allow for the usage of simple calls such as `include('/routes/api/v1/login.js')` in your code and produces a compiled javascript file with all include calls converted into their respective code simulating a direct include into exact call line position.

## Features
- Simple-to-use API
- Sub-File Support
- Nested Infinite Include Loop Protection
- Instantaneous Hot Reloading
- Memory Efficient
- Supports Windows, Linux & MacOS
- Relative Error Traces

## Installation
Application Compiler can be installed using node package manager (`npm`)
```
npm i application-compiler
```

## Table Of Contents
- [Application Compiler: Single File Applications Re-Imagined](#application-compiler-single-file-applications-re-imagined)
  - [Motivation](#motivation)
  - [Features](#features)
  - [Installation](#installation)
  - [Table Of Contents](#table-of-contents)
  - [Examples](#examples)
      - [Application Compiler With Automatic File Writing](#application-compiler-with-automatic-file-writing)
      - [Application Compiler With Custom Processing](#application-compiler-with-custom-processing)
  - [Compiler](#compiler)
      - [Constructor Options](#constructor-options)
      - [Compiler Properties](#compiler-properties)
      - [Compiler Methods](#compiler-methods)
  - [License](#license)

## Examples
Below are some examples making use of Compiler methods and properties.

#### Application Compiler With Automatic File Writing
```javascript
const ApplicationCompiler = require('application-compiler');

// Create compiler instance for the root file which is index.js
const website_compiler = new ApplicationCompiler({
    file_path: './index.js'
});

// Initiate automatic file writing
website_compiler.write_to({
    path: './',
    file_name: 'compiled_exec.js', // Run this using a process manager such as PM2
    relative_errors: true, // We want custom error traces for faster debugging
});

// Bind an error logger
website_compiler.set_error_logger((path, error) => {
    // Send the error and path to your own internal systems
});

// Bind an event logger to log underlying events during development
website_compiler.set_logger((message) => {
    console.log(`[COMPILER] ${message}`); 
});
```

#### Application Compiler With Custom Processing
```javascript
const ApplicationCompiler = require('application-compiler');

// Create compiler instance for the root file which is index.js
const website_compiler = new ApplicationCompiler({
    file_path: './index.js'
});

// Initiate a recalibration handler which will trigger custom processing on content changes
website_compiler.on_recalibration(() => {
    let compiled_code = website_compiler.compiled;
    // Do your own custom processing/compiled file writing here
});

// Bind an error logger
website_compiler.set_error_logger((path, error) => {
    // Send the error and path to your own internal systems
});

// Bind an event logger to log underlying events during development
website_compiler.set_logger((message) => {
    console.log(`[COMPILER] ${message}`); 
});
```

## Compiler
Below is a breakdown of the `Compiler` class generated when creating a application compiler instance.

#### Constructor Options
* `file_path` [`String`]: Path to the root/entry javascript file.
  * **Example**: `./master.js`
  * **Required** for a [Compiler](#compiler) Instance.
* `watcher_delay` [`Number`]: Delay to enforce between FileWatcher updates in **milliseconds**.
  * **Default**: `250`
* `include_tag` [`String`]: Name of include method used during compilation.
  * **Default**: `include`
  * **Example**: `include` will convert all `include(path)` to their respective compiled code.

#### Compiler Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `compiled` | `String` | Returns compiled application code. |
| `chunks` | `Object` | Contains nested objects which represent compiled code. |
| `pool` | `WatcherPool` | Contains underlying `WatcherPool` instance. |
| `watchers` | `Object` | Contains `FileWatcher` instances with their handlers. |

#### Compiler Methods
* `write_to(Object: options)`: Begins automatic file writing on content changes.
    * `options`: Automatic compilation options.
      * `path`[`String`]: Specifies where compiled file is written.
      * `file_name`[`String`]: Specifies the name of the compiled file.
        * **Default**: `compiled_{root_file_name}.js`
      * `write_delay`[`Number`]: Enforces delay between fast file writes in **milliseconds**.
        * **Default**: `250`
      * `relative_errors`[`Boolean`]: Enables contextually relative Error traces for compile-time/syntax errors.
        * **Default**: `true`
        * **Note** Errors will be written directly into compiled file.
      * `runtime_relative_errors`[`Boolean`]: Enables contextually relative Error traces for run-time errors including uncaught promise exceptions.
        * **Default**: `true`
        * **Note** This will simply log the Error trace and exit the program.
        * **Custom Handler**: Use the following code anywhere in your application to handle relative error traces: `require('application-compiler').log_relative_errors((String: error_trace) => { /* Your Code Here... */ })`
        * **Note** that you must call `process.exit(code)` at the end of your code for any custom handling above to ensure you restart the application.
    * **Note** using this method can allow for fast development due to the automatic compilation.
* `on_recalibration(Function: handler)`: Triggered when a file content change is detected and code is recompiled.
    * **Handler Example**: `() => {}`
    * **Note** this can be used to do your own post processing/file writing on content changes.
* `set_error_handler(Function: handler)`: Sets error logger for all errors that occur in compiler.
    * **Handler Example**: `(String: path, Error: error) => {}`
        * `path`: The path of the file where the internal error occured. 
        * `error`: The error object of the error that has occured.
    * **Note:** The usage of an error handler is recommended to log `FileSystem` errors.
* `set_logger(Function: logger)`: Sets logger for logging compiler events.
  * **Logger Example**: `(String: message) => {}`
    * `message`: Log message
  * **Message Format**: `Event -> Hierarchy`
    * **Event**: Type of action performed by compiler.
      * `INITIALIZED`: A new file has been loaded and is being watched.
      * `DETECTED_CHANGES`: A content change was detected triggering recalibration.
      * `DESTROYED`: This file has been destroyed and is no longer being watched.
    * **Hierarchy**: The hierarchy of inclusions for file separated by `/`
      * **Example**: `root.js/routes.js/login.js` where `root.js` is the `file_path` and event occured in `login.js`.
      * **Note**: Hierachy goes from root to specific inclusion.
* `destroy()`: Destroys compiler instance along with underlying `WatcherPool` and nested file instances.

## License
[MIT](./LICENSE)
