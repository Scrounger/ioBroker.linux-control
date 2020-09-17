'use strict';

/*
 * Created with @iobroker/create-adapter v1.24.2
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const NodeSSH = require('node-ssh').NodeSSH;
const csvToJson = require('csvtojson');
const words = require('./admin/words.js');
const ping = require('ping');
const { exception } = require('console');

let language = 'en';
let _ = null;
var requestInterval;
var requestIntervalUserCommand;

this.isAdapterStart = false;

class LinuxControl extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'linux-control',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('objectChange', this.onObjectChange.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		try {
			// Initialize your adapter here
			await this.prepareTranslation();
			await this.setSelectableHosts()

			this.isAdapterStart = true;

			for (const host of this.config.hosts) {
				await this.refreshHost(host);
			}

			this.isAdapterStart = false;

		} catch (err) {
			this.errorHandling(err, '[onReady]');
		}
	}

	/**
	 * @param {object} host
	 */
	async refreshHost(host) {
		if (host.enabled) {
			this.log.info(`getting data from ${host.name} (${host.ip}:${host.port}${this.isAdapterStart ? ', Adapter start' : ''})`);

			await this.createObjectButton(`${host.name}.refresh`, _('refreshHost'));
			this.subscribeStates(`${host.name}.refresh`);

			let connection = await this.getConnection(host);

			await this.getInfos(connection, host);

			if (connection) {
				await this.createControls(host);
				await this.distributionInfo(connection, host);
				await this.updateInfos(connection, host);
				await this.servicesInfo(connection, host);

				await this.needrestart(connection, host);
				await this.folderSizes(connection, host);

				await this.userCommand(connection, host);

				connection.dispose();

				if (await this.getObjectAsync(`${host.name}.info.lastRefresh`)) {
					await this.setStateAsync(`${host.name}.info.lastRefresh`, new Date().getTime(), true);
				}

				this.log.info(`successful received data from ${host.name} (${host.ip}:${host.port})`);
			}

			// interval using timeout
			if (requestInterval) requestInterval = null;

			if (host.interval && host.interval > 0) {
				requestInterval = setTimeout(() => {
					this.refreshHost(host);
				}, host.interval * 60000);
			} else {
				this.log.info(`polling interval is deactivated for ${host.name} (${host.ip}:${host.port})`);
			}
		} else {
			this.log.debug(`getting data from ${host.name} (${host.ip}:${host.port}) -> not enabled!`);
		}
	}

	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 */
	async getInfos(connection, host) {
		let logPrefix = `[getInfos] ${host.name} (${host.ip}:${host.port}):`;

		const objects = require('./admin/lib/info.json');

		if (this.config.whitelist && this.config.whitelist["info"] && this.config.whitelist["info"].length > 0 && !this.config.blacklistDatapoints[host.name].includes('info.all')) {

			for (const propObj of objects) {
				if (this.config.whitelist["info"].includes(propObj.id) && !this.config.blacklistDatapoints[host.name].includes(`info.${propObj.id}`)) {
					let id = `${host.name.replace(' ', '_')}.info.${propObj.id}`;

					if (propObj.id === "is_online") {
						if (connection) {
							await this.createObjectString(id, propObj.name);
							await this.setStateAsync(id, true, true);
						} else {
							await this.createObjectString(id, propObj.name);
							await this.setStateAsync(id, false, true);
						}

					} else if (propObj.id === "ip") {
						await this.createObjectString(id, propObj.name);
						await this.setStateAsync(id, host.ip, true);

					} else {
						if (propObj.type === 'number') {
							await this.createObjectNumber(id, propObj.name);
						}
					}

				} else {
					await this.delMyObject(`${host.name.replace(' ', '_')}.info.${propObj.id}`, logPrefix);
				}
			}
		} else {
			if (this.isAdapterStart) {
				this.log.debug(`${logPrefix} no datapoints selected -> removing existing datapoints`);

				for (const propObj of objects) {
					await this.delMyObject(`${host.name.replace(' ', '_')}.info.${propObj.id}`);
				}
			}
		}
	}

	//#region Command Functions

	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 */
	async userCommand(connection, host) {
		let logPrefix = `[userCommand] ${host.name} (${host.ip}:${host.port}):`;

		try {
			/** @type {any[]} */
			let commandsList = this.config.commands;

			if (commandsList.length > 0) {
				let commands = commandsList.filter(x => {
					return x.host === host.name;
				});

				for (const cmd of commands) {
					if (cmd.enabled) {
						try {
							if ((!cmd.interval || cmd.interval === 0) && cmd.type !== 'button') {
								await this.userCommandExecute(connection, host, cmd);
							} else {
								if (this.isAdapterStart) {
									// adapter first run -> execute userCommands with diffrent polling interval
									if (cmd.type !== 'button') {
										this.log.debug(`${logPrefix} datapoint-id: ${cmd.name}, description: ${cmd.description}: first start of adapter -> run also command with diffrent polling interval configured`);
									} else {
										this.log.debug(`${logPrefix} datapoint-id: ${cmd.name}, description: ${cmd.description}: create button`);
									}

									await this.userCommandExecute(connection, host, cmd);
								} else {
									if (cmd.type !== 'button') {
										this.log.debug(`${logPrefix} datapoint-id: ${cmd.name}, description: ${cmd.description}: diffrent polling interval configured`);
									}
								}
							}
						} catch (err) {
							this.log.error(`${logPrefix} datapoint-id: ${cmd.name}, description: ${cmd.description}`);

							// No Sentry error report for user commands
							this.errorHandling(err, logPrefix);
						}
					} else {
						this.log.debug(`${logPrefix} datapoint-id: '${cmd.name}', description: '${cmd.description}' -> is not enabled!`);
					}
				}
			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
		}
	}

	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 * @param {object} cmd
	 */
	async userCommandExecute(connection, host, cmd) {
		let logPrefix = `[userCommandExecute] ${host.name} (${host.ip}:${host.port}):`;

		let establishedNewConnection = false;

		try {
			if (connection === undefined && cmd.interval && cmd.interval > 0 && cmd.type !== 'button') {
				establishedNewConnection = true;

				this.log.debug(`[userCommandExecute] ${host.name} (${host.ip}:${host.port}, id: ${cmd.name}, description: ${cmd.description}): diffrent polling interval -> create connection`);
				connection = await this.getConnection(host);
			}

			if (connection) {
				let id = `${host.name.replace(' ', '_')}.${cmd.name}`;

				if (cmd.type !== 'button') {
					let response = await this.sendCommand(connection, host, `${cmd.command}`, `[userCommandExecute] ${host.name} (${host.ip}:${host.port}, id: ${cmd.name}, description: ${cmd.description}):`);

					if (response) {
						if (cmd.type === 'string') {
							await this.createObjectString(id, cmd.description);
							await this.setStateAsync(id, response, true);
						} else if (cmd.type === 'number') {
							await this.createObjectNumber(id, cmd.description, cmd.unit);
							await this.setStateAsync(id, parseFloat(response), true);
						} else if (cmd.type === 'boolean') {
							await this.createObjectBoolean(id, cmd.description);
							await this.setStateAsync(id, (response === 'true' || parseInt(response) === 1) ? true : false, true);
						} else if (cmd.type === 'array') {
							await this.createObjectArray(id, cmd.description);
							await this.setStateAsync(id, JSON.parse(response), true);
						}
					} else {
						if (await this.getObjectAsync(id)) {
							if (cmd.type === 'string') {
								await this.setStateAsync(id, "", true);
							} else if (cmd.type === 'number') {
								await this.setStateAsync(id, 0, true);
							} else if (cmd.type === 'boolean') {
								await this.setStateAsync(id, false, true);
							} else if (cmd.type === 'array') {
								await this.setStateAsync(id, null, true);
							}
						}
					}
				} else {
					await this.createObjectButton(id, cmd.description);
					this.subscribeStates(id);
				}

				if (establishedNewConnection) {
					this.log.debug(`[userCommandExecute] ${host.name} (${host.ip}:${host.port}, id: ${cmd.name}, description: ${cmd.description}): diffrent polling interval -> close connection`);
					connection.dispose();
				}
			}

			if (cmd.interval && cmd.interval > 0 && cmd.type !== 'button') {
				// interval using timeout
				if (requestIntervalUserCommand) requestIntervalUserCommand = null;

				if (cmd.interval && cmd.interval > 0) {
					requestIntervalUserCommand = setTimeout(() => {
						this.userCommandExecute(undefined, host, cmd);
					}, cmd.interval * 1000);
				}
			}
		} catch (err) {
			this.log.error(`${logPrefix} datapoint-id: ${cmd.name}, description: ${cmd.description}`);

			// No Sentry error report for user commands
			this.errorHandling(err, logPrefix);
		}
	}

	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 */
	async folderSizes(connection, host) {
		let logPrefix = `[folderSizes] ${host.name} (${host.ip}:${host.port}):`;

		try {
			if (connection) {
				// @ts-ignore
				let folderList = this.config.folders;

				if (folderList.length > 0) {
					let hostFolders = folderList.filter(x => {
						return x.host === host.name;
					})

					for (const folder of hostFolders) {
						if (folder.enabled) {
							let unitFaktor = "/1024"

							if (folder.unit === 'GB') {
								unitFaktor = "/1024/1024"
							} else if (folder.unit === 'TB') {
								unitFaktor = "/1024/1024/1024"
							}

							let response = undefined;
							if (folder.fileNamePattern) {
								response = await this.sendCommand(connection, host, `${host.useSudo ? 'sudo -S ' : ''}find ${folder.path} -name "${folder.fileNamePattern}" -exec du -c {} + | tail -1 | awk '{printf $1${unitFaktor}}'`, logPrefix, undefined, false);
							} else {
								response = await this.sendCommand(connection, host, `${host.useSudo ? 'sudo -S ' : ''}du -sk ${folder.path} | awk '{ print $1 ${unitFaktor} }'`, logPrefix, undefined, false);
							}

							if (response) {
								let id = `${host.name.replace(' ', '_')}.folders.${folder.name}.size`;
								await this.createObjectNumber(id, _('folderSize'), folder.unit);

								let result = parseFloat(response).toFixed(parseInt(folder.digits) || 0);

								this.log.debug(`${logPrefix} ${id}: ${parseFloat(result)} ${folder.unit}`);
								await this.setStateAsync(id, parseFloat(result), true);

								if (folder.countFiles) {
									response = await this.sendCommand(connection, host, `${host.useSudo ? 'sudo -S ' : ''}find ${folder.path} -name "${folder.fileNamePattern ? folder.fileNamePattern : '*'}" | wc -l`, logPrefix, undefined, false);

									if (response) {
										let id = `${host.name.replace(' ', '_')}.folders.${folder.name}.files`;
										await this.createObjectNumber(id, _('countFilesInFolder'), _('files'));

										this.log.debug(`${logPrefix} ${id}: ${parseInt(response)} ${_('files')}`);
										await this.setStateAsync(id, parseInt(response), true);
									}
								}

								if (folder.lastChange) {
									response = await this.sendCommand(connection, host, `tmp=$(${host.useSudo ? 'sudo -S ' : ''}find ${folder.path} -name "${folder.fileNamePattern ? folder.fileNamePattern : '*'}" -type f -exec stat -c "%Y %n" -- {} \\; | sort -nr | head -n1 | awk '{print $2}') && date +%s -r $tmp`, logPrefix, undefined, false);

									if (response) {
										let id = `${host.name.replace(' ', '_')}.folders.${folder.name}.lastChange`;

										let timestamp = parseInt(response) * 1000;

										await this.createObjectNumber(id, _('last change'));

										this.log.debug(`${logPrefix} ${id}: ${timestamp} -> ${this.formatDate(timestamp, 'DD.MM.YYYY hh:mm')}`);
										await this.setStateAsync(id, timestamp, true);
									}
								}
							}

						} else {
							this.log.debug(`${logPrefix} getting size for '${host.name.replace(' ', '_')}.folders.${folder.name}' -> is not enabled!`);
						}
					}
				}
			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
		}
	}


	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 */
	async needrestart(connection, host) {
		let logPrefix = `[needrestart] ${host.name} (${host.ip}:${host.port}):`;

		const objects = require('./admin/lib/needrestart.json');

		try {
			// @ts-ignore
			if (this.config.whitelist && this.config.whitelist["needrestart"] && this.config.whitelist["needrestart"].length > 0 && !this.config.blacklistDatapoints[host.name].includes('needrestart.all')) {
				if (connection) {

					if (await this.cmdPackageExist(connection, host, 'needrestart')) {
						let response = await this.sendCommand(connection, host, `(tmp=$(${host.useSudo ? 'sudo -S ' : ''}/usr/sbin/needrestart -p -l | head -1) && echo "$tmp" | awk '{print $1}' && echo ", $tmp" | sed 's/.*Services=\\([0-9]*\\);.*/\\1/' && echo "$tmp" | sed 's/.*Containers=\\([0-9]*\\);.*/\\1/' && echo "$tmp" | sed 's/.*Sessions=\\([0-9]*\\);.*/\\1/') | awk '{printf "%s" (NR%4==0?RS:FS),$1}'`, logPrefix, undefined, false);

						if (response) {

							/** @type {object} */
							let parsed = await csvToJson({
								noheader: true,
								headers: ['needrestart', 'services', 'containers', 'sessions'],
								delimiter: [" "]
							}).fromString(response);

							this.log.debug(`${logPrefix} csvToJson result: ${JSON.stringify(parsed)}`);

							for (const obj of objects) {
								// @ts-ignore
								if (this.config.whitelist["needrestart"].includes(obj.id) && !this.config.blacklistDatapoints[host.name].includes(`needrestart.${obj.id}`)) {
									if (parsed && parsed[0] && parsed[0][obj.id]) {
										let id = `${host.name.replace(' ', '_')}.needrestart.${obj.id}`;

										if (obj.id === 'needrestart') {
											this.log.debug(`${logPrefix} ${id}: ${parsed[0][obj.id] === 'OK' ? false : true}`);

											await this.createObjectBoolean(id, _(obj.name));
											await this.setStateAsync(id, parsed[0][obj.id] === 'OK' ? false : true, true);
										}

										if (obj.type === 'number') {
											this.log.debug(`${logPrefix} ${id}: ${parseInt(parsed[0][obj.id])}`);

											await this.createObjectNumber(id, _(obj.name));
											await this.setStateAsync(id, parseInt(parsed[0][obj.id]), true);
										}
									}
								} else {
									await this.delMyObject(`${host.name.replace(' ', '_')}.needrestart.${obj.id}`, logPrefix);
								}
							}
						}

					} else {
						this.log.warn(`${logPrefix} package 'needrestart' not installed. You must install 'needrestart' to use this functions or deactivate the datapoints!`);

						let needRestartStates = await this.getStatesAsync(`${this.namespace}.${host.name.replace(' ', '_')}.needrestart.*`);
						for (const id of Object.keys(needRestartStates)) {
							await this.delMyObject(id);
						}
					}
				}
			} else {
				if (this.isAdapterStart) {
					this.log.debug(`${logPrefix} no datapoints selected -> removing existing datapoints`);

					let needRestartStates = await this.getStatesAsync(`${this.namespace}.${host.name.replace(' ', '_')}.needrestart.*`);
					for (const id of Object.keys(needRestartStates)) {
						await this.delMyObject(id);
					}
				}
			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
		}
	}


	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 * @param {string | undefined} serviceName
	 */
	async servicesInfo(connection, host, serviceName = undefined) {
		let logPrefix = `[servicesInfo] ${host.name} (${host.ip}:${host.port}):`;

		const objects = require('./admin/lib/services.json');

		try {
			// @ts-ignore
			if (this.config.whitelist && this.config.whitelist["services"] && this.config.whitelist["services"].length > 0 && !this.config.blacklistDatapoints[host.name].includes('services.all')) {
				if (connection) {
					let response = await this.sendCommand(connection, host, `systemctl list-units --type service --all --no-legend | awk '{out=""; for(i=5;i<=NF;i++){out=out" "$i}; print $1","$2","$3","$4","out}'${serviceName ? ` | grep ${serviceName}` : ''}`, logPrefix, undefined, false);

					if (response) {
						response = response.replace(/\t/g, ',')

						/** @type {object} */
						let parsed = await csvToJson({
							noheader: true,
							headers: ['id', 'load', 'active', 'running', 'description'],
							delimiter: [","]
						}).fromString(response);

						this.log.debug(`${logPrefix} csvToJson result: ${JSON.stringify(parsed)}`);

						// TODO: whitelist für services implementieren
						for (const result of parsed) {
							let idPrefix = `${host.name.replace(' ', '_')}.services.${result.id.replace('.service', '')}`;

							for (const obj of objects) {
								let id = `${idPrefix}.${obj.id}`;

								// @ts-ignore
								if (this.config.whitelist["services"].includes(obj.id) && !this.config.blacklistDatapoints[host.name].includes(`services.${obj.id}`) && (this.config.serviceWhiteList[host.name].includes(result.id.replace('.service', '')) || this.config.serviceWhiteList[host.name].length === 0)) {
									if (obj.type === 'string') {
										await this.createObjectString(id, obj.name);
										await this.setStateAsync(id, result[obj.id], true);
									} else if (obj.type === 'boolean') {
										await this.createObjectBoolean(id, obj.name);
										await this.setStateAsync(id, result[obj.id] === 'running' ? true : false, true);
									} else if (obj.type === 'button') {
										await this.createObjectButton(id, obj.name);
										this.subscribeStates(id);
									}
								} else {
									await this.delMyObject(id, logPrefix);
								}
							}
						}
					}
				}
			} else {
				if (this.isAdapterStart) {
					this.log.debug(`${logPrefix} no datapoints selected -> removing existing datapoints`);

					let servicesStates = await this.getStatesAsync(`${this.namespace}.${host.name.replace(' ', '_')}.services.*`);
					for (const id of Object.keys(servicesStates)) {
						await this.delMyObject(id);
					}
				}
			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
		}
	}

	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 */
	async distributionInfo(connection, host) {
		let logPrefix = `[distributionInfo] ${host.name} (${host.ip}:${host.port}):`;

		const objects = require('./admin/lib/distribution.json');

		try {
			// @ts-ignore
			if (this.config.whitelist && this.config.whitelist["distribution"] && this.config.whitelist["distribution"].length > 0 && !this.config.blacklistDatapoints[host.name].includes('distribution.all')) {
				if (connection) {
					let response = await this.sendCommand(connection, host, "cat /etc/os-release", logPrefix, undefined, false);

					if (response) {

						/** @type {object} */
						let parsed = await csvToJson({
							noheader: true,
							headers: ['prop', 'val'],
							delimiter: ["="]
						}).fromString(response);

						this.log.debug(`${logPrefix} csvToJson result: ${JSON.stringify(parsed)}`);

						for (const propObj of objects) {
							let obj = parsed.find(x => x.prop === propObj.propName);

							// @ts-ignore
							if (this.config.whitelist["distribution"].includes(propObj.id) && !this.config.blacklistDatapoints[host.name].includes(`distribution.${propObj.id}`)) {
								if (obj && obj.prop && obj.val) {
									let id = `${host.name.replace(' ', '_')}.distribution.${propObj.id}`;

									await this.createObjectString(id, propObj.name);
									await this.setStateAsync(id, obj.val, true);

								} else {
									this.log.warn(`${logPrefix} property '${propObj.propName}' not exist in result!`);
								}
							} else {
								await this.delMyObject(`${host.name.replace(' ', '_')}.distribution.${propObj.id}`, logPrefix);
							}
						}
					}
				}
			} else {
				if (this.isAdapterStart) {
					this.log.debug(`${logPrefix} no datapoints selected -> removing existing datapoints`);

					for (const propObj of objects) {
						await this.delMyObject(`${host.name.replace(' ', '_')}.distribution.${propObj.id}`);
					}
				}
			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
		}
	}


	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 */
	async updateInfos(connection, host) {
		let logPrefix = `[updateInfos] ${host.name} (${host.ip}:${host.port}):`;
		try {
			if (connection) {
				await this.cmdAptUpdate(connection, host);
			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
			return undefined;
		}
	}

	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 * @param {Boolean} restart
	 * @param {string | undefined} responseId
	 */
	async cmdShutdown(connection, host, restart = false, responseId = undefined) {
		let logPrefix = `[cmdShutdown] ${host.name} (${host.ip}:${host.port}):`;

		try {
			if (connection) {

				let cmd = `${host.useSudo ? 'sudo -S ' : ''}shutdown 0`
				if (restart) {
					cmd = `${host.useSudo ? 'sudo -S ' : ''}shutdown -r 0`
				}

				await this.sendCommand(connection, host, cmd, logPrefix, responseId);
			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
		}
	}

	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 * @param {string} responseId
	 */
	async cmdAptUpgrade(connection, host, responseId) {
		let logPrefix = `[cmdAptUpgrade] ${host.name} (${host.ip}:${host.port}):`;

		try {
			if (connection) {
				let response = await this.sendCommand(connection, host, `${host.useSudo ? 'sudo -S ' : ''}DEBIAN_FRONTEND=noninteractive apt-get upgrade -y`, logPrefix, responseId);

				if (response) {
					await this.setStateAsync(responseId, response, true);
					await this.cmdAptUpdate(connection, host);
				}

			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
		}
	}

	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 * @param {string} packageName
	 * @returns {Promise<boolean>}
	 */
	async cmdPackageExist(connection, host, packageName) {
		let logPrefix = `[cmdPackageExist] ${host.name} (${host.ip}:${host.port}):`;

		try {
			if (connection) {
				let response = await this.sendCommand(connection, host, `dpkg-query --list | grep -i ${packageName}`, logPrefix);

				if (response) {
					return true;
				} else {
					return false;
				}

			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
		}

		return false;
	}

	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {object} host
	 * @param {string | undefined} responseId
	 */
	async cmdAptUpdate(connection, host, responseId = undefined) {
		let logPrefix = `[cmdAptUpdate] ${host.name} (${host.ip}:${host.port}):`;

		const objects = require('./admin/lib/updates.json');

		try {
			// @ts-ignore
			if (this.config.whitelist && this.config.whitelist["updates"] && this.config.whitelist["updates"].length > 0 && !this.config.blacklistDatapoints[host.name].includes('updates.all')) {
				if (connection) {
					// run apt update
					let response = await this.sendCommand(connection, host, `${host.useSudo ? 'sudo -S ' : ''}apt-get update`, logPrefix, responseId, false);

					if (response) {
						response = await this.sendCommand(connection, host, `apt-get --just-print upgrade 2>&1 | perl -ne 'if (/Inst\\s([\\w,\\-,\\d,\\.,~,:,\\+]+)\\s\\[([\\w,\\-,\\d,\\.,~,:,\\+]+)\\]\\s\\(([\\w,\\-,\\d,\\.,~,:,\\+]+)\\)? /i) {print \"$1,$2,$3\\n\"}' \| column -s \" \" -t`, logPrefix, undefined, false);

						let parsed = [];
						let newPackages = 0;

						if (response) {
							parsed = await csvToJson({
								noheader: true,
								headers: ['name', 'installedVersion', 'availableVersion'],
								delimiter: [","]
								// @ts-ignore
							}).fromString(response);

							newPackages = parsed.length;
						}

						// Number of new Packages
						let id = `${host.name.replace(' ', '_')}.updates.newPackages`;
						// @ts-ignore
						if (this.config.whitelist["updates"].includes("newPackages") && !this.config.blacklistDatapoints[host.name].includes(`updates.newPackages`)) {
							this.log.debug(`${logPrefix} ${id}: ${newPackages}`);

							await this.createObjectNumber(id, `newPackages`, `packages`);
							await this.setStateAsync(id, newPackages, true);
						} else {
							await this.delMyObject(id, logPrefix);
						}

						// is upgradable
						id = `${host.name.replace(' ', '_')}.updates.upgradable`;
						// @ts-ignore
						if (this.config.whitelist["updates"].includes("upgradable") && !this.config.blacklistDatapoints[host.name].includes(`updates.upgradable`)) {
							this.log.debug(`${logPrefix} ${id}: ${newPackages > 0 ? true : false}`);

							await this.createObjectBoolean(id, `upgradable`);
							await this.setStateAsync(id, newPackages > 0 ? true : false, true);
						} else {
							await this.delMyObject(id, logPrefix);
						}

						// list of new packages
						id = `${host.name.replace(' ', '_')}.updates.newPackagesList`;
						// @ts-ignore
						if (this.config.whitelist["updates"].includes("newPackagesList") && !this.config.blacklistDatapoints[host.name].includes(`updates.newPackagesList`)) {

							if (newPackages > 0) {
								this.log.debug(`${logPrefix} ${id}: ${JSON.stringify(parsed)}`);

								await this.createObjectString(id, `newPackagesList`);
								await this.setStateAsync(id, JSON.stringify(parsed), true);
							} else {
								await this.createObjectString(id, `newPackagesList`);
								await this.setStateAsync(id, '', true);
							}
						} else {
							await this.delMyObject(id, logPrefix);
						}
					}

					// last update
					let id = `${host.name.replace(' ', '_')}.updates.lastUpdate`;
					// @ts-ignore
					if (this.config.whitelist["updates"].includes("lastUpdate") && !this.config.blacklistDatapoints[host.name].includes(`updates.lastUpdate`)) {
						response = await this.sendCommand(connection, host, "dpkg-query -f '${db-fsys:Last-Modified}\n' -W | sort -nr | head -1", logPrefix, responseId, false);
						if (response) {
							let timestamp = parseInt(response) * 1000;

							this.log.debug(`${logPrefix} ${id}: ${timestamp} -> ${this.formatDate(timestamp, 'DD.MM.YYYY hh:mm')}`);

							await this.createObjectNumber(id, `lastUpdate`);
							await this.setStateAsync(id, timestamp, true);
						} else {
							// Fallback method
							response = await this.sendCommand(connection, host, "grep installed /var/log/dpkg.log | tail -1 | cut -c1-19", logPrefix, responseId, false);
							if (response) {
								let timestamp = Date.parse(response);

								this.log.debug(`${logPrefix} ${id}: Fallback method: ${timestamp} -> ${this.formatDate(timestamp, 'DD.MM.YYYY hh:mm')}`);

								await this.createObjectNumber(id, `lastUpdate`);
								await this.setStateAsync(id, timestamp, true);
							}
						}
					} else {
						await this.delMyObject(id, logPrefix);
					}
				}
			} else {
				if (this.isAdapterStart) {
					this.log.debug(`${logPrefix} no datapoints selected -> removing existing datapoints`);

					for (const propObj of objects) {
						await this.delMyObject(`${host.name.replace(' ', '_')}.updates.${propObj.id}`);
					}
				}
			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
		}
	}

	/**
	 * @param {NodeSSH | undefined} connection
	 * @param {string} cmd
	 * @param {string} logPrefix
	 * @param {string | undefined} responseId
	 * @param {boolean | undefined} responseErrorSendToSentry
	 * @returns {Promise<string | undefined>}
	 */
	async sendCommand(connection, host, cmd, logPrefix, responseId = undefined, responseErrorSendToSentry = false) {
		try {
			if (connection) {
				this.log.debug(`${logPrefix} send command: '${cmd}'`);

				let response = undefined;
				if (host.useSudo && cmd.includes('sudo -S')) {
					// using sudo
					let password = await this.getPassword(host);
					response = await connection.execCommand(cmd, { execOptions: { pty: true }, stdin: `${password}\n` });

					if (!response.stderr) {
						response.stdout = response.stdout.replace(password, "")
							.replace(`[sudo] password for ${host.user}: \r`, "")
							.replace('sudo: setrlimit(RLIMIT_CORE): Operation not permitted', "").replace("\n\n", "")
							.replace('[sudo] Passwort für pi: \r', "")
							.replace('[sudo] Passwort für pi: \n', "");
					}
				} else if (cmd.includes('sudo') && !cmd.includes('sudo -S')) {
					this.errorHandling(new ResponseError(`${logPrefix} you must use 'sudo -S' instead of 'sudo' only!`), logPrefix, responseErrorSendToSentry);
					return undefined;
				} else {
					response = await connection.execCommand(cmd);
				}

				if (!response.stderr) {
					this.log.debug(`${logPrefix} response stdout: ${response.stdout}`);
					await this.reportResponse(responseId, 'successful');
					return response.stdout;
				} else {
					if (response.stderr.includes('Shutdown scheduled for')) {
						if (cmd.includes('-r')) {
							this.log.info(`${logPrefix} restart`);
						} else {
							this.log.info(`${logPrefix} shutdown`);
						}
						await this.reportResponse(responseId, 'successful');
					} else {
						this.errorHandling(new ResponseError(`${logPrefix} ${response.stderr}`), logPrefix, responseErrorSendToSentry);

						await this.reportResponse(responseId, response.stderr);
					}
					return undefined;
				}
			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
			await this.reportResponse(responseId, err.message);
			return undefined;
		}
	}

	//#endregion

	//#region Functions

	/**
	 * @param {string | undefined} responseId
	 * @param {string } msg
	 */
	async reportResponse(responseId, msg) {
		if (responseId) {
			await this.setStateAsync(responseId, msg, true);
		}
	}

	/**
	 * @param {object} host
	 * @returns {Promise<NodeSSH | undefined>}
	 */
	async getConnection(host) {
		try {
			let pingResult = await ping.promise.probe(host.ip, { timeout: parseInt(host.timeout) || 5 });

			if (pingResult.alive) {
				let obj = await this.getForeignObjectAsync('system.config');
				let password = await this.getPassword(host);

				let ssh = new NodeSSH();

				let options = {
					host: host.ip,
					port: host.port,
					username: host.user,
					password: password,
					readyTimeout: parseInt(host.timeout) * 1000 || 5000
				}

				if (host.rsakey && host.rsakey.length > 0) {
					this.log.debug(`[getConnection] Host '${host.name}' (${host.ip}:${host.port}): using rsa key for authentification`);
					options.passphrase = password;
					options.privateKey = host.rsakey;
				} else if (host.useSudo) {
					this.log.debug(`[getConnection] Host '${host.name}' (${host.ip}:${host.port}): using sudo for authentification`);
				}

				return await ssh.connect(options);
			} else {
				this.log.info(`[getConnection] Host '${host.name}' (${host.ip}:${host.port}) seems not to be online`);
				return undefined;
			}
		} catch (err) {
			this.log.error(`[getConnection] Could not establish a connection to '${host.name}' (${host.ip}:${host.port})!`);
			this.errorHandling(err, '[getConnection]', false);
			return undefined;
		}
	}

	async getPassword(host) {
		let obj = await this.getForeignObjectAsync('system.config');
		if (obj && obj.native && obj.native.secret) {
			//noinspection JSUnresolvedVariable
			return this.decryptPassword(obj.native.secret, host.password);
		} else {
			//noinspection JSUnresolvedVariable
			return this.decryptPassword("Zgfr56gFe87jJOM", host.password);
		}
	}

	async setSelectableHosts() {
		let hostObj = await this.getObjectAsync(`command.host`);
		if (hostObj && hostObj.common) {
			let hostStates = ''
			// @ts-ignore
			for (const host of this.config.hosts) {
				if (host) {
					// @ts-ignore
					hostStates = hostStates + `${host.name}:${host.name};`
				}

			}
			hostObj.common.states = hostStates;

			await this.setObjectAsync(`command.host`, hostObj);
			if (hostStates) {
				this.subscribeStates(`command.execute`)
			}
		}
	}

	/**
	 * Function to decrypt passwords
	 * @param {string | { charCodeAt: (arg0: number) => number; }[]} key
	 * @param {string} value
	 */
	decryptPassword(key, value) {
		let result = "";
		for (let i = 0; i < value.length; ++i) {
			result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
		}
		return result;
	}

	async prepareTranslation() {
		// language for Tranlation
		var sysConfig = await this.getForeignObjectAsync('system.config');
		if (sysConfig && sysConfig.common && sysConfig.common['language']) {
			language = sysConfig.common['language']
		}

		// language Function
		/**
		 * @param {string | number} string
		 */
		_ = function (string) {
			if (words[string]) {
				return words[string][language]
			} else {
				return string;
			}
		}
	}

	/**
	 * @param {string} id
	 */
	getHostById(id) {
		// @ts-ignore
		return this.config.hosts.find(x =>
			x.name.replace(/\s/g, "_") === id.replace(/\s/g, "_"));
	}
	//#endregion

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			clearTimeout(requestInterval);
			clearTimeout(requestIntervalUserCommand);
			this.log.info('cleaned everything up...');
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.info(`object ${id} deleted`);
		}
	}



	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		if (state) {
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			if (id.includes('.control.')) {
				let hostIdSplitted = id.replace(`${this.namespace}.`, '').split('.');

				/** @type {object} */
				let host = this.getHostById(hostIdSplitted[0]);

				if (host) {
					let responseId = id.replace(hostIdSplitted[hostIdSplitted.length - 1], 'response');

					if (hostIdSplitted[hostIdSplitted.length - 1] === 'aptUpdate') {
						let connection = await this.getConnection(host);

						if (connection) {
							await this.reportResponse(responseId, '');
							await this.cmdAptUpdate(connection, host, responseId);
							connection.dispose();
						}

					} else if (hostIdSplitted[hostIdSplitted.length - 1] === 'aptUpgrade') {
						let connection = await this.getConnection(host);

						if (connection) {
							await this.reportResponse(responseId, '');
							await this.cmdAptUpgrade(connection, host, responseId);
							connection.dispose();
						}

					} else if (hostIdSplitted[hostIdSplitted.length - 1] === 'shutdown') {
						let connection = await this.getConnection(host);

						if (connection) {
							await this.reportResponse(responseId, '');
							await this.cmdShutdown(connection, host, false, responseId);
							connection.dispose();
						}

					} else if (hostIdSplitted[hostIdSplitted.length - 1] === 'restart') {
						let connection = await this.getConnection(host);

						if (connection) {
							await this.reportResponse(responseId, '');
							await this.cmdShutdown(connection, host, true, responseId);
							connection.dispose();
						}
					}
				}
			} else if (id.includes('.services.')) {
				let hostIdSplitted = id.replace(`${this.namespace}.`, '').split('.');
				let serviceName = hostIdSplitted[hostIdSplitted.length - 2] + ".service";

				/** @type {object} */
				let host = this.getHostById(hostIdSplitted[0]);

				if (host) {
					if (hostIdSplitted[hostIdSplitted.length - 1] === 'restart') {
						let connection = await this.getConnection(host);
						let logPrefix = `[sendCommand restart] ${host.name} (${host.ip}:${host.port}):`;

						if (connection) {
							await this.sendCommand(connection, host, `${host.useSudo ? 'sudo -S ' : ''}systemctl restart ${serviceName}`, logPrefix);
							await this.servicesInfo(connection, host, serviceName);

							await this.servicesInfo(connection, host);

							connection.dispose();
						}
					} else if (hostIdSplitted[hostIdSplitted.length - 1] === 'start') {
						let connection = await this.getConnection(host);
						let logPrefix = `[sendCommand start] ${host.name} (${host.ip}:${host.port}):`;

						if (connection) {
							await this.sendCommand(connection, host, `${host.useSudo ? 'sudo -S ' : ''}systemctl start ${serviceName}`, logPrefix);
							await this.servicesInfo(connection, host, serviceName);

							await this.servicesInfo(connection, host);

							connection.dispose();
						}
					} else if (hostIdSplitted[hostIdSplitted.length - 1] === 'stop') {
						let connection = await this.getConnection(host);
						let logPrefix = `[sendCommand stop] ${host.name} (${host.ip}:${host.port}):`;

						if (connection) {
							await this.sendCommand(connection, host, `${host.useSudo ? 'sudo -S ' : ''}systemctl stop ${serviceName}`, logPrefix);
							await this.servicesInfo(connection, host, serviceName);

							await this.servicesInfo(connection, host);

							connection.dispose();
						}
					}
				}
			} else if (id.includes('.command.execute')) {
				let cmd = await this.getStateAsync(`${this.namespace}.command.command`);
				let hostId = await this.getStateAsync(`${this.namespace}.command.host`);

				let responseId = `${this.namespace}.command.response`;

				if (hostId && hostId.val) {
					/** @type {object} */
					let host = this.getHostById(hostId.val.toString());

					if (host) {
						if (cmd && cmd.val) {
							let connection = await this.getConnection(host);

							if (connection) {
								let logPrefix = `[sendCommand] ${host.name} (${host.ip}:${host.port}):`;

								await this.reportResponse(responseId, '');

								let response = await this.sendCommand(connection, host, cmd.val.toString(), logPrefix, responseId);
								if (response) {
									await this.reportResponse(responseId, response);
								}

								// TODO: wieder rein machen
								// await this.setStateAsync(`${this.namespace}.command.command`, '', true);
								connection.dispose();
							}
						} else {
							this.log.warn(`execute command: no command to execute is defined!`);
							await this.reportResponse(responseId, 'no command to execute is defined!');
						}
					}
				} else {
					this.log.warn(`execute command: no host is selected!`);
					await this.reportResponse(responseId, 'no host is selected!');
				}
			} else if (id.includes(`.refresh`)) {
				let hostIdSplitted = id.replace(`${this.namespace}.`, '').split('.');

				/** @type {object} */
				let host = this.getHostById(hostIdSplitted[0]);

				if (host) {
					if (id.includes(`${host.name}.refresh`)) {
						await this.refreshHost(host);
					}
				}
			} else {
				// user buttons
				let hostIdSplitted = id.replace(`${this.namespace}.`, '').split('.');

				/** @type {object} */
				let host = this.getHostById(hostIdSplitted[0]);

				if (host) {
					let cmdId = id.replace(`${this.namespace}.${host.name}.`, '');

					// @ts-ignore
					let commandsList = this.config.commands;
					if (commandsList.length > 0) {
						let command = commandsList.filter(x => {
							return x.host === host.name && x.name === cmdId;
						});

						if (command && command.length === 1) {
							command = command[0];

							let connection = await this.getConnection(host);
							let logPrefix = `[send userCommand] ${host.name} (${host.ip}:${host.port}) - ${cmdId}:`;

							if (connection && command && command.command) {
								await this.sendCommand(connection, host, command.command, logPrefix);

								connection.dispose();
							}

						}
					}
				}
			}
		}
	}

	//#region Objects Functions

	/**
	 * @param {string} id
	 */
	async delMyObject(id, logPrefix = undefined) {
		if (this.isAdapterStart) {
			if (await this.getObjectAsync(id)) {
				if (id && logPrefix) {
					this.log.debug(`${logPrefix} datapoint '${id}' is not selected -> removing existing datapoint`);
				}

				await this.delObjectAsync(id);
			}
		}
	}

	/**
	 * @param {object} host
	 */
	async createControls(host) {
		let logPrefix = `[createControls] ${host.name} (${host.ip}:${host.port}):`;

		try {
			let idPrefix = `${host.name.replace(' ', '_')}.control`;
			const objects = require('./admin/lib/control.json');

			// @ts-ignore
			if (this.config.whitelist && this.config.whitelist["control"] && this.config.whitelist["control"].length > 0 && !this.config.blacklistDatapoints[host.name].includes('control.all')) {
				for (const obj of objects) {

					// @ts-ignore
					if (this.config.whitelist["control"].includes(obj.id) && !this.config.blacklistDatapoints[host.name].includes(`control.${obj.id}`)) {

						if (obj.type === 'button') {
							await this.createObjectButton(`${idPrefix}.${obj.id}`, obj.name);
							this.subscribeStates(`${idPrefix}.${obj.id}`);
						} else if (obj.type === 'string') {
							await this.createObjectString(`${idPrefix}.${obj.id}`, obj.name);
						}
					} else {
						await this.delMyObject(`${idPrefix}.${obj.id}`, logPrefix);
					}
				}
			} else {
				if (this.isAdapterStart) {
					this.log.debug(`${logPrefix} no datapoints selected -> removing existing datapoints`);

					for (const obj of objects) {
						await this.delMyObject(`${idPrefix}.${obj.id}`);
					}
				}
			}
		} catch (err) {
			this.errorHandling(err, logPrefix);
		}
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	async createObjectString(id, name) {
		if (this.isAdapterStart) {
			let obj = await this.getObjectAsync(id);

			if (obj) {
				if (obj.common.name !== _(name)) {
					obj.common.name = _(name);
					await this.setObjectAsync(id, obj);
				}
			} else {
				await this.setObjectNotExistsAsync(id,
					{
						type: 'state',
						common: {
							name: _(name),
							desc: _(name),
							type: 'string',
							read: true,
							write: false,
							role: 'value'
						},
						native: {}
					});
			}
		}
	}

	/**
	* @param {string} id
	* @param {string} name
	* @param {any} unit
	*/
	async createObjectNumber(id, name, unit = undefined) {
		if (this.isAdapterStart) {
			let obj = await this.getObjectAsync(id);

			if (obj) {
				if (obj.common.name !== _(name) || obj.common['unit'] !== _(unit)) {
					obj.common.name = _(name);
					obj.common['unit'] = _(unit);

					await this.setObjectAsync(id, obj);
				}
			} else {
				await this.setObjectNotExistsAsync(id,
					{
						type: 'state',
						common: {
							name: _(name),
							type: 'number',
							unit: unit,
							read: true,
							write: false,
							role: 'value'
						},
						native: {}
					});
			}
		}
	}


	/**
	 * @param {string} id
	 * @param {string} name
	 */
	async createObjectBoolean(id, name) {
		if (this.isAdapterStart) {
			let obj = await this.getObjectAsync(id);

			if (obj) {
				if (obj.common.name !== _(name)) {
					obj.common.name = _(name);
					await this.setObjectAsync(id, obj);
				}
			} else {
				await this.setObjectNotExistsAsync(id,
					{
						type: 'state',
						common: {
							name: _(name),
							type: 'boolean',
							read: true,
							write: false,
							role: 'value',
							def: false
						},
						native: {}
					});
			}
		}
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	async createObjectArray(id, name) {
		if (this.isAdapterStart) {
			let obj = await this.getObjectAsync(id);

			if (obj) {
				if (obj.common.name !== _(name)) {
					obj.common.name = _(name);
					await this.setObjectAsync(id, obj);
				}
			} else {
				await this.setObjectNotExistsAsync(id,
					{
						type: 'state',
						common: {
							name: _(name),
							desc: _(name),
							type: 'array',
							read: true,
							write: false,
							role: 'value'
						},
						native: {}
					});
			}
		}
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	async createObjectButton(id, name) {
		if (this.isAdapterStart) {
			let obj = await this.getObjectAsync(id);

			if (obj) {
				if (obj.common.name !== _(name)) {
					obj.common.name = _(name);
					await this.setObjectAsync(id, obj);
				}
			} else {
				await this.setObjectNotExistsAsync(id,
					{
						type: 'state',
						common: {
							name: _(name),
							role: 'button',
							type: 'boolean',
							read: false,
							write: true
						},
						native: {}
					});
			}
		}
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	async createMyChannel(id, name) {
		if (this.isAdapterStart) {
			let obj = await this.getObjectAsync(id);

			if (obj) {
				if (obj.common.name !== _(name)) {
					obj.common.name = _(name);
					await this.setObjectAsync(id, obj);
				}
			} else {
				await this.setObjectNotExistsAsync(id,
					{
						type: 'channel',
						common: {
							name: _(name),
						},
						native: {}
					});
			}
		}
	}

	/**
	 * @param {Error} err
	 * @param {string} logPrefix
	 * @param {boolean} sendToSentry
	 */
	errorHandling(err, logPrefix, sendToSentry = true) {
		if (err.name === 'ResponseError') {
			if (err.message.includes('Permission denied') || err.message.includes('Keine Berechtigung')) {
				this.log.error(`Permisson denied. Check the permission rights of your user on your linux devices! Perhaps you need to use 'sudo'?`);
			}
			this.log.error(`${logPrefix} response error: ${err.message.replace(logPrefix, '')}, stack: ${err.stack}`);
		} else {
			this.log.error(`${logPrefix} error: ${err.message}, stack: ${err.stack}`);
		}

		if (sendToSentry) {
			if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
				const sentryInstance = this.getPluginInstance('sentry');
				if (sentryInstance) {
					if (!err.message.includes('Permission denied') && !err.message.includes('Keine Berechtigung') &&
						!err.message.includes('No such file or directory') && !err.message.includes('Datei oder Verzeichnis nicht gefunden') &&
						!err.message.includes('Not connected to server') &&
						!err.message.includes('command not found')) {

						err.message = `${logPrefix} ${err.message}`;
						sentryInstance.getSentryObject().captureException(err);
					}
				}
			}
		}
	}



	//#endregion

	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.message" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }

}

class ResponseError extends Error {
	/**
	 * @param {string} message
	 */
	constructor(message) {
		super(message); // (1)
		this.name = 'ResponseError'; // (2)
	}
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new LinuxControl(options);
} else {
	// otherwise start the instance directly
	new LinuxControl();
}

