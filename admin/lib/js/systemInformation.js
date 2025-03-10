// @ts-nocheck
/* global adapterConfig, Chartist, socket, parseFloat, formatter, systemInfoForGithub */

const cpuLabels = [];
const memLabels = [];
const diskLabels = [];

const formatInfo = {
    Uptime: formatter.formatSeconds,
    "System uptime": formatter.formatSeconds,
    RAM: formatter.formatByte,
    Speed: formatter.formatSpeedMhz,
    "Disk size": formatter.formatByte,
    "Disk free": formatter.formatByte,
    "cpu.speed": formatter.formatSpeedGhz,
    "battery.designedCapacity": formatter.formatBattmWh,
    "battery.maxCapacity": formatter.formatBattmWh,
    "battery.currentCapacity": formatter.formatBattmWh,
    "battery.voltage": formatter.formatSpeedV,
    "cpu.speedMax": formatter.formatSpeedGhz,
    "cpu.speedMin": formatter.formatSpeedGhz,
    "cpu.avgSpeed": formatter.formatSpeedGhz,
    "cpu.maxSpeed": formatter.formatSpeedGhz,
    "cpu.minSpeed": formatter.formatSpeedGhz,
    "cpu.cache-l1d": formatter.formatByte,
    "cpu.cache-l1i": formatter.formatByte,
    "cpu.cache-l2": formatter.formatByte,
    "cpu.cache-l3": formatter.formatByte,
    "cpu.currentLoad": formatter.formatPercent2Digits,
    "cpu.currentLoadIdle": formatter.formatPercent2Digits,
    "cpu.currentLoadIrq": formatter.formatPercent2Digits,
    "cpu.currentLoadNice": formatter.formatPercent2Digits,
    "cpu.currentLoadSystem": formatter.formatPercent2Digits,
    "cpu.currentLoadUser": formatter.formatPercent2Digits,
    "cpu.avgLoad": formatter.formatDecimalPercent2Digits,
    "cpu.main": formatter.formatTemperature,
    "cpu.socket": formatter.formatTranslate,
    "cpu.coresSpeed": formatter.formatArrayGhz,
    "cpu.cores": formatter.formatArrayTemperature,
    "cpu.max": formatter.formatTemperature,
    "memory.total": formatter.formatByte,
    "memory.free": formatter.formatByte,
    "memory.used": formatter.formatByte,
    "memory.active": formatter.formatByte,
    "memory.size": formatter.formatByte,
    "memory.clockSpeed": formatter.formatSpeedMhz,
    "memory.buffcache": formatter.formatByte,
    "memory.available": formatter.formatByte,
    "memory.swaptotal": formatter.formatByte,
    "memory.swapused": formatter.formatByte,
    "memory.swapfree": formatter.formatByte,
    "memory.voltageConfigured": formatter.formatSpeedV,
    "memory.voltageMin": formatter.formatSpeedV,
    "memory.voltageMax": formatter.formatSpeedV,
    "disks.size": formatter.formatByte,
    "disks.used": formatter.formatByte,
    "disks.available": formatter.formatByte,
    "disks.use": formatter.formatPercent2Digits,
    "disks.removable": formatter.formatBoolean,
    "disks.smartStatus": formatter.formatTranslate,
    "network.speed": formatter.formatMhzSec,
    "network.type": formatter.formatTranslate,
    "network.duplex": formatter.formatTranslate,
    "network.internal": formatter.formatBoolean,
    "network.operstate": formatter.formatTranslate,
    "network.mtu": formatter.formatByte,
    "network.virtual": formatter.formatBoolean,
    "graphics.resolutionY": formatter.formatPixel,
    "graphics.resolutionX": formatter.formatPixel,
    "graphics.pixelDepth": formatter.formatBits,
    "graphics.sizeX": formatter.formatMm,
    "graphics.sizeY": formatter.formatMm,
    "graphics.vram": formatter.formatMb,
    "graphics.main": formatter.formatBoolean,
    "graphics.builtin": formatter.formatBoolean,
    "battery.hasBattery": formatter.formatBoolean,
    "battery.acConnected": formatter.formatBoolean,
    "battery.isCharging": formatter.formatBoolean,
    "system.virtual": formatter.formatBoolean,
    "os.uefi": formatter.formatBoolean,
    "os.hypervisor": formatter.formatBoolean,
    "os.remoteSession": formatter.formatBoolean,
};

const infoCharts = {
    startCharts: function () {
        if (cpuLabels.length === 0) {
            let labelText = 0;
            for (let i = 0; i < 31; i++) {
                if (labelText % 5 === 0) {
                    cpuLabels.push(labelText + "s");
                } else {
                    cpuLabels.push(" ");
                }
                labelText += adapterConfig.cpuSpeed;
            }
            cpuLabels.reverse();
        }
        if (memLabels.length === 0) {
            let labelText = 0;
            for (let i = 0; i < 31; i++) {
                if (labelText % 5 === 0) {
                    memLabels.push(labelText + "s");
                } else {
                    memLabels.push(" ");
                }
                labelText += adapterConfig.memSpeed;
            }
            memLabels.reverse();
        }
        if (diskLabels.length === 0) {
            let labelText = 0;
            for (let i = 0; i < 31; i++) {
                if (labelText % 5 === 0) {
                    diskLabels.push(labelText + "s");
                } else {
                    diskLabels.push(" ");
                }
                labelText += adapterConfig.diskSpeed;
            }
            diskLabels.reverse();
        }
    },
    showCPU: function (data) {
        const dta = {
            labels: cpuLabels,
            series: [data],
        };

        const options = {
            high: 100,
            low: 0,
            width: "400px",
            height: "280px",
            showPoint: false,
        };

        new Chartist.Line("#cpu-chart", dta, options);
    },
    showMemory: function (data) {
        const dta = {
            labels: memLabels,
            series: [data],
        };

        const options = {
            width: "400px",
            height: "280px",
            showPoint: false,
        };

        new Chartist.Line("#memory-chart", dta, options);
    },
};

const systemInformations = {
    getData: function () {
        socket.emit("getForeignStates", "infos.0.sysinfo.*", function (err, res) {
            if (!err && res) {
                Object.keys(res).forEach(function (key) {
                    const obj = {};
                    const link = key.split(".");
                    obj.systype = link[3];
                    if (link.length > 5) {
                        obj.syssubtype = link[4];
                    }
                    if (link.length > 6) {
                        obj.device = link[5];
                    }
                    obj.name = link[link.length - 1];
                    let value = null;
                    if (res[key]) {
                        value = res[key].val;
                    }
                    obj.value = value;
                    systemInformations.writeData(obj);
                });
            }
        });
        systemInformations.startListening();
    },
    writeData: function (obj) {
        if (obj.systype === "os" && obj.name === "logofile") {
            $("#sys_info_os_img_logo").attr("src", "lib/img/logos/" + obj.value + ".png");
        } else if (obj.name.endsWith("_hist")) {
            if (obj.name === "currentLoad_hist" && obj.value) {
                infoCharts.showCPU(obj.value.split(","));
            } else if (obj.name === "used_hist" && obj.value) {
                infoCharts.showMemory(obj.value.split(","));
            }
        } else if (obj.syssubtype === "processes") {
            if (obj.name === "list") {
                const list = JSON.parse(obj.value);
                processProcessesList(list);
            } else {
                $("#infos_0_sysinfo_os_processes_" + obj.name + "_data").text(obj.value);
            }
        } else if (obj.systype === "os" && obj.name === "users") {
            const list = JSON.parse(obj.value);
            processUsersList(list);
        } else {
            if (obj.systype === "os") {
                if (obj.name === "arch") {
                    systemInfoForGithub += "Architecture: " + obj.value + "\r\n";
                } else if (obj.name === "distro") {
                    systemInfoForGithub += "Distribution: " + obj.value + "\r\n";
                } else if (obj.name === "platform") {
                    systemInfoForGithub += "Platform: " + obj.value + "\r\n";
                }
            }
            if (obj.value !== -1) {
                if (
                    obj.device &&
                    $("#sys_info_" + obj.systype + "_" + obj.syssubtype + "_" + obj.device).length === 0
                ) {
                    const dl =
                        "<h3 id='sys_info_" +
                        obj.systype +
                        "_" +
                        obj.syssubtype +
                        "_" +
                        obj.device +
                        "_devicename'>" +
                        obj.device +
                        "</h3><dl class='dl-horizontal dl-lg' id='sys_info_" +
                        obj.systype +
                        "_" +
                        obj.syssubtype +
                        "_" +
                        obj.device +
                        "'></dl>";
                    $("#sys_info_" + obj.systype + "_" + obj.syssubtype).append($(dl));
                } else if (
                    ["usb", "bluetooth", "audio", "printer"].includes(obj.systype) &&
                    $("#sys_info_" + obj.systype + "_" + obj.syssubtype).length === 0
                ) {
                    const dl =
                        "<h3 id='sys_info_" +
                        obj.systype +
                        "_" +
                        obj.syssubtype +
                        "_device'>" +
                        obj.syssubtype +
                        "</h3><dl class='dl-horizontal dl-lg' id='sys_info_" +
                        obj.systype +
                        "_" +
                        obj.syssubtype +
                        "'></dl>";
                    $("#sys_info_" + obj.systype).append($(dl));
                }

                let name;
                if (obj.systype === "cpu" && obj.name.startsWith("cpus-")) {
                    name = _("cpu.cpus") + " " + (parseInt(obj.name.split("-")[1]) + 1);
                } else if (obj.systype === "cpu" && obj.name.startsWith("cores-")) {
                    name = _("cpu.cores") + " " + (parseInt(obj.name.split("-")[1]) + 1);
                } else if (obj.systype === "system" && obj.name.startsWith("macs-")) {
                    name = _("system.macs") + " " + (parseInt(obj.name.split("-")[1]) + 1);
                } else {
                    name = _(obj.systype + "." + obj.name);
                }

                const row =
                    "<dt>" +
                    name +
                    "</dt><dd id='info_0_sysinfo_" +
                    obj.systype +
                    (obj.systype !== "battery" ? "_" + obj.syssubtype : "") +
                    (obj.device ? "_" + obj.device : "") +
                    "_" +
                    obj.name +
                    "_data'>" +
                    (formatInfo[obj.systype + "." + obj.name]
                        ? formatInfo[obj.systype + "." + obj.name](obj.value)
                        : obj.value) +
                    "</dd>";
                $(
                    "#sys_info_" +
                        obj.systype +
                        (obj.systype !== "battery" ? "_" + obj.syssubtype : "") +
                        (obj.device ? "_" + obj.device : ""),
                ).append($(row));
            }
        }
    },
    startListening: function () {
        socket.on("stateChange", function (id, obj) {
            if (id === "infos.0.sysinfo.os.users") {
                const list = JSON.parse(obj.val);
                processUsersList(list);
            } else if (id === "infos.0.sysinfo.os.processes.list") {
                const list = JSON.parse(obj.val);
                processProcessesList(list);
            } else if (id === "infos.0.sysinfo.cpu.currentLoad.currentLoad_hist") {
                infoCharts.showCPU(obj.val.split(","));
            } else if (id === "infos.0.sysinfo.memory.info.used_hist") {
                infoCharts.showMemory(obj.val.split(","));
            } else {
                const types = id.split(".");
                const loadID = id.replace(/\./g, "_") + "_data";
                const toReplace = $("#" + loadID);
                if (toReplace.length > 0) {
                    toReplace.html(
                        formatInfo[types[3] + "." + types[types.length - 1]]
                            ? formatInfo[types[3] + "." + types[types.length - 1]](obj.val)
                            : obj.val,
                    );
                }
            }
        });
    },
};

function processProcessesList(list) {
    $("#infos_0_sysinfo_os_processes_list_datas").empty();

    list?.forEach(data => {
        let row = "<tr id='tr_process_" + data.pid + "'>";
        row += "<td>" + data.name + "</td>";
        row += "<td>" + formatter.formatPercent2Digits(data.cpu) + "</td>";
        row += "<td>" + formatter.formatPercent2Digits(data.mem) + "</td>";
        row += "<td>" + data.priority + "</td>";
        row += "<td>" + formatter.formatByte(data.memVsz) + "</td>";
        row += "<td>" + formatter.formatByte(data.memRss) + "</td>";
        row += "<td>" + data.started + "</td>";
        row += "<td>" + _(data.state) + "</td>";
        row += "<td>" + data.user + "</td>";
        row += "</tr>";
        $("#infos_0_sysinfo_os_processes_list_datas").append($(row));
    });
}

function processUsersList(list) {
    $("#infos_0_sysinfo_os_users_datas").empty();
    list?.forEach(data => {
        let row = "<tr id='tr_user_" + data.user + "'>";
        row += "<td>" + data.user + "</td>";
        row += "<td>" + data.tty + "</td>";
        row += "<td>" + data.date + "</td>";
        row += "<td>" + data.time + "</td>";
        row += "<td>" + data.ip + "</td>";
        row += "<td>" + data.command + "</td>";
        row += "</tr>";
        $("#infos_0_sysinfo_os_users_datas").append($(row));
    });
}
