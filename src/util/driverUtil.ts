'use strict';

import * as fs from 'fs-extra';
import * as path from 'path';
import * as child_process from 'child_process';
import { Unpack } from './unpack';
import { Download } from './download';

/**
 * Handles version checks and download of ChromeDriver
 */
export class DriverUtil {
    private downloadFolder: string;

    /**
     * Create an instance of chrome driver handler
     * @param folder path to a folder to store all artifacts
     */
    constructor(folder: string = 'test-resources') {
        this.downloadFolder = path.resolve(folder);
    }

    /**
     * Find a matching ChromeDriver version for a given Chromium version and download it.
     * @param chromiumVersion version of Chromium to match the ChromeDriver against
     */
    async downloadChromeDriverForChromiumVersion(chromiumVersion: string): Promise<string> {
        const version = await this.getChromeDriverVersion(chromiumVersion);
        return this.downloadChromeDriver(version);
    }

    /**
     * Download a given version ChromeDriver
     * @param version version to download
     */
    async downloadChromeDriver(version: string): Promise<string> {
        const majorVersion = version.split('.')[0];
        const exeFile = process.platform === 'win32' ? 'chromedriver.exe' : 'chromedriver';
        const file = path.join(this.downloadFolder, exeFile);
        if (fs.existsSync(file)) {
            let localVersion = '';
            try {
                localVersion = await this.getLocalDriverVersion();
            } catch (err) {
                // ignore and download
            }
            if (localVersion.startsWith(version)) {
                console.log(`ChromeDriver ${version} exists in local cache, skipping download`);
                return '';
            }
        }
        fs.mkdirpSync(this.downloadFolder);
        let driverPlatform = (process.platform === 'darwin') ? 'mac64' : process.platform === 'win32' ? 'win32' : 'linux64';
        let url = `https://chromedriver.storage.googleapis.com/${version}/chromedriver_${driverPlatform}.zip`;
        if (+majorVersion > 114) {
            // See formatting at https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone-with-downloads.json
            driverPlatform = (process.platform === 'darwin') ? `mac-${process.arch}` : process.platform === 'win32' ? 'win32' : 'linux64';
            url = `https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/${version}/${driverPlatform}/chromedriver-${driverPlatform}.zip`
        }
        const fileName = path.join(this.downloadFolder, path.basename(url));
        console.log(`Downloading ChromeDriver ${version} from: ${url}`);
        await Download.getFile(url, fileName, true);

        console.log(`Unpacking ChromeDriver ${version} into ${this.downloadFolder}`);
        await Unpack.unpack(fileName, this.downloadFolder);
        if (+majorVersion > 114) {
            // Zipped content is a folder containing the driver
            const folderPath = fileName.replace('.zip', '');
            const driverPath = path.join(folderPath, exeFile);
            fs.renameSync(driverPath, file);
        }
        if (process.platform !== 'win32') {
            fs.chmodSync(file, 0o755);
        }
        console.log('Success!');
        return file;
    }

    async checkDriverVersionOffline(): Promise<string> {
        try {
            return await this.getLocalDriverVersion();
        } catch (err) {
            console.log('ERROR: Cannot find a copy of ChromeDriver in local cache in offline mode, exiting.')
            throw err;
        }
    }

    /**
     * Check local chrome driver version
     */
    private async getLocalDriverVersion(): Promise<string> {
        const command = `${path.join(this.downloadFolder, 'chromedriver')} -v`;
        return new Promise<string>((resolve, reject) => {
            child_process.exec(command, (err, stdout) => {
                if (err) return reject(err);
                resolve(stdout.split(' ')[1]);
            });
        });
        
    }

    /**
     * Find a matching version of ChromeDriver for a given Chromium version
     * @param chromiumVersion Chromium version to check against
     */
    private async getChromeDriverVersion(chromiumVersion: string): Promise<string> {
        const majorVersion = chromiumVersion.split('.')[0];

        // chrome driver versioning has changed for chrome 70+
        if (+majorVersion < 70) {
            if (this.chromiumVersionMap[+majorVersion]) {
                return this.chromiumVersionMap[+majorVersion];
            } else {
                throw new Error(`Chromium version ${chromiumVersion} not supported`);
            }
        }
        let url = `https://chromedriver.storage.googleapis.com/LATEST_RELEASE_${majorVersion}`;
        if (+majorVersion > 114) {
            url = `https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_${majorVersion}`;
        }
        const fileName = 'driverVersion';
        await Download.getFile(url, path.join(this.downloadFolder, fileName));
        return fs.readFileSync(path.join(this.downloadFolder, fileName)).toString();
    }

    // older chromedriver versions do not match chrome versions
    private readonly chromiumVersionMap: VersionMap = {
        69: '2.38',
        68: '2.38',
        67: '2.38',
        66: '2.38',
        65: '2.37',
        64: '2.36',
        63: '2.35',
        62: '2.34',
        61: '2.33',
        60: '2.32'
    }
}

interface VersionMap {
    [key:number]: string
}