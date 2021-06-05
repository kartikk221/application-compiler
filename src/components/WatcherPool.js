const FileSystem = require('fs');

class WatcherPool {
    #id = 0;
    #id_max = Number.MAX_SAFE_INTEGER - 1000;
    #watchers = {};
    #watcher_delay = 250;
    #call_delay = 150;
    #statistics = {
        watchers: 0,
        handlers: 0,
    };

    #methods = {
        error: (path, error) => {},
    };

    constructor(watcher_delay = 250, call_delay = 150) {
        this.#watcher_delay = watcher_delay;
        this.#call_delay = call_delay;
    }

    /**
     * This method binds a watcher for a specified path.
     *
     * @param {String} path
     * @param {Function} handler
     * @returns {Number} Number - Iterated ID
     */
    watch(path, handler) {
        // Create new watcher instance if none exists
        if (this.#watchers[path] == undefined) {
            this.#watchers[path] = {
                last_update: Date.now() - this.#watcher_delay,
                watcher: FileSystem.watch(
                    path,
                    {
                        encoding: 'utf8',
                    },
                    (e, f) => this._handle_update(path, e, f)
                ),
                handlers: [],
            };

            // Bind error handler for filewatcher
            this.#watchers[path].watcher.on('error', (error) =>
                this.#methods.error(path, error)
            );

            this.#statistics.watchers++;
        }

        // Bind handler to handlers array for watcher
        let id = this._id();
        this.#statistics.handlers++;
        this.#watchers[path].handlers.push({
            id: id,
            call: handler,
        });

        // Return handler id for removal
        return id;
    }

    /**
     *
     * @param {String} path
     * @param {Number} handler_id
     */
    unwatch(path, handler_id) {
        // Verify a watcher for specified path exists
        if (this.#watchers[path]) {
            // Filter handlers array of watcher to remove specified handler id
            let handlers = this.#watchers[path].handlers;
            this.#statistics.handlers--;
            this.#watchers[path].handlers = handlers.filter(
                (h) => h.id !== handler_id
            );

            // Cleanup watcher instance if it has no more handlers bound to it
            if (this.#watchers[path].handlers.length == 0) {
                this.#watchers[path].watcher.close();
                this.#statistics.watchers--;
                delete this.#watchers[path];
            }
        }
    }

    /**
     * INTERNAL METHOD
     * Binds handler for specified type event.
     *
     * @param {String} type
     * @param {Function} handler
     */
    handle(type, handler) {
        if (this.#methods[type] == undefined)
            throw new Error(`${type} event is not supported on WatcherPool.`);

        this.#methods[type] = handler;
    }

    destroy() {
        // Destroy all watcher instances
        let reference = this;
        this.#watchers.forEach((path) => {
            let object = reference.#watchers[path];
            object.watcher.close();
            delete reference.#watchers[path];
        });
    }

    /**
     * Returns an iterated number ID.
     *
     * @returns {Number} Number
     */
    _id() {
        this.#id++;
        if (this.#id == this.#id_max) this.#id = 0;
        return this.#id;
    }

    /**
     * INTERNAL METHOD!
     * This method performs a delay check between last update to prevent
     * double filewatcher update events with specific operating systems.
     *
     * @param {String} path
     * @param {Boolean} touch
     * @returns {Boolean} Boolean
     */
    _delay_check(path, touch = true) {
        // If watcher exists, verify sufficient margin between last update and touch timestamp
        if (this.#watchers[path]) {
            let watcher = this.#watchers[path];
            let last_update = watcher.last_update;
            let watcher_delay = this.#watcher_delay;
            let result = Date.now() - last_update > watcher_delay;
            if (result && touch) watcher.last_update = Date.now();
            return result;
        }

        return false;
    }

    /**
     * INTERNAL METHOD!
     * This method handles the events triggered by the FileWatcher object.
     *
     * @param {String} path
     * @param {String} event
     * @param {String} file_name
     */
    _handle_update(path, event, file_name) {
        // Verify watcher exists and delay check passes
        if (this.#watchers[path] && this._delay_check(path)) {
            // Call all handlers belonging to this watcher with params
            setTimeout(
                (r, p, e, f) =>
                    r.#watchers[p].handlers.forEach((h) => h.call(e, f)),
                this.#call_delay,
                this,
                path,
                event,
                file_name
            );
        }
    }

    /* WatcherPool Getters */
    get pool() {
        return this.#watchers;
    }

    get watcher_delay() {
        return this.#watcher_delay;
    }

    get watchers() {
        return this.#statistics.watchers;
    }

    get handlers() {
        return this.#statistics.handlers;
    }
}

module.exports = WatcherPool;
