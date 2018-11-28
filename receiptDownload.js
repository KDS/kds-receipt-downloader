 // Dependencies
var os = require('os');
var fs = require('fs');
var path = require('path');
var https = require('https');
var url = require('url');
var sax = require('sax');
var csv = require('csv-parser');

// Configuration
const csvSeparator = ';';
const requestTimeout = 60000;
const errorLogFile = 'error.log';
// const proxy = "127.0.0.1:8888";
https.globalAgent.maxSockets = 20;

// Initializations
var authToken = null;
var exportFilePath = null;
var outputDirectory = null;
var downloadCount = 0;
var skipCount = 0;
var errorCount = 0;
var useProxy = typeof proxy !== 'undefined';
var proxyDetails = useProxy ? proxy.split(':') : [];

process.on('exit', function(code) {
    if (code == -1) return;
    console.log('');
    console.log('Statistics');
    console.log('duration: %ss', process.uptime());
    console.log('downloaded: %s', downloadCount);
    console.log('skipped: %s', skipCount);
    console.log('error: %s', errorCount);
});

parseArguments();
prepareErrorLogFile();

console.log('Started processing...');

if (exportFilePath.toLowerCase().endsWith('.xml')) {
    processXmlExportFile();
} else {
    processCsvExportFile();
}

function printUsageAndExit() {
    console.log("node receiptDownload -t {Authentication Token} -f {Export File} -o {Output Directory}");
    process.exit(-1);
}

function parseArguments() {
    if (process.argv.length != 8) {
        printUsageAndExit();
    } else {
        for (var i = 2; i <= process.argv.length - 2; i = i + 2) {
            if (!parseArgument(process.argv[i], process.argv[i + 1])) {
                printUsageAndExit();
            }
        }

        if (!authToken || !exportFilePath || !outputDirectory) {
            printUsageAndExit();
        }

        if ((!exportFilePath.toLowerCase().endsWith('.xml') && !exportFilePath.toLowerCase().endsWith('.csv')) || !fileExists(exportFilePath)) {
            console.log('Invalid export file');
            process.exit(-1);
        }

        if (!directoryExists(outputDirectory)) {
            console.log('Invalid output directory');
            process.exit(-1);
        }
    }
}

function parseArgument(argName, argValue) {
    switch (argName) {
        case '-t':
            authToken = argValue;
            return true;
        case '-f':
            exportFilePath = argValue;
            return true;
        case '-o':
            outputDirectory = argValue;
            return true;
        default:
            return false;
    }
}

function prepareErrorLogFile() {
    if (fileExists('error.log')) {
        fs.unlinkSync('error.log');
    }
    writeToErrorLog('ReceiptUrl', 'HttpStatusCode', 'ErrorMessage');
}

function writeToErrorLog(receiptUrl, httpStatusCode, errorMessage) {
    const cb = (err) => { if(err) throw err; }
    fs.appendFile(errorLogFile, [receiptUrl, '\t', httpStatusCode, '\t', errorMessage, os.EOL].join(''), cb);
}

function fileExists(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch (err) {
        return false;
    }
}

function directoryExists(dirPath) {
    try {
        return fs.statSync(dirPath).isDirectory();
    } catch (err) {
        return false;
    }
}

function deleteIfExists(filePath) {
    try {
        fs.unlinkSync(filePath);
    } catch (err) {}
}

function processXmlExportFile() {
    var fileStream = fs.createReadStream(exportFilePath);
    var saxParser = sax.createStream(true);
    var currentNode = '';

    saxParser.on('opentag', function(node) {
        currentNode = node.name;
    });

    saxParser.on('text', function(text) {
        if (currentNode == 'Receipt' || currentNode == 'VehicleRegistrationCertificate') {
            var receipt = text.trim();
            if (receipt) {
                downloadReceipt(receipt);
            }
        }
    });

    fileStream.pipe(saxParser);
}

function processCsvExportFile() {
    fs.createReadStream(exportFilePath)
        .pipe(csv({
            separator: csvSeparator
        }))
        .on('data', function(data) {
            if (data.Receipt) {
                downloadReceipt(data.Receipt);
            }
            
            if (data.VehicleRegistrationCertificate) {
                downloadReceipt(data.VehicleRegistrationCertificate);
            }
        });
}

function downloadReceipt(receiptUrl) {
    var parsedUrl = url.parse(receiptUrl);
    var receiptFileName = parsedUrl.path.split('/').join('-').slice(1);
    var receiptFilePath = path.join(outputDirectory, receiptFileName);

    if (fileExists(receiptFilePath)) {
        console.log('%s\t%s', receiptFileName, 'Skipped');
        skipCount++;
        return;
    }

    var fileStream = fs.createWriteStream(receiptFilePath);
    var timeoutStatus = '';

    https.get({
            protocol: parsedUrl.protocol,
            hostname: useProxy ? proxyDetails[0] : parsedUrl.hostname,
            port: useProxy ? proxyDetails[1] : parsedUrl.port,
            path: parsedUrl.path,
            headers: {
                'Host': parsedUrl.hostname,
                'Authorization': 'Bearer ' + authToken
            }
        },
        function(response) {
            if (response.statusCode != 200) {
                writeToErrorLog(receiptUrl, response.statusCode, 'Response status is not OK');
                console.log('%s\t%s', receiptUrl, 'Failed with http' + response.statusCode);
                errorCount++;
                deleteIfExists(receiptFilePath);
                response.resume();
                return;
            }

            response.pipe(fileStream);

            fileStream.on('finish', function() {
                fileStream.close(function() {
                    var expectedLength = response.headers['content-length'];
                    if (typeof expectedLength !== 'undefined') {
                        expectedLength = parseInt(expectedLength);
                        var outputFileSize = fs.statSync(receiptFilePath).size;
                        if (outputFileSize === expectedLength) {
                            console.info('%s\t%s', receiptFileName, 'Downloaded');
                            downloadCount++;
                        } else {
                            console.log('%s\t%s', receiptFileName, 'Interrupted');
                            errorCount++;
                            deleteIfExists(receiptFilePath);
                            writeToErrorLog(receiptUrl, 200, 'Interrupted. Deleted the ' + outputFileSize + 'B incomplete file (expected ' + expectedLength + 'B).');
                        }
                    } else {
                        console.log('%s\t%s', receiptFileName, 'Downloaded (size not verified)');
                        downloadCount++;
                    }
                });
            });
        }
    ).on('error', function(err) {
        errorCount++;
        writeToErrorLog(receiptUrl, '', timeoutStatus + 'Failed to GET the http response: ' + err.message);
        deleteIfExists(receiptFilePath);
    }).setTimeout(requestTimeout, function() {
        timeoutStatus = 'Timeout - ';
        this.abort();
    });
}
