const Path = require('path');
const FileSystem = require('fs');
const NestedLiveFile = require('./NestedLiveFile.js');
const WatcherPool = require('./WatcherPool.js');
const { exec } = require('child_process');
const {
    path_to_chunks,
    chunks_to_path,
    repeat_character,
} = require('../shared/operators.js');

class Compiler {
    #root_file;
    #watcher_pool;
    #watcher_delay = 250;
    #tags = {
        inline_include: 'include',
    };

    #write_to = {
        initial_write: false,
        path: null,
        file_name: null,
        last_write: 0,
        write_delay: 250,
        pending: false,
        relative_errors: true,
        runtime_relative_errors: true,
    };

    #methods = {
        logger: (message) => {},
        recalibrate: () => {},
        error: (path, error) => {},
    };

    constructor({
        file_path,
        watcher_delay = 250,
        include_tag = 'include',
        __proto_instance,
    }) {
        // Do not treat current instance as a compiler instance if it is a prototype instance
        if (__proto_instance === true) return;

        // Verify and parse constructor options
        this._parse_options({
            file_path,
            watcher_delay,
            include_tag,
        });

        // Create Watcher Pool
        this.#watcher_pool = new WatcherPool(this.#watcher_delay);

        // Bind error handler to watcher pool
        this.#watcher_pool.handle('error', (path, error) =>
            this.#methods.error(path, error)
        );

        // Create Root File Instance
        this.#root_file = new NestedLiveFile({
            path: file_path,
            tags: this.#tags,
            watcher_pool: this.#watcher_pool,
            forbidden: [file_path],
        });

        // Bind logger handler for file instance
        this.#root_file.handle('logger', (message) =>
            this.#methods.logger(message)
        );

        // Bind error handler for file instance
        this.#root_file.handle('error', (path, error) =>
            this.#methods.error(path, error)
        );

        // Bind recalibration handler for file instance
        this.#root_file.handle('recalibrate', () => this._on_recalibration());
    }

    /**
     * INTERNAL METHOD!
     *  This method is used to verify constructor option types
     *
     */
    _parse_options({ file_path, watcher_delay, include_tag }) {
        if (typeof file_path !== 'string')
            throw new Error('file_path must be a String');

        if (typeof watcher_delay !== 'number')
            throw new Error('watcher_delay must be a Number in milliseconds');
        this.#watcher_delay = watcher_delay;

        if (typeof include_tag !== 'string')
            throw new Error('include_method must be a String');
        this.#tags.inline_include = include_tag;
    }

    /**
     * Sets logger for compiler instance.
     *
     * @param {Function} method
     */
    set_logger(method) {
        if (typeof method !== 'function')
            throw new Error('set_logger(method) -> method must be a Function');

        this.#methods.logger = method;
    }

    /**
     * Sets error handler for compiler instance.
     *
     * @param {Function} handler
     */
    set_error_handler(handler) {
        if (typeof handler !== 'function')
            throw new Error(
                'set_error_handler(handler) -> handler must be a Function'
            );

        this.#methods.error = handler;
    }

    /**
     * Sets recalibration event handler for compiler instance.
     *
     * @param {Function} handler
     */
    on_recalibration(handler) {
        if (typeof handler !== 'function')
            throw new Error(
                'on_recalibration(handler) -> handler must be a Function'
            );

        this.#methods.recalibrate = handler;
    }

    /**
     * This method is used to initiate the hot reload compiled file writing sequence.
     *
     * @param {String} options.path
     * @param {String} options.file_name
     * @param {Number} options.write_delay
     * @param {Boolean} options.relative_errors
     */
    write_to({
        path,
        file_name,
        write_delay,
        relative_errors,
        runtime_relative_errors,
    }) {
        // Determine write_to path
        if (typeof path !== 'string')
            throw new Error(
                `write_to(options) -> options.path is a required string`
            );
        this.#write_to.path = chunks_to_path(path_to_chunks(path));

        // Determine write_to file name or auto generate
        if (typeof file_name == 'string') {
            this.#write_to.file_name = file_name;
        } else {
            this.#write_to.file_name = `compiled_${this.#root_file.name}`;
        }

        // Set write_delay if it is a valid number type
        if (typeof write_delay == 'number')
            this.#write_to.write_delay = write_delay;

        // Set relative_errors if it is a valid boolean type
        if (typeof relative_errors == 'boolean')
            this.#write_to.relative_errors = relative_errors;

        // Set runtime_relative_errors if it is a valid boolean type
        if (typeof runtime_relative_errors == 'boolean')
            this.#write_to.runtime_relative_errors = runtime_relative_errors;
    }

    /**
     * INTERNAL METHOD!
     * Handles exception from global handler when relative error logging is enabled.
     *
     * @param {Compiler} compiler
     * @param {Error} error
     * @param {String} compiled
     * @param {Function} handler
     */
    static _on_exception(compiler, error, compiled, handler) {
        let error_string = error.stack;
        let relative_error = compiler._relativize_error(
            error_string,
            compiled,
            true
        );

        if (typeof handler == 'function') {
            handler(relative_error);
        } else {
            console.error(relative_error);
            process.exit(1);
        }
    }

    /**
     * Binds global error exception handler which will log relative error traces
     */
    static log_relative_errors(handler) {
        let active = process.env['c_relative_errors_active'] === true;
        if (!active) {
            process.env['c_relative_errors_active'] = true;
            FileSystem.readFile(
                process.argv[1].split('\\').join('/'),
                {
                    encoding: 'utf8',
                },
                (error, compiled) => {
                    const compiler = new Compiler({
                        __proto_instance: true,
                    });

                    // Log self read error
                    if (error) {
                        console.log(
                            'Failed to read self content on log_relative_errors() call:'
                        );
                        return console.log(error);
                    }

                    // Bind uncaughtException handler
                    process.on('uncaughtException', (error, origin) =>
                        this._on_exception(compiler, error, compiled, handler)
                    );

                    // Bind unhandledRejection handler
                    process.on('unhandledRejection', (reason, promise) =>
                        promise.catch((error) =>
                            this._on_exception(
                                compiler,
                                error,
                                compiled,
                                handler
                            )
                        )
                    );
                }
            );
        }
    }

    /**
     * Destroys compiled instance and cleans up all underlying watcher instances
     */
    destroy() {
        this.#root_file.destroy();
        this.#watcher_pool.destroy();
    }

    /**
     * This method tests the syntax of the write_to file
     *
     * @returns {Promise} Promise -> Reject[String] OR Resolve[undefined]
     */
    _test_syntax() {
        let reference = this;
        return new Promise((resolve, reject) => {
            const { path, file_name } = reference.#write_to;
            exec(
                `node -c ${path}${file_name}`,
                {
                    windowsHide: true,
                },
                (error, stdout, stderr) => {
                    if (error) return reject(stderr);
                    return resolve();
                }
            );
        });
    }

    /**
     * Stringifies compiled chunks into combined lines.
     *
     * @param {Object} chunks
     * @param {Number} spacing
     * @returns {String} String
     */
    _stringify_chunks(chunks, spacing = 0) {
        let contents = chunks ? chunks.content : undefined;

        // Ensure valid chunks can be determined
        if (contents == undefined) return;

        // Convert nested references to stringified lines
        for (let i = 0; i < contents.length; i++) {
            let current = contents[i];

            // Add spacing if greater than 0 to all lines
            if (spacing > 0)
                contents[i] = repeat_character(' ', spacing) + contents[i];

            // Recursively stringify nested files
            if (typeof current == 'object') {
                contents[i] = this._stringify_chunks(
                    current,
                    spacing + current.spacing
                );
            }
        }

        return contents.join('\n');
    }

    /**
     * INTERNAL METHOD!
     * Retrieves path data based on self specification for schematic parsing.
     *
     * @param {Boolean} self
     * @returns {Object} Object
     */
    _path_data(self) {
        if (self) {
            let chunks = path_to_chunks(process.argv[1].split('\\').join('/'));
            return {
                name: chunks[chunks.length - 1],
                path: chunks_to_path(chunks),
            };
        } else {
            const { file_name, path } = this.#write_to;
            return {
                name: file_name,
                path: path + file_name,
            };
        }
    }

    /**
     * INTERNAL METHOD!
     * Retrieves error line from error stack trace.
     *
     * @param {String} str
     * @param {String} file_name
     * @returns {Number} Number OR undefined
     */
    _error_line(str, file_name) {
        if (str.indexOf(file_name + ':') > -1)
            return +str.split(file_name + ':')[1].split(':')[0];
    }

    /**
     * INTERNAL METHOD!
     * Parses boundary statement data from current line
     *
     * @param {String} string
     * @returns {Object} Object
     */
    _boundary_statement(string) {
        let prefixes = {
            type_start: '//_ START_FILE | ',
            type_end: '//_ END_FILE | ',
            b_end: ' LINES _//',
        };
        let start_prefix = string.indexOf(prefixes.type_start) > -1;
        let end_prefix = string.indexOf(prefixes.type_end) > -1;
        let start_check = start_prefix || end_prefix;
        let end_check = string.indexOf(prefixes.b_end) > -1;
        if (start_check && end_check) {
            if (start_prefix) {
                string = 'START | ' + string.split(prefixes.type_start)[1];
            } else {
                string = 'END | ' + string.split(prefixes.type_end)[1];
            }
            return string.split(' | ');
        }
    }

    /**
     * Returns relative file path and total line count for compiled line position.
     *
     * @param {Number} line
     * @param {Array} chunks
     * @returns {Object} Object
     */
    _relative_file(line, chunks) {
        // Iterate line down by 1 due to array 0th position offset
        line--;

        // Initialize cursors and move count
        let result = null;
        let move_count = 0;
        let cursor_up = chunks[line];
        let cursor_down = chunks[line];

        while (result == null && (cursor_up || cursor_down)) {
            // Check line from cursor_up if it exists
            if (cursor_up) {
                let boundary = this._boundary_statement(cursor_up);
                if (boundary && boundary[0].indexOf('START') > -1) {
                    let path = boundary[2];
                    let total_lines = +boundary[3].split(' ')[0];
                    result = {
                        path: path,
                        total_lines: total_lines,
                        relative_line: move_count,
                    };
                }
            }

            // Check line from cursor_down if it exists
            if (cursor_down) {
                let boundary = this._boundary_statement(cursor_down);
                if (boundary && boundary[0].indexOf('END') > -1) {
                    let path = boundary[2];
                    let total_lines = +boundary[3].split(' ')[0];
                    result = {
                        path: path,
                        total_lines: total_lines,
                        relative_line: total_lines - move_count - 1,
                    };
                }
            }

            // Traverse cursors in both directions while keeping count of movement
            move_count++;
            cursor_up = chunks[line - move_count];
            cursor_down = chunks[line + move_count];
        }

        // result.path && result.relative_line && result.total_lines
        if (result !== null) return result;
    }

    /**
     * INTERNAL METHOD!
     * Logs provided error with a relativized stack trace.
     *
     * @param {Error} error
     * @param {String} compiled
     * @param {Boolean} self
     */
    _relativize_error(error, compiled, self = true) {
        // Stringify error and convert backslashes to forward slashes to support Windows
        let error_string = typeof error !== 'string' ? error.toString() : error;
        error_string = error_string.split('\\').join('/'); // Replace all backwards slashes with forward slash

        let reference = this;
        let path_data = this._path_data(self);
        let compiled_chunks = compiled.split('\n');
        let error_chunks = error_string.split('\n');
        for (let i = 0; i < error_chunks.length; i++) {
            let current = error_chunks[i];
            let error_line = reference._error_line(current, path_data.name);
            if (error_line) {
                current = current.split(' ');

                // Attempt to only overwrite chunk with path and preserve as much content in current line as possible
                for (let cx = 0; cx < current.length; cx++) {
                    let cx_current = current[cx];
                    let error_line = reference._error_line(
                        cx_current,
                        path_data.name
                    );

                    if (error_line) {
                        let relative_file = reference._relative_file(
                            error_line,
                            compiled_chunks
                        );

                        if (relative_file) {
                            // Replace current trace with absolute relativized trace
                            let absolute_trace = `[${Path.resolve(
                                relative_file.path
                            )}:${relative_file.relative_line}]`;
                            current[cx] = absolute_trace;
                        }
                    }
                }

                error_chunks[i] = current.join(' ');
            }
        }

        return error_chunks.join('\n');
    }

    _write_file(path, content) {
        return new Promise((resolve, reject) => {
            FileSystem.writeFile(
                path,
                content,
                {
                    encoding: 'utf8',
                },
                (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * INTERNAL METHOD!
     * Triggers compiled file writing sequence based on write_to settings.
     *
     */
    async _perform_write() {
        // Spread write_to configuration
        const {
            file_name,
            path,
            last_write,
            write_delay,
            pending,
            initial_write,
            relative_errors,
            runtime_relative_errors,
        } = this.#write_to;

        // Check for sufficient delay between last write
        let difference = Date.now() - last_write;
        if (difference < write_delay) {
            // Create a delayed timeout to perform a write after sufficient delay has passed
            if (!pending) {
                this.#write_to.pending = true;
                setTimeout(
                    (reference) => reference._perform_write(),
                    write_delay - difference,
                    this
                );
            }
            return;
        }

        // Write compiled file to specified path
        let reference = this;
        this.#write_to.pending = false;
        this.#write_to.last_write = Date.now();

        // Do not perform write on first recalibration as nested file discovery has not finished yet
        if (!initial_write) return (this.#write_to.initial_write = true);

        // Generate compiled content and write to specified file name
        let compiled_content = this.compiled;

        // Inject Compiler.log_relative_errors() call to compiled content beginning
        let relative_logger_code =
            "require('application-compiler').log_relative_errors();\n";
        if (relative_errors && runtime_relative_errors)
            compiled_content = relative_logger_code + compiled_content;

        // Perform compiled content write
        try {
            await this._write_file(path + file_name, compiled_content);

            // Perform post processing if relative errors have been requested
            if (relative_errors) {
                // Test for syntax errors
                try {
                    await reference._test_syntax();
                } catch (syntax_error) {
                    let relative_trace = reference._relativize_error(
                        syntax_error,
                        compiled_content,
                        false
                    );

                    relative_trace = relative_trace.split('\\').join('\\\\');

                    // Log Syntax Error
                    reference.#methods.logger(`SYNTAX_ERROR -> NO_HIERARCHY`);

                    // Overwrite compiled file with trace log
                    let trace_code = `console.error(\`${relative_trace}\`);
                    process.exit(1);`;
                    await this._write_file(path + file_name, trace_code);
                }
            }
        } catch (error) {
            return this.#methods.error(path, error);
        }
    }

    /**
     * INTERNAL METHOD!
     * Handles nested file triggered recalibrate event
     */
    _on_recalibration() {
        // Write file content if write_to is enabled
        if (this.#write_to.path !== null) this._perform_write();

        // Trigger user handled recalibrate event
        this.#methods.recalibrate();
    }

    /* Compiler Getters */
    get pool() {
        return this.#watcher_pool;
    }

    get watchers() {
        return this.#watcher_pool.pool;
    }

    get chunks() {
        return this.#root_file.chunks;
    }

    get compiled() {
        let chunks = this.chunks;
        let compiled_string = this._stringify_chunks(chunks);
        return compiled_string;
    }
}

module.exports = Compiler;
