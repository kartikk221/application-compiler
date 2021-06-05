require('application-compiler').log_relative_errors();
//_ START_FILE | entry.js | ./app/entry.js | 9 LINES _//
const URL = require('url');
const FileSystem = require('fs');
const compiler = require('../index.js');
// Some random code here

//_ START_FILE | operators.js | ./app/scripts/operators.js | 14 LINES _//
const some_cache = {};

function rand() {
    return Math.random();
}

if (true) {
    //_ START_FILE | test.js | ./app/scripts/modules/test.js | 9 LINES _//
    // include('../operators.js'); # this line should not be included
    let hello_world = 2;
    let hello = false;
    
    // This contains test.js stuff above
    console.log('hi');
    
    //_ END_FILE | test.js | ./app/scripts/modules/test.js | 9 LINES _//
}

let some_last_variable = Math.random();

//_ END_FILE | operators.js | ./app/scripts/operators.js | 14 LINES _//

//_ END_FILE | entry.js | ./app/entry.js | 9 LINES _//