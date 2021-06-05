/**
 * Logs content to console with a timestamp and logger tag.
 *
 * @param {String} logger
 * @param {String} message
 * @param {Function} method - (message) => {}
 */
function log(logger = 'SYSTEM', message, method = console.log) {
    let dt = new Date();
    let timeStamp = dt
        .toLocaleString([], { hour12: true, timeZone: 'America/New_York' })
        .replace(', ', ' ')
        .split(' ');
    timeStamp[1] +=
        ':' + dt.getMilliseconds().toString().padStart(3, '0') + 'ms';
    timeStamp = timeStamp.join(' ');
    method(`[${timeStamp}][${logger}] ${message}`);
}

/**
 * Generates a random string of specified length.
 *
 * @param {Number} length
 * @returns {String} String
 */
function random_string(length = 10) {
    var result = [];
    var characters =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result.push(
            characters.charAt(Math.floor(Math.random() * charactersLength))
        );
    }
    return result.join('');
}

/**
 * This method breaks down a path into array based hierarchy strings.
 *
 * @param {String} path Path value for decoupling
 * @param {String} sys_root_prefix System root prefix for empty value representation
 * @returns {Array} Array
 */
function path_to_chunks(
    path,
    ignore_trailing_slash = false,
    sys_root_prefix = '_sys_root'
) {
    // Handle relative scenario
    if (path === './') return ['.', ''];

    // Remove trailing slash
    if (path.endsWith('/') && !ignore_trailing_slash)
        path = path.substr(0, path.length - 1);

    // Add a relative lead path for absolute initial path scenarios
    if (!path.startsWith('./') && !path.startsWith('/')) path = './' + path;
    let chunks = path.split('/');

    // Convert empty lead value to system root prefix
    if (chunks[0].length == 0) chunks[0] = sys_root_prefix;
    return chunks;
}

/**
 * This method joins provided path chunks from the path_to_chunks method.
 *
 * @param {Array} chunks
 * @param {String} sys_root_prefix
 * @returns {String} String
 */
function chunks_to_path(chunks, sys_root_prefix = '_sys_root') {
    // Convert system root prefix back to empty space
    if (chunks[0] === sys_root_prefix) chunks[0] = '';
    return chunks.join('/');
}

function absolute_file_path(path, context = '/') {
    // represent system root as relative -> './'
    let chunks = path_to_chunks(path, false, '.');
    let context_chunks = path_to_chunks(context);

    // Traverse through path relative references such as ../ up to chunks.length - 1
    for (let i = 0; i < chunks.length - 1; i++) {
        let current = chunks[i];
        if (current == '..') {
            if (context_chunks.length > 1) context_chunks.pop();
        } else if (current !== '.') {
            context_chunks.push(current);
        }
    }

    // Append path file name at the end of context chunks
    context_chunks.push(chunks[chunks.length - 1]);

    return chunks_to_path(context_chunks);
}

/**
 * Duplicates provided Array.
 *
 * @param {Array} array
 * @returns {Array} Array
 */
function copy_array(array) {
    let result = [];
    for (let i = 0; i < array.length; i++) result.push(array[i]);
    return result;
}

/**
 * Repeats specified character until length is reached.
 *
 * @param {String} char
 * @param {Number} length
 * @returns {String} String
 */
function repeat_character(char, length) {
    return ''.padStart(length, char);
}

module.exports = {
    log: log,
    random_string: random_string,
    path_to_chunks: path_to_chunks,
    chunks_to_path: chunks_to_path,
    absolute_file_path: absolute_file_path,
    copy_array: copy_array,
    repeat_character: repeat_character,
};
