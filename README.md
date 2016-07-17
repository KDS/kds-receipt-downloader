# KDS Receipt Downloader

## Purpose

Users of KDS Expense can attach digital receipts to their expense reports.
Export files list the expense reports which life cycle is complete. They reference the digital receipts by providing a download URI.

KDS exposes an API which allows downloading the digital receipts.

The **KDS Receipt Downloader** is a sample client application that uses this API.

## License

See the enclosed LICENSE file.

In a nutshell :

  This application is provided "as-is", with no maintenance nor support other than this embedded documentation.

  Any person obtaining a copy of this software is free to use it directly or to modify it to better fit their own requirements.

## Installing the application

1. The target environment requires Node.js version "4.4.7 LTS" or later. This can ge obtained from nodejs.org .
2. Get the files **receiptDownload.<span/>js** and **packages.json** into a folder
3. Open a command line, get to this folder and type: `npm install`

Once successful, the application is ready to be used !

## Using the application

The application will walk through the export file and will download all the receipts into the root of the output folder. The output file names are deduced from the receipts urls by removing the scheme and replacing special characters by dashes.

### Running the application

You may want to adjust the **// Configuration** section at the beginning of **receiptDownload<span></span>.js**.

The command line to run the application from the application folder should be constructed as follows:
```
node receiptDownload -t {Authentication Token} -f {Export File} -o {Output Directory}
```
The **{Authentication Token}** needs to be generated from the KDS Admin Suite for the export user. It needs to be stored securely.

The KDS Expense Report **{Export File}** contains urls of the receipts that will be downloaded into the the root of the **{Output Directory}**. If it is not empty, the tool will only download the missing receipts.

### Error management / Resume
If the downloading of some receipts fails, the application will delete any incomplete/corrupted file and mention it into an **error.log** file.

Beware that the **error.log** file is cleared at the beginning of the process.

If any error occurred during the processing, the process should be re-launched with the exact same command line.
Files already present in the output directory won't be downloaded again.
