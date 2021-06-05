const FileSystem = require('fs');
const {
    path_to_chunks,
    chunks_to_path,
    copy_array,
    absolute_file_path,
} = require('../shared/operators.js');

class NestedLiveFile {
    #hierarchy;
    #directory_path;
    #file_name;
    #path;
    #tags;
    #content = '';
    #watcher_id;
    #watcher_pool;
    #initialized = false;
    #forbidden = [];
    #file_store = {};
    #nested_pointers = [];
    #handlers = {
        logger: (message) => {},
        recalibrate: () => {},
        error: (error) => {},
    };

    constructor({
        path,
        tags,
        watcher_pool,
        forbidden = [],
        hierarchy = null,
    }) {
        // Store constructor data
        this.#path = path;
        this.#tags = tags;
        this.#watcher_pool = watcher_pool;

        // Parse directory path from file path
        this.#directory_path = path_to_chunks(path);
        this.#file_name = this.#directory_path[this.#directory_path.length - 1];
        this.#directory_path.pop();
        this.#directory_path = chunks_to_path(this.#directory_path);

        // Duplicate forbidden files array to pass down to nested files
        this.#forbidden = copy_array(forbidden);
        this.#forbidden.push(this.#path);

        // Initiate watcher and perform initial reload/recalibration
        this._init_watcher();
        this._reload_content();

        // Determine file hierarchy
        if (hierarchy == null) {
            this.#hierarchy = this.#file_name;
        } else {
            this.#hierarchy = hierarchy + '/' + this.#file_name;
        }
    }

    /**
     * Binds handler for specified type event.
     *
     * @param {String} type
     * @param {Function} handler
     */
    handle(type, handler) {
        if (this.#handlers[type] == undefined)
            throw new Error(`${type} event is not supported on LiveFile.`);

        this.#handlers[type] = handler;
    }

    /**
     * This method can be used to destroy current live file and its watcher.
     */
    destroy() {
        let reference = this;
        this._log(`DESTROYED -> ${this.#hierarchy}`);
        this.#watcher_pool.unwatch(this.#path, this.#watcher_id);

        // Clean up pointers & nested files
        this.#nested_pointers = [];
        Object.keys(this.#file_store).forEach((path) => {
            reference.#file_store[path].destroy();
            delete reference.#file_store[path];
        });
    }

    /**
     * INTERNAL METHOD!
     * Alias of this.#handlers.logger(message)
     *
     * @param {String} message
     */
    _log(message) {
        return this.#handlers.logger(message);
    }

    /**
     * INTERNAL METHOD!
     * This method initiates the FileWatcher used for current live file.
     * Stores watcher id in private variable.
     */
    _init_watcher() {
        let reference = this;
        FileSystem.access(this.#path, (error) => {
            // Throw error over passthrough handler
            if (error) return reference.#handlers.error(reference.#path, error);

            // Create watcher once path has been verified
            reference.#watcher_id = this.#watcher_pool.watch(
                reference.#path,
                (e, f) => reference._reload_content()
            );
        });
    }

    /**
     * INTERNAL METHOD!
     * This method reads/updates content for current live file.
     */
    _reload_content(recalibrate = true) {
        let reference = this;
        FileSystem.readFile(
            this.#path,
            {
                encoding: 'utf8',
            },
            (error, content) => {
                // Determine file attributes and boundary comments
                let path = reference.#path;
                let file_name = reference.#file_name;

                // Report error through error handler
                if (error) {
                    this.#content = `//_ INVALID_FILE | ${file_name} | ${path} _//\n`;
                    return reference._log(
                        `READ_ERROR -> ${reference.#hierarchy}`
                    );
                }

                // Update content and trigger reload event
                let lines = ((content || '').match(/\n/g) || []).length + 3;
                let start_comment = `//_ START_FILE | ${file_name} | ${path} | ${lines} LINES _//\n`;
                let end_comment = `\n//_ END_FILE | ${file_name} | ${path} | ${lines} LINES _//`;
                reference.#content = start_comment + content + end_comment;

                // Trigger chunk recalibration if specified by reload call parameter
                if (recalibrate) reference._recalibrate();
            }
        );
    }

    /**
     * Returns whether provided char is a valid function syntax char
     *
     * @param {String} char
     * @returns {Boolean} Boolean
     */
    _valid_func_char(char) {
        return (
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.'.indexOf(
                char
            ) > -1
        );
    }

    /**
     * INTERNAL METHOD!
     * Parses file path from a given string containing syntax wrap characters.
     *
     * @param {String} content
     * @returns {String} String
     */
    _parse_file_path(content) {
        let file_path = content.split(')')[0];

        // Filter file_path to remove string containing characters
        let filter_chars = ["'", '"', '`'];
        file_path = file_path
            .split('')
            .filter((char) => !filter_chars.includes(char))
            .join('');

        return chunks_to_path(path_to_chunks(file_path));
    }

    /**
     * INTERNAL METHOD!
     * This method returns the content before first newline occurence.
     * specifying left to true/false can be used to control direction.
     *
     * @param {String} content
     * @param {Boolean} left
     * @returns {String} String
     */
    _from_newline(content, left = true) {
        content = content.split('\n');
        if (left) {
            return content[content.length - 1];
        } else {
            return content[0];
        }
    }

    /**
     * Retrieves nested files from include calls in file content.
     *
     * @returns {Object} Object
     */
    _get_included_files() {
        let files = {};
        let paths = {};

        // Splits content into chunks based on "include(" prefix to detect possible calls
        let include_tag = this.#tags.inline_include;
        let chunks = this.#content.split(include_tag + '(');

        // Iterate through all potential chunks to find nested files
        let line_offset = 0;
        for (let i = 0; i < chunks.length; i++) {
            let current = chunks[i];
            let left = chunks[i - 1];
            let lines_count = ((left || '').match(/\n/g) || []).length + 1;
            let line_position = line_offset + lines_count;

            // Ensure a valid include call with a closure exists
            if (left && current.indexOf(')') > -1) {
                // Derive last character before call initiation to ensure no alphanumeric character preceeds it
                let last_left_char = left[left.length - 1];
                let valid_last_char = this._valid_func_char(last_left_char);

                // Derive potential file path of the include call
                let file_path = this._parse_file_path(current);
                if (!valid_last_char && file_path.length > 0) {
                    let left_content = this._from_newline(left, true);

                    // Determine if include call is commented in code
                    let single_commment = left_content.indexOf('//') > -1;
                    let multi_left = left_content.indexOf('/*') > -1;
                    let multi_right = left_content.indexOf('*/') == -1;
                    let multi_comment = multi_left && multi_right;

                    // Proceed if the call is not commented in code
                    if (!single_commment && !multi_comment) {
                        // Determine absolute system path for FileSystem APIs
                        let absolute_path = absolute_file_path(
                            file_path,
                            this.#directory_path
                        );

                        // Ensure the absolute path is not forbidden to prevent infinite nesting
                        if (!this.#forbidden.includes(absolute_path)) {
                            let spacing = left_content.length;

                            // Store references by line position to representing pointers
                            paths[absolute_path] = true;
                            files[line_position] = {
                                path: absolute_path,
                                spacing: spacing,
                            };
                        } else {
                            // Report infinite inclusion loops through error handler when absolute path matches a forbidden path
                            this.#handlers.error(
                                this.#path,
                                new Error(
                                    `Potential infinite inclusion loop detected at ${absolute_path}:${line_position}`
                                )
                            );
                        }
                    }
                }
            }

            if (left) line_offset += lines_count - 1;
        }

        return {
            files: files,
            paths: paths,
        };
    }

    /**
     * INTERNAL METHOD!
     * This method recalibrates nested/contained files based on content.
     */
    _recalibrate() {
        // Retrieve file inclusions
        let reference = this;
        let nested_data = this._get_included_files();
        let included_files = nested_data.files;
        let included_paths = nested_data.paths;

        // Remove old file pointers and references
        let current_pointers = {};
        this.#nested_pointers = this.#nested_pointers.filter((pointer) => {
            let verdict = true;
            let path = pointer.path;
            let line_position = pointer.line;
            let nested_file = reference.#file_store[path];

            let position_check = included_files[line_position];

            // Check whether a valid include call with matching exists at line position
            if (position_check == undefined || position_check.path !== path)
                verdict = false;

            // Decrease nested_file pointers to keep track of whether this nested file is still needed
            if (!verdict) {
                nested_file.pointers--;

                // Destroy nested file if it has no dependent pointers and the path is no longer included in nested data
                if (nested_file.pointers < 1 && !included_paths[path]) {
                    nested_file.destroy();
                    delete reference.#file_store[path];
                }
            }

            // Store current pointers in object faster referencing in next loop
            if (verdict) current_pointers[line_position] = path;

            return verdict;
        });

        // Create new file pointers and references
        let sort_pointers = false;
        Object.keys(included_files).forEach((line_position) => {
            let new_pointer = included_files[line_position];
            let pointer_check = current_pointers[line_position] === undefined;
            if (pointer_check) {
                let path = new_pointer.path;
                let spacing = new_pointer.spacing;

                // Create new nested file reference in file store if one does not exist
                if (reference.#file_store[path] == undefined) {
                    let nested_file = new NestedLiveFile({
                        path: path,
                        tags: reference.#tags,
                        watcher_pool: reference.#watcher_pool,
                        forbidden: reference.#forbidden,
                        hierarchy: reference.#hierarchy,
                    });

                    // Bind passthrough logger
                    nested_file.handle('logger', (message) =>
                        this.#handlers.logger(message)
                    );

                    // Bind passthrough error handler
                    nested_file.handle('error', (path, error) =>
                        reference.#handlers.error(path, error)
                    );

                    // Bind passthrough recalibrate handler
                    nested_file.handle('recalibrate', () =>
                        reference.#handlers.recalibrate()
                    );

                    // Initiate nested file into file store with 0 pointers
                    nested_file.pointers = 0;
                    reference.#file_store[path] = nested_file;
                }

                // Iterate nested file pointers to signify multiple inclusion calls
                reference.#file_store[path].pointers++;

                // Push pointer to nested pointers and mark for re-sorting
                sort_pointers = true;
                reference.#nested_pointers.push({
                    line: line_position,
                    path: path,
                    spacing: spacing,
                });
            }
        });

        // Sort pointers from lowest to highest line positions
        if (sort_pointers)
            this.#nested_pointers.sort((a, b) => a.line - b.line);

        if (!this.#initialized) {
            this.#initialized = true;
            this._log(`INITIALIZED -> ${this.#hierarchy}`);
        } else {
            this._log(`DETECTED_CHANGES -> ${this.#hierarchy}`);
        }

        this.#handlers.recalibrate();
    }

    /* LiveFile Getters */
    get name() {
        return this.#file_name;
    }

    get path() {
        return this.#path;
    }

    get content() {
        return this.#content;
    }

    get chunks() {
        let reference = this;
        let lines = this.#content.split('\n');

        // Replace include calls by reference file's content
        this.#nested_pointers.forEach((pointer) => {
            let path = pointer.path;
            let line_position = pointer.line;
            let insert_line = +line_position - 1;
            let spacing = pointer.spacing;
            let nested_file = reference.#file_store[path];

            // Create reference for nested file in lines object
            lines[insert_line] = nested_file.chunks;
            lines[insert_line].line = +line_position;
            lines[insert_line].spacing = spacing;
        });

        return {
            path: this.#path,
            line: 1,
            spacing: 0,
            content: lines,
        };
    }
}

module.exports = NestedLiveFile;
