const Compiler = require('../index.js');
const test_compiler = new Compiler({
    file_path: './app/entry.js',
});

test_compiler.set_logger((message) => console.log(`[COMPILER] ${message}`));

test_compiler.set_error_handler((path, error) => {
    console.log('ERROR @ ' + path);
    console.log(error);
});

test_compiler.write_to({
    path: './',
});
