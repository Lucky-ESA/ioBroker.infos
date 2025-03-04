"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const axios = require("axios");
const sistm = require("systeminformation");
const path = require("path");
const child_process = require("child_process");
const semver = require("semver");
const hash = require("jshashes");
// Load your modules here, e.g.:
// const fs = require("fs");

class Infos extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: "infos",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
        this.adapterIntervals = {};
        this.knownObjects = {};
        this.cpuUsed = [];
        this.cpuTemp = [];
        this.memUsed = [];
        this.fsUsed = {};
        this.versions = {};
        this.activeRepo = "default";
        this.uuid = null;
        this.test = false;
        this.testLink;
        this.sha = new hash.SHA256();
        this.requestClient = axios.create({
            withCredentials: true,
            timeout: 5000,
        });
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.setState("info.connection", false, true);
        this.subscribeStates("*");
        this.versions = this.getSystemVersions();
        this.getState("readTestFile", (err, obj) => {
            if (!err && obj) {
                this.testLink = obj.val;
                if (
                    this.testLink &&
                    this.testLink.toString().length > 0 &&
                    this.testLink.toString().toUpperCase().endsWith(".JSON")
                ) {
                    this.test = true;
                } else {
                    this.test = false;
                }
            } else {
                this.setState("readTestFile", { val: false, ack: true });
            }
            this.getState("last_popup", (err, obj) => {
                if (!err && (!obj || !obj.val)) {
                    this.setState("last_popup", { val: "2019-01-01T00:00:00.000Z", ack: true });
                }
                this.checkNews();
                this.adapterIntervals.checkNews = this.setInterval(
                    () => {
                        this.checkNews();
                    },
                    30 * 60 * 1000,
                );
                this.updateSysinfo(true);
            });
        });
        this.setState("info.connection", true, true);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            for (const inter in this.adapterIntervals) {
                if (this.adapterIntervals[inter]) {
                    this.clearInterval(this.adapterIntervals[inter]);
                }
            }
            this.log.info("cleaned everything up...");
            callback();
        } catch {
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     *
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state && !state.ack) {
            this.setState(id, { ack: true });
        }
    }

    /**
     * If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.messagebox" property to be set to true in io-package.json
     *
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === "object" && obj.message) {
            if (obj.command === "token") {
                let token = this.config.github_token;
                if (token != "" && this.config.github_token.toString().indexOf("aes-192-cbc") !== -1) {
                    token = this.decrypt(this.config.github_token);
                    this.config.github_token = token;
                }
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, token, obj.callback);
                }
            } else if (obj.command === "key") {
                let key = this.config.feednami;
                if (key != "" && this.config.feednami.toString().indexOf("aes-192-cbc") !== -1) {
                    key = this.decrypt(this.config.feednami);
                    this.config.feednami = key;
                }
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, key, obj.callback);
                }
            }
        }
    }

    async checkNews() {
        const newsLink = this.test
            ? this.testLink
            : "https://raw.githubusercontent.com/ioBroker/ioBroker.docs/master/info/news.json";
        await this.requestClient({
            url: newsLink?.toString(),
            method: "get",
            headers: {
                accept: "application/json",
                "content-type": "application/json",
            },
        })
            .then(resp => {
                this.log.debug(`Popup news was read...${this.test ? " (DEBUG)" : ""}`);
                this.setState("newsfeed", { val: JSON.stringify(resp.data), ack: true });
                this.getForeignObject("system.meta.uuid", (err, obj) => {
                    if (!err && obj) {
                        const myUUID = obj && obj.native ? obj.native.uuid : null;
                        if (myUUID) {
                            this.uuid = this.sha.hex(`iobroker-uuid${myUUID}`);
                            this.setState("uuid", { val: this.uuid, ack: true });
                        }
                    }
                });
                this.getForeignObject("system.config", (err, obj) => {
                    if (!err && obj && obj.common) {
                        this.log.debug(`Repo: ${obj.common.activeRepo}`);
                        this.activeRepo = obj.common.activeRepo.toString();
                        this.log.debug(`Language: ${obj.common.language}`);
                        this.procedeNewsfeed(resp.data, obj.common.language);
                    } else {
                        this.log.warn("Invalid system.config object");
                    }
                });
            })
            .catch(error => {
                this.log.error(error);
                error.response && this.log.error(JSON.stringify(error.response.data));
            });
    }

    checkConditions(condition, installedVersion, objectName) {
        if (condition.startsWith("equals")) {
            const vers = condition.substring(7, condition.length - 1).trim();
            this.log.debug(
                `${objectName} same version: ${installedVersion} equals ${vers} -> ${installedVersion === vers}`,
            );
            return installedVersion === vers;
        } else if (condition.startsWith("bigger")) {
            const vers = condition.substring(7, condition.length - 1).trim();
            const checked = this.checkVersion(vers, installedVersion);
            this.log.debug(`${objectName} bigger version: ${installedVersion} bigger ${vers} -> ${checked}`);
            return checked;
        } else if (condition.startsWith("smaller")) {
            const vers = condition.substring(8, condition.length - 1).trim();
            const checked = this.checkVersion(installedVersion, vers);
            this.log.debug(`${objectName} smaller version: ${installedVersion} smaller ${vers} -> ${checked}`);
            return checked;
        } else if (condition.startsWith("between")) {
            const vers1 = condition.substring(8, condition.indexOf(",")).trim();
            const vers2 = condition.substring(condition.indexOf(",") + 1, condition.length - 1).trim();
            const checked = this.checkVersionBetween(installedVersion, vers1, vers2);
            this.log.debug(
                `${objectName} between version: ${installedVersion} between ${vers1} and ${vers2} -> ${checked}`,
            );
            return checked;
        }
        return true;
    }

    async procedeNewsfeed(messages, systemLang) {
        this.log.debug(`MessagesLength: ${messages.length}`);
        this.log.debug(`Messages: ${JSON.stringify(messages)}`);
        if (Array.isArray(messages) && messages.length > 0) {
            const filtered = [];
            const today = new Date().getTime();
            const instances = await this.getInstances();
            this.log.debug(`Found ${Object.keys(instances).length} instances`);
            if (Object.keys(instances).length > 0) {
                for (const message of messages) {
                    this.log.debug(`Checking: ${message.title[systemLang]}`);
                    let showIt = true;
                    if (showIt && message["date-start"] && new Date(message["date-start"]).getTime() > today) {
                        this.log.debug("Date start ok");
                        showIt = false;
                    } else if (showIt && message["date-end"] && new Date(message["date-end"]).getTime() < today) {
                        this.log.debug("Date end ok");
                        showIt = false;
                    } else if (showIt && message.conditions && Object.keys(message.conditions).length > 0) {
                        this.log.debug("Checking conditions...");
                        for (const key in message.conditions) {
                            if (showIt) {
                                this.log.debug(`Conditions for ${key} adapter`);
                                const adapt = instances[key];
                                const condition = message.conditions[key];
                                if (!adapt && condition !== "!installed") {
                                    this.log.debug("Adapter shoud be installed");
                                    showIt = false;
                                } else if (adapt && condition === "!installed") {
                                    this.log.debug("Adapter shoud not be installed");
                                    showIt = false;
                                } else if (adapt && condition === "active") {
                                    this.log.debug("At least one instance is active");
                                    showIt = adapt ? true : false;
                                } else if (adapt && condition === "!active") {
                                    this.log.debug("No active instance of adapter");
                                    showIt = adapt ? false : true;
                                } else if (adapt) {
                                    showIt = this.checkConditions(condition, adapt.version, key);
                                }
                            }
                        }
                    }
                    if (showIt && message["node-version"]) {
                        const condition = message["node-version"];
                        this.log.debug("Node check");
                        showIt = this.checkConditions(condition, this.versions.node, "NodeJS");
                    }
                    if (showIt && message["npm-version"]) {
                        const condition = message["npm-version"];
                        this.log.debug("NPM check");
                        showIt =
                            this.versions.npm !== null && this.checkConditions(condition, this.versions.npm, "NPM");
                    }
                    if (showIt && message["os"]) {
                        const condition = message["os"];
                        this.log.debug("OS check");
                        showIt = process.platform === condition;
                    }
                    if (showIt && message["repo"]) {
                        const condition = message["repo"];
                        this.log.debug("Repo check");
                        showIt = this.activeRepo === condition;
                    }
                    if (showIt && message["uuid"]) {
                        const condition = message["uuid"];
                        this.log.debug("UUID check");
                        if (Array.isArray(message["uuid"])) {
                            this.log.debug("UUID List check");
                            let oneMustBe = false;
                            if (this.uuid) {
                                for (const uuidCondition of condition) {
                                    if (!oneMustBe) {
                                        oneMustBe = this.uuid === uuidCondition;
                                    }
                                }
                            }
                            showIt = oneMustBe;
                        } else {
                            this.log.debug("UUID only one");
                            showIt = this.uuid === condition;
                        }
                    }
                    if (showIt) {
                        this.log.debug(`Message added: ${message.title[systemLang]}`);
                        filtered.push({
                            id: message.id,
                            title: message.title[systemLang],
                            content: message.content[systemLang],
                            class: message.class,
                            icon: message["fa-icon"],
                            created: message.created,
                        });
                    }
                }
                this.setState("newsfeed_filtered", { val: JSON.stringify(filtered), ack: true });
            }
        }
    }

    checkVersion(smaller, bigger) {
        if (smaller === undefined || bigger === undefined) {
            return false;
        }
        smaller = smaller.split(".");
        bigger = bigger.split(".");
        smaller[0] = parseInt(smaller[0], 10);
        bigger[0] = parseInt(bigger[0], 10);
        if (smaller[0] > bigger[0]) {
            return false;
        } else if (smaller[0] === bigger[0]) {
            smaller[1] = parseInt(smaller[1], 10);
            bigger[1] = parseInt(bigger[1], 10);
            if (smaller[1] > bigger[1]) {
                return false;
            } else if (smaller[1] === bigger[1]) {
                smaller[2] = parseInt(smaller[2], 10);
                bigger[2] = parseInt(bigger[2], 10);
                return smaller[2] < bigger[2];
            }
            return true;
        }
        return true;
    }

    checkVersionBetween(inst, vers1, vers2) {
        return inst === vers1 || inst === vers2 || (this.checkVersion(vers1, inst) && this.checkVersion(inst, vers2));
    }

    async getInstances() {
        this.log.debug("Getting instances...");
        const objs = await this.getObjectViewAsync("system", "instance", {
            startkey: "system.adapter.",
            endkey: "system.adapter.\u9999",
        });
        if (!objs || !objs.rows || !objs.rows.length) {
            return {};
        }
        const res = [];
        for (const obj of objs.rows) {
            res.push(obj.value);
        }
        const instances = {};
        for (const instance of res) {
            if (instance && instance.common && instance.common.name) {
                instances[instance.common.name] = {};
                instances[instance.common.name].version = instance.common.installedVersion;
            }
        }
        return instances;
    }

    async updateSysinfo(setIntervals) {
        if (!sistm) {
            return;
        }
        this.log.info("Reading/updating systemdata.");

        //SYSTEM
        try {
            const data = await sistm.system();
            await this.setSystemStates(data, "system", "hardware");
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data2 = await sistm.uuid();
            await this.setSystemStates(data2, "system", "uuid");
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data3 = await sistm.bios();
            await this.setSystemStates(data3, "system", "bios");
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data4 = await sistm.baseboard();
            await this.setSystemStates(data4, "system", "baseboard");
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data5 = await sistm.chassis();
            await this.setSystemStates(data5, "system", "chassis");
        } catch (err) {
            this.log.error(err);
        }

        //CPU
        try {
            const data6 = await sistm.cpu();
            await this.setSystemStates(data6, "cpu", "info");
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data7 = await sistm.currentLoad();
            await this.setSystemStates(data7, "cpu", "currentLoad");
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.cpuSpeed != 0) {
                const speed = this.config.cpuSpeed || 60;
                this.log.info(`Reading CPU data every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentCPUInfos = this.setInterval(() => {
                    this.updateCurrentCPUInfos();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data8 = await sistm.cpuTemperature();
            this.log.info(`cpu Temp res = ${JSON.stringify(data8)}`);
            await this.setSystemStates(data8, "cpu", "temperature");
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.cpuSpeed != 0) {
                const speed = this.config.cpuSpeed || 60;
                this.log.info(`Reading CPU temp data every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentthis.cpuTempInfos = this.setInterval(() => {
                    this.updateCurrentcpuTempInfos();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data9 = await sistm.cpuCurrentSpeed();
            await this.setSystemStates(data9, "cpu", "currentSpeed", {
                min: "minSpeed",
                max: "maxSpeed",
                avg: "avgSpeed",
            });
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.cpuSpeed != 0) {
                const speed = this.config.cpuSpeed || 60;
                this.log.info(`Reading CPU current speed every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentCPUSpeed = this.setInterval(() => {
                    this.updateCurrentCPUSpeed();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        //MEMORY
        try {
            const data10 = await sistm.mem();
            await this.setSystemStates(data10, "memory", "info");
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.memSpeed != 0) {
                const speed = this.config.memSpeed || 60;
                this.log.info(`Reading memory data every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentMemoryInfos = this.setInterval(() => {
                    this.updateCurrentMemoryInfos();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data11 = await sistm.memLayout();
            if (data11) {
                for (const key of Object.keys(data11)) {
                    await this.createChannels("memory", "memLayout", `ram${key}`);
                    await this.setSystemStates(data11[key], "memory", `memLayout.ram${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        //BATTERY
        try {
            const data12 = await sistm.system();
            await this.setSystemStates(data12, "battery", null);
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.batterySpeed != 0) {
                const speed = this.config.batterySpeed || 120;
                this.log.info(`Reading battery data every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentBatteryInfos = this.setInterval(() => {
                    this.updateCurrentBatteryInfos();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        //GRAPHICS
        try {
            const data13 = await sistm.graphics();
            if (data13) {
                if (data13.controllers && data13.controllers.length > 0) {
                    for (const key of Object.keys(data13.controllers)) {
                        await this.createChannels("graphics", "controllers", `ctrl${key}`);
                        await this.setSystemStates(data13.controllers[key], "graphics", `controllers.ctrl${key}`);
                    }
                }
                if (data13.displays && data13.displays.length > 0) {
                    for (const key of Object.keys(data13.displays)) {
                        await this.createChannels("graphics", "displays", `dspl${key}`);
                        await this.setSystemStates(data13.displays[key], "graphics", `displays.dspl${key}`);
                    }
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        //OS
        try {
            const data14 = await sistm.osInfo();
            await this.setSystemStates(data14, "os", "info");
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data15 = await sistm.versions();
            await this.setSystemStates(data15, "os", "versions");
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data16 = await sistm.users();
            await this.setStateValue("os", null, "users", "string", JSON.stringify(data16));
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.allProcessesUsers != 0) {
                const speed = this.config.allProcessesUsers || 120;
                this.log.info(`Reading user data every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentUsersInfos = this.setInterval(() => {
                    this.updateCurrentUsersInfos();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data17 = await sistm.processes();
            await this.setStateValue("os", "processes", "all", "number", data17.all || null);
            await this.setStateValue("os", "processes", "running", "number", data17.running || null);
            await this.setStateValue("os", "processes", "blocked", "number", data17.blocked || null);
            await this.setStateValue("os", "processes", "sleeping", "number", data17.sleeping || null);
            await this.setStateValue("os", "processes", "unknown", "number", data17.unknown || null);
            await this.setStateValue("os", "processes", "list", "string", JSON.stringify(data17.list));
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.allProcessesUsers != 0) {
                const speed = this.config.allProcessesUsers || 120;
                this.log.info(`Reading process data every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentProcessInfos = this.setInterval(() => {
                    this.updateCurrentProcessInfos();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        //DISKS
        try {
            const data18 = await sistm.blockDevices();
            if (data18) {
                for (const key of Object.keys(data18)) {
                    await this.createChannels("disks", "blockDevices", `dev${key}`);
                    await this.setSystemStates(data18[key], "disks", `blockDevices.dev${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data19 = await sistm.diskLayout();
            if (data19) {
                for (const key of Object.keys(data19)) {
                    this.createChannels("disks", "diskLayout", `dev${key}`);
                    this.setSystemStates(data19[key], "disks", `diskLayout.dev${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data20 = await sistm.fsSize();
            if (data20) {
                for (const key of Object.keys(data20)) {
                    this.fsUsed[key] = [];
                    await this.createChannels("disks", "fsSize", `fs${key}`);
                    for (const key2 of Object.keys(data20[key])) {
                        if (
                            (typeof data20[key][key2] === "string" && data20[key][key2].length) ||
                            typeof data20[key][key2] !== "string"
                        ) {
                            await this.setStateValue(
                                "disks",
                                `fsSize.fs${key}`,
                                key2,
                                typeof data20[key][key2],
                                data20[key][key2],
                            );
                        }
                        if (key2 === "used") {
                            await this.setStateValue("disks", `fsSize.fs${key}`, "used_hist", "array", "[]");
                        }
                    }
                }
            }
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.diskSpeed != 0) {
                const speed = this.config.diskSpeed || 120;
                this.log.info(`Reading disk data every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentFilesystemInfos = this.setInterval(() => {
                    this.updateCurrentFilesystemInfos();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        //USB
        try {
            const data21 = await sistm.usb();
            if (data21) {
                for (const key of Object.keys(data21)) {
                    await this.createChannels("usb", `dev${key}`, null);
                    await this.setSystemStates(data21[key], "usb", `dev${key}`);
                }
            }
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.usbSpeed != 0) {
                const speed = this.config.usbSpeed || 120;
                this.log.info(`Reading usb data every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentUsbInfos = this.setInterval(() => {
                    this.updateCurrentUsbInfos();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        //PRINTER
        try {
            const data22 = await sistm.printer();
            if (data22) {
                for (const key of Object.keys(data22)) {
                    await this.createChannels("printer", `dev${key}`, null);
                    await this.setSystemStates(data22[key], "printer", `dev${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        //AUDIO
        try {
            const data23 = await sistm.audio();
            if (data23) {
                for (const key of Object.keys(data23)) {
                    await this.createChannels("audio", `dev${key}`, null);
                    await this.setSystemStates(data23[key], "audio", `dev${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        //NETWORK
        try {
            const data24 = await sistm.networkInterfaces();
            if (data24) {
                for (const key of Object.keys(data24)) {
                    await this.createChannels("network", "interfaces", `iface${key}`);
                    await this.setSystemStates(data24[key], "network", `interfaces.iface${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data25 = await sistm.networkInterfaceDefault();
            await this.setStateValue("network", "info", "defaultInterface", "string", data25);
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data26 = await sistm.networkGatewayDefault();
            await this.setStateValue("network", "info", "defaultGateway", "string", data26);
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data27 = await sistm.networkStats();
            if (data27) {
                for (const key of Object.keys(data27)) {
                    await this.createChannels("network", "stats", `iface${key}`);
                    await this.setSystemStates(data27[key], "network", `stats.iface${key}`);
                }
            }
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.networkSpeed !== 0) {
                const speed = this.config.networkSpeed || 120;
                this.log.info(`Reading network data every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentNetworkInfos = this.setInterval(() => {
                    this.updateCurrentNetworkInfos();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        //WIFI
        try {
            const data28 = await sistm.wifiInterfaces();
            if (data28.length > 0) {
                for (const key of Object.keys(data28)) {
                    await this.createChannels("wifi", "interfaces", `iface${key}`);
                    await this.setSystemStates(data28[key], "wifi", `interfaces.iface${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data29 = await sistm.wifiConnections();
            if (data29) {
                for (const key of Object.keys(data29)) {
                    await this.createChannels("wifi", "connections", `connection${key}`);
                    await this.setSystemStates(data29[key], "wifi", `connections.connection${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data30 = await sistm.wifiNetworks();
            if (data30) {
                for (const key of Object.keys(data30)) {
                    await this.createChannels("wifi", "networks", `net${key}`);
                    await this.setSystemStates(data30[key], "wifi", `networks.net${key}`);
                }
            }
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.wifiSpeed != 0) {
                const speed = this.config.wifiSpeed || 120;
                this.log.info(`Reading network data every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentWifiInfos = this.setInterval(() => {
                    this.updateCurrentWifiInfos();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        //BLUETOOTH
        try {
            const data31 = await sistm.bluetoothDevices();
            if (data31) {
                for (const key of Object.keys(data31)) {
                    await this.createChannels("bluetooth", `dev${key}`, null);
                    await this.setSystemStates(data31[key], "bluetooth", `dev${key}`);
                }
            }
            if (setIntervals && this.config.noCurrentSysData !== true && this.config.bluetoothSpeed != 0) {
                const speed = this.config.bluetoothSpeed || 120;
                this.log.info(`Reading usb data every ${speed} seconds.`);
                this.adapterIntervals.updateCurrentBluetoothInfos = this.setInterval(() => {
                    this.updateCurrentBluetoothInfos();
                }, speed * 1000);
            }
        } catch (err) {
            this.log.error(err);
        }

        //DOCKER
        try {
            const data34 = await sistm.dockerInfo();
            await this.setSystemStates(data34, "docker", "info");
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data35 = await sistm.dockerImages();
            if (data35) {
                for (const key of Object.keys(data35)) {
                    await this.createChannels("docker", "images", `img${key}`);
                    await this.setSystemStates(data35[key], "docker", `images.img${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data36 = await sistm.dockerContainers();
            if (data36) {
                for (const key of Object.keys(data36)) {
                    await this.createChannels("docker", "containers", `cnt${key}`);
                    await this.setSystemStates(data36[key], "docker", `containers.cnt${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        try {
            const data37 = await sistm.dockerVolumes();
            if (data37) {
                for (const key of Object.keys(data37)) {
                    await this.createChannels("docker", "volumes", `vol${key}`);
                    await this.setSystemStates(data37[key], "docker", `volumes.vol${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }

        if (setIntervals) {
            this.adapterIntervals.globalReloadData = this.setInterval(
                () => {
                    this.updateAllData();
                },
                12 * 60 * 60 * 1000,
            );
        }
    }

    updateAllData() {
        this.updateSysinfo(false);
    }

    async updateCurrentCPUInfos() {
        sistm
            .currentLoad()
            .then(async data => {
                await this.setState("sysinfo.cpu.currentLoad.avgLoad", { val: data.avgLoad, ack: true });
                await this.setState("sysinfo.cpu.currentLoad.currentLoad", { val: data.currentLoad, ack: true });
                this.cpuUsed.push(data["currentLoad"]);
                if (this.cpuUsed.length > 30) {
                    this.cpuUsed.shift();
                }
                await this.setState("sysinfo.cpu.currentLoad.currentLoad_hist", {
                    val: JSON.stringify(this.cpuUsed),
                    ack: true,
                });
                await this.setState("sysinfo.cpu.currentLoad.currentLoadUser", {
                    val: data.currentLoadUser,
                    ack: true,
                });
                await this.setState("sysinfo.cpu.currentLoad.currentLoadSystem", {
                    val: data.currentLoadSystem,
                    ack: true,
                });
                await this.setState("sysinfo.cpu.currentLoad.currentLoadNice", {
                    val: data.currentLoadNice,
                    ack: true,
                });
                await this.setState("sysinfo.cpu.currentLoad.currentLoadIdle", {
                    val: data.currentLoadIdle,
                    ack: true,
                });
                await this.setState("sysinfo.cpu.currentLoad.currentLoadIrq", { val: data.currentLoadIrq, ack: true });
                await this.setState("sysinfo.cpu.currentLoad.rawCurrentLoad", { val: data.rawCurrentLoad, ack: true });
                await this.setState("sysinfo.cpu.currentLoad.rawCurrentLoadUser", {
                    val: data.rawCurrentLoadUser,
                    ack: true,
                });
                await this.setState("sysinfo.cpu.currentLoad.rawCurrentLoadSystem", {
                    val: data.rawCurrentLoadSystem,
                    ack: true,
                });
                await this.setState("sysinfo.cpu.currentLoad.rawCurrentLoadNice", {
                    val: data.rawCurrentLoadNice,
                    ack: true,
                });
                await this.setState("sysinfo.cpu.currentLoad.rawCurrentLoadIdle", {
                    val: data.rawCurrentLoadIdle,
                    ack: true,
                });
                await this.setState("sysinfo.cpu.currentLoad.rawCurrentLoadIrq", {
                    val: data.rawCurrentLoadIrq,
                    ack: true,
                });
            })
            .catch(error => this.log.error(error));
    }

    updateCurrentcpuTempInfos() {
        sistm
            .cpuTemperature()
            .then(async data => {
                await this.setState("sysinfo.cpu.temperature.main", {
                    val: data.main !== null ? data.main : null,
                    ack: true,
                });
                data.main !== null && this.cpuTemp.push(data.main);
                if (this.cpuTemp.length > 30) {
                    this.cpuTemp.shift();
                }
                await this.setState("sysinfo.cpu.temperature.main_hist", {
                    val: JSON.stringify(this.cpuTemp),
                    ack: true,
                });
                await this.setState("sysinfo.cpu.temperature.cores", { val: JSON.stringify(data.cores), ack: true });
                await this.setState("sysinfo.cpu.temperature.max", {
                    val: data.max !== null ? data.max : null,
                    ack: true,
                });
            })
            .catch(error => this.log.error(error));
    }

    updateCurrentCPUSpeed() {
        sistm
            .cpuCurrentSpeed()
            .then(async data => {
                await this.setState("sysinfo.cpu.currentSpeed.avgSpeed", { val: data.avg, ack: true });
                await this.setState("sysinfo.cpu.currentSpeed.minSpeed", { val: data.min, ack: true });
                await this.setState("sysinfo.cpu.currentSpeed.maxSpeed", { val: data.max, ack: true });
                await this.setState("sysinfo.cpu.currentSpeed.coresSpeed", {
                    val: JSON.stringify(data.cores),
                    ack: true,
                });
            })
            .catch(error => this.log.error(error));
    }

    updateCurrentMemoryInfos() {
        sistm
            .mem()
            .then(async data => {
                await this.setState("sysinfo.memory.info.free", { val: data.free, ack: true });
                await this.setState("sysinfo.memory.info.used", { val: data.used, ack: true });
                await this.setState("sysinfo.memory.info.active", { val: data.active, ack: true });
                this.memUsed.push(data["active"] / 1000000000);
                if (this.memUsed.length > 30) {
                    this.memUsed.shift();
                }
                await this.setState("sysinfo.memory.info.used_hist", { val: JSON.stringify(this.memUsed), ack: true });
                await this.setState("sysinfo.memory.info.available", { val: data.available, ack: true });
                await this.setState("sysinfo.memory.info.buffcache", { val: data.buffcache, ack: true });
                await this.setState("sysinfo.memory.info.swapused", { val: data.swapused, ack: true });
                await this.setState("sysinfo.memory.info.swapfree", { val: data.swapfree, ack: true });
            })
            .catch(error => this.log.error(error));
    }

    async updateCurrentUsbInfos() {
        sistm
            .usb()
            .then(async data => {
                if (data) {
                    for (const key of Object.keys(data)) {
                        await this.createChannels("usb", `dev${key}`, null);
                        await this.setSystemStates(data[key], "usb", `dev${key}`);
                    }
                }
            })
            .catch(error => this.log.error(error));
    }

    async updateCurrentBluetoothInfos() {
        sistm
            .bluetoothDevices()
            .then(async data => {
                if (data) {
                    for (const key of Object.keys(data)) {
                        await this.createChannels("bluetooth", `dev${key}`, null);
                        await this.setSystemStates(data[key], "bluetooth", `dev${key}`);
                    }
                }
            })
            .catch(error => this.log.error(error));
    }

    async updateCurrentFilesystemInfos() {
        sistm
            .fsSize()
            .then(async data => {
                if (data) {
                    for (const key of Object.keys(data)) {
                        await this.createChannels("disks", "fsSize", `fs${key}`);
                        await this.setState(`sysinfo.disks.fsSize.fs${key}.used`, {
                            val: data[key].used,
                            ack: true,
                        });
                        this.fsUsed[key] = this.fsUsed[key] || [];
                        this.fsUsed[key].push(data[key]["used"]);
                        if (this.fsUsed[key].length > 30) {
                            this.fsUsed[key].shift();
                        }
                        await await this.setState(`sysinfo.disks.fsSize.fs${key}.used_hist`, {
                            val: JSON.stringify(this.fsUsed[key]),
                            ack: true,
                        });
                        await await this.setState(`sysinfo.disks.fsSize.fs${key}.use`, {
                            val: data[key].use,
                            ack: true,
                        });
                    }
                }
            })
            .catch(error => this.log.error(error));
    }

    async updateCurrentNetworkInfos() {
        sistm
            .networkStats()
            .then(async data => {
                if (data) {
                    for (const key of Object.keys(data)) {
                        await this.createChannels("network", "stats", `iface${key}`);
                        await this.setSystemStates(data[key], "network", `stats.iface${key}`);
                    }
                }
            })
            .catch(error => this.log.error(error));
    }

    async updateCurrentWifiInfos() {
        try {
            const data = sistm.wifiNetworks();
            if (data) {
                for (const key of Object.keys(data)) {
                    await this.createChannels("wifi", "networks", `net${key}`);
                    await this.setSystemStates(data[key], "wifi", `networks.net${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }
        try {
            const data = sistm.wifiConnections();
            if (data) {
                for (const key of Object.keys(data)) {
                    await this.createChannels("wifi", "connections", `connection${key}`);
                    await this.setSystemStates(data[key], "wifi", `connections.connection${key}`);
                }
            }
        } catch (err) {
            this.log.error(err);
        }
    }

    updateCurrentBatteryInfos() {
        sistm
            .battery()
            .then(async data => {
                await this.setState("sysinfo.battery.hasBattery", { val: data.hasBattery, ack: true });
                await this.setState("sysinfo.battery.cycleCount", { val: data.cycleCount, ack: true });
                await this.setState("sysinfo.battery.isCharging", { val: data.isCharging, ack: true });
                await this.setState("sysinfo.battery.maxCapacity", { val: data.maxCapacity, ack: true });
                await this.setState("sysinfo.battery.currentCapacity", { val: data.currentCapacity, ack: true });
                await this.setState("sysinfo.battery.percent", { val: data.percent, ack: true });
                await this.setState("sysinfo.battery.timeRemaining", { val: data.timeRemaining, ack: true });
                await this.setState("sysinfo.battery.acConnected", { val: data.acConnected, ack: true });
            })
            .catch(error => this.log.error(error));
    }

    updateCurrentProcessInfos() {
        sistm
            .processes()
            .then(async data => {
                await this.setState("sysinfo.os.processes.all", { val: data.all, ack: true });
                await this.setState("sysinfo.os.processes.running", { val: data.running, ack: true });
                await this.setState("sysinfo.os.processes.blocked", { val: data.blocked, ack: true });
                await this.setState("sysinfo.os.processes.sleeping", { val: data.sleeping, ack: true });
                await this.setState("sysinfo.os.processes.unknown", { val: data.unknown, ack: true });
                await this.setState("sysinfo.os.processes.list", { val: JSON.stringify(data.list), ack: true });
            })
            .catch(error => this.log.error(error));
    }

    async updateCurrentUsersInfos() {
        sistm
            .users()
            .then(async data => {
                await this.setState("sysinfo.os.users", { val: JSON.stringify(data), ack: true });
            })
            .catch(error => this.log.error(error));
    }

    async setSystemStates(data, channel, channel2, nameChange) {
        this.log.debug(`Process ${channel} with ${channel2}: ${JSON.stringify(data)}`);
        if (typeof data !== "undefined" && data !== null) {
            for (const key of Object.keys(data)) {
                const data2 = data[key];
                if (typeof data2 === "object" && data2 !== null) {
                    for (const key2 of Object.keys(data2)) {
                        data2[key2] !== null &&
                            (await this.setStateValue(
                                channel,
                                channel2,
                                `${key}-${key2}`,
                                typeof data2[key2],
                                data2[key2],
                            ));
                    }
                } else if ((typeof data2 === "string" && data2.length) || typeof data2 !== "string") {
                    let name;
                    //if(nameChange && nameChange.hasOwnProperty(key)){
                    if (nameChange && Object.prototype.hasOwnProperty.call(nameChange, key)) {
                        name = nameChange[key];
                    } else {
                        name = key;
                    }
                    await this.setStateValue(channel, channel2, name, typeof data2, data2);
                }
            }
        }
    }

    async setStateValue(channel, channel2, key, type, value) {
        if (type === "undefined") {
            type = "string";
        }
        if (type === "object" && value !== null) {
            value = JSON.stringify(value);
        }
        const link = `sysinfo.${channel}${channel2 ? `.${channel2}` : ""}`;
        if (!this.knownObjects[`${link}.${key}`]) {
            await this.setObjectNotExistsAsync(`${link}.${key}`, {
                type: "state",
                common: {
                    name: key,
                    type: "mixed",
                    role: "value",
                    read: true,
                    write: false,
                },
                native: {},
            });
            this.knownObjects[`${link}.${key}`] = true;
        }
        await this.setState(`${link}.${key}`, { val: value, ack: true });
    }

    async createChannels(channel, channel2, channel3) {
        if (channel2 == null && !this.knownObjects[`sysinfo.${channel}`]) {
            await this.setObjectNotExistsAsync(`sysinfo.${channel}`, {
                type: "channel",
                common: {
                    name: channel,
                    role: "info",
                },
                native: {},
            });
            this.knownObjects[`sysinfo.${channel}`] = true;
        } else if (channel3 == null && !this.knownObjects[`sysinfo.${channel}.${channel2}`]) {
            await this.setObjectNotExistsAsync(`sysinfo.${channel}.${channel2}`, {
                type: "channel",
                common: {
                    name: channel2,
                    role: "info",
                },
                native: {},
            });
            this.knownObjects[`sysinfo.${channel}.${channel2}`] = true;
        } else if (!this.knownObjects[`sysinfo.${channel}.${channel2}.${channel3}`]) {
            await this.setObjectNotExistsAsync(`sysinfo.${channel}.${channel2}.${channel3}`, {
                type: "channel",
                common: {
                    name: channel3,
                    role: "info",
                },
                native: {},
            });
            this.knownObjects[`sysinfo.${channel}.${channel2}.${channel3}`] = true;
        }
    }

    getSystemVersions() {
        // Run npm -v and extract the version string
        const ret = {
            npm: undefined,
            node: undefined,
        };
        try {
            let npmVersion;
            ret.node = semver.valid(process.version);
            try {
                // remove local node_modules\.bin dir from path
                // or we potentially get a wrong npm version
                const newEnv = Object.assign({}, process.env);
                if (newEnv.Path) {
                    newEnv.PATH = newEnv.Path;
                } else if (newEnv.path) {
                    newEnv.PATH = newEnv.path;
                } else if (!newEnv.PATH) {
                    return {
                        npm: undefined,
                        node: undefined,
                    };
                }
                newEnv.PATH.split(path.delimiter)
                    .filter(dir => {
                        dir = dir.toLowerCase();
                        return !(dir.indexOf("iobroker") > -1 && dir.indexOf(path.join("node_modules", ".bin")) > -1);
                    })
                    .join(path.delimiter);
                npmVersion = child_process.execSync("npm -v", { encoding: "utf8", env: newEnv });
                if (npmVersion) {
                    npmVersion = semver.valid(npmVersion.trim());
                }
                ret.npm = npmVersion;
            } catch (e) {
                this.log.error(`Error trying to check npm version: ${e}`);
            }
        } catch (e) {
            this.log.error(`Could not check npm version: ${e}`);
            this.log.error("Assuming that correct version is installed.");
        }
        return ret;
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = options => new Infos(options);
} else {
    // otherwise start the instance directly
    new Infos();
}
