var hosts = [];
var folders = [];
var commands = [];
var serviceWhiteList = [];
var blacklistDatapoints = [];
var secret;
var _settings;

// This will be called by the admin adapter when the settings page loads
async function load(settings, onChange) {
	// example: select elements with id=key and class=value and insert value
	if (!settings) return;

	hosts = settings.hosts || [];
	folders = settings.folders || [];
	commands = settings.commands || [];
	serviceWhiteList = settings.serviceWhiteList || [];
	blacklistDatapoints = settings.blacklistDatapoints || [];

	// @ts-ignore
	socket.emit('getObject', 'system.config', function (err, obj) {
		secret = (obj.native ? obj.native.secret : '') || 'Zgfr56gFe87jJOM';
		loadHostsTable(settings, hosts, onChange);
	});

	$('.value').each(function () {
		var $key = $(this);
		var id = $key.attr('id');
		if ($key.attr('type') === 'checkbox') {
			// do not call onChange direct, because onChange could expect some arguments
			$key.prop('checked', settings[id])
				.on('change', () => onChange())
				;
		} else {
			// do not call onChange direct, because onChange could expect some arguments
			$key.val(settings[id])
				.on('change', () => onChange())
				.on('keyup', () => onChange())
				;
		}
	});

	_settings = settings;

	await createTreeViews(settings, onChange);

	createFoldersTable(folders, hosts, onChange);
	createCommandsTable(commands, hosts, onChange);
	createServicesWhiteListChips(hosts, settings, onChange);
	createDatapointsBlacklistChips(hosts, settings, onChange);

	eventsHandler(settings, onChange);

	onChange(false);

	// reinitialize all the Materialize labels on the page if you are dynamically adding inputs:
	if (M) M.updateTextFields();
}

function eventsHandler(settings, onChange) {
	$('.foldersTab').on('click', function () {
		//recreate Table on Tab click -> dynamically create select options
		hosts = table2values('hosts');
		folders = table2values('folders');

		createFoldersTable(folders, hosts, onChange);
	});

	$('.mycommandsTab').on('click', function () {
		//recreate Table on Tab click -> dynamically create select options
		hosts = table2values('hosts');
		commands = table2values('commands');

		createCommandsTable(commands, hosts, onChange);
	});

	$('.servicesTab').on('click', function () {
		//recreate Table on Tab click -> dynamically create select options
		hosts = table2values('hosts');

		for (const host of hosts) {
			serviceWhiteList[host.name] = chips2list(`.whitelistServices_${host.name}`)
		}

		createServicesWhiteListChips(hosts, settings, onChange);
	});

	$('.datapointsTab').on('click', function () {
		//recreate Table on Tab click -> dynamically create select options
		hosts = table2values('hosts');

		for (const host of hosts) {
			blacklistDatapoints[host.name] = chips2list(`.blacklistDatapoints_${host.name}`)
		}

		createDatapointsBlacklistChips(hosts, settings, onChange);
	});
}

async function createTreeViews(settings, onChange) {

	let tree = []

	for (const key of Object.keys(settings.whitelist)) {
		let propList = await getObjects(key);

		let children = [];
		let expanded = false;
		for (const child of propList) {

			let selected = false;
			if (settings.whitelist[key] && settings.whitelist[key].includes(child.id)) {
				selected = true;
				expanded = true;
			}

			children.push({
				title: `<div class="fancytree-item-title-id">${child.id}</div><div class="fancytree-item-title-name">${_(child.name)}</div>`,
				key: `${key}.${child.id}`,
				selected: selected
			})
		}

		tree.push({
			title: `<div class="fancytree-folder-title-id">${key}</div><div class="fancytree-item-title-name">${_(`root_${key}`)}</div>`,
			key: key,
			folder: true,
			expanded: expanded,
			children: children
		})
	}

	$(`#tree_datapoints`).fancytree({
		extensions: ["dnd5"],						// Drag & Drop lib
		activeVisible: true,                        // Make sure, active nodes are visible (expanded)
		aria: true,                                 // Enable WAI-ARIA support
		autoActivate: true,                         // Automatically activate a node when it is focused using keyboard
		autoCollapse: false,                        // Automatically collapse all siblings, when a node is expanded
		autoScroll: false,                          // Automatically scroll nodes into visible area
		clickFolderMode: 2,                         // 1:activate, 2:expand, 3:activate and expand, 4:activate (dblclick expands)
		checkbox: true,                             // Show check boxes
		checkboxAutoHide: false,                    // Display check boxes on hover only
		debugLevel: 0,                              // 0:quiet, 1:errors, 2:warnings, 3:infos, 4:debug
		disabled: false,                            // Disable control
		focusOnSelect: false,                       // Set focus when node is checked by a mouse click
		escapeTitles: false,                        // Escape `node.title` content for display
		generateIds: false,                         // Generate id attributes like <span id='fancytree-id-KEY'>
		keyboard: true,                             // Support keyboard navigation
		keyPathSeparator: "/",                      // Used by node.getKeyPath() and tree.loadKeyPath()
		minExpandLevel: 1,                          // 1: root node is not collapsible
		quicksearch: false,                         // Navigate to next node by typing the first letters
		rtl: false,                                 // Enable RTL (right-to-left) mode
		selectMode: 3,                              // 1:single, 2:multi, 3:multi-hier
		tabindex: "0",                              // Whole tree behaves as one single control
		titlesTabbable: false,                      // Node titles can receive keyboard focus
		tooltip: false,                             // Use title as tooltip (also a callback could be specified)
		// icon: function (event, data) {
		//     if (data.node.isFolder()) {
		//         return "unifi.png";
		//     }
		// },
		source:
			tree
		,
		click: function (event, data) {
			if (data.targetType === 'title' && !data.node.folder) {
				data.node.setSelected(!data.node.isSelected());
			}

			if (data.targetType === 'checkbox' && data.node.folder) {
				data.node.setExpanded(!data.node.isSelected());
			}
		},
		select: function (event, data) {

			// Funktion um alle title auszulesen, kann für Übersetzung verwendet werden -> bitte drin lassen!
			// var selKeys = $.map(data.tree.getSelectedNodes(), function (node) {
			//     if (node.children === null) {
			//         return node.title;
			//     }
			// });
			// console.log(selKeys.join('\n').replace(/_/g, " "));

			onChange();
		},
		dnd5: {
			// // Available options with their default:
			// autoExpandMS: 1500,           // Expand nodes after n milliseconds of hovering.
			// dropMarkerOffsetX: -24,       // absolute position offset for .fancytree-drop-marker
			// // relatively to ..fancytree-title (icon/img near a node accepting drop)
			// dropMarkerInsertOffsetX: -16, // additional offset for drop-marker with hitMode = "before"/"after"
			// effectAllowed: "all",         // Restrict the possible cursor shapes and modifier operations 
			// // (can also be set in the dragStart event)
			// dropEffectDefault: "move",    // Default dropEffect ('copy', 'link', or 'move') 
			// // when no modifier is pressed (overide in dragDrag, dragOver).
			// multiSource: false,           // true: Drag multiple (i.e. selected) nodes. 
			// // Also a callback() is allowed to return a node list
			// preventForeignNodes: false,   // Prevent dropping nodes from another Fancytree
			// preventLazyParents: true,     // Prevent dropping items on unloaded lazy Fancytree nodes
			// preventNonNodes: false,       // Prevent dropping items other than Fancytree nodes
			// preventRecursion: true,       // Prevent dropping nodes on own descendants when in move-mode
			// preventSameParent: false,     // Prevent dropping nodes under same direct parent
			// preventVoidMoves: true,       // Prevent moving nodes 'before self', etc.
			scroll: true,                 // Enable auto-scrolling while dragging
			scrollSensitivity: 80,        // Active top/bottom margin in pixel
			// scrollSpeed: 5,               // Pixel per event
			// setTextTypeJson: false,       // Allow dragging of nodes to different IE windows
			dragStart: function (node, data) {
				// Return false to cancel dragging of node.
				// if (node.isFolder()) { return false; }

				// Image must exist in DOM
				var $dragItem = $(`<div class="fancytree-drag-item-container">
									<img class="fancytree-drag-item-image" src="./img/state.png" />
									<div class="fancytree-drag-text">${data.node.key}</div>
								</div>`).appendTo("body");
				data.dataTransfer.setDragImage($dragItem[0], -10, -10);

				// Prevent henerating the default echo
				data.useDefaultImage = false;

				if (node.isFolder()) {
					// let list = [];
					// for (const child of node.children) {
					// 	list.push(child.key);
					// }
					data.dataTransfer.setData('text/plain', `${data.node.key}.all`);
				} else {
					data.dataTransfer.setData('text/plain', data.node.key);
				}
				return true;
			}
		}
	});
}

function createServicesWhiteListChips(host, settings, onChange) {
	$('.container_whitelistServices').empty();

	for (const host of hosts) {
		if (host && host.name) {
			$('.container_whitelistServices').append(
				`<div class="col s12">
					<div class="row">
						<p class="translate title">${host.name}: Whitelist</p>
						<div class="col s12">
							<label class="translate">${_('whitelistServices')}</label>
							<div class="chips whitelistServices_${host.name}"></div>
						</div>
					</div>
				</div>`
			)

			list2chips(`.whitelistServices_${host.name}`, serviceWhiteList[host.name] || [], onChange, 'AddService');
		}
	}
}

function createDatapointsBlacklistChips(host, settings, onChange) {
	$('.container_blacklistDatapoints').empty();

	for (const host of hosts) {
		if (host && host.name) {
			$('.container_blacklistDatapoints').append(
				`<div class="col s12">
					<div class="row">
						<div class="col s12">
							<label class="translate blacklistDatapoints_header">${host.name}: ${_('blacklistDatapoints')}</label>
							<div class="chips blacklistDatapoints_${host.name}"></div>
						</div>
					</div>
				</div>`
			)

			list2chips(`.blacklistDatapoints_${host.name}`, blacklistDatapoints[host.name] || [], onChange, 'Drag here');

			$(`.blacklistDatapoints_${host.name}`).find('input').prop('readonly', true);

			$(`.blacklistDatapoints_${host.name}`).on('dragover', false).on('drop', function (e) {
				// do something
				let data = e.originalEvent.dataTransfer.getData("text/plain");

				if (data.includes(',')) {
					let list = data.split(',');
					for (const child of list) {
						M.Chips.getInstance($(`.blacklistDatapoints_${host.name}`)).addChip({ tag: child });
					}
				} else {
					M.Chips.getInstance($(`.blacklistDatapoints_${host.name}`)).addChip({ tag: data });
				}

				return false;
			});
		}
	}
}

function createCommandsTable(data, hosts, onChange) {
	let hostNames = [];
	for (const host of hosts) {
		if (host && host.name) {
			hostNames.push(host.name);
		}
	}

	$('.container_mycommandsTable').empty();

	let element = `<div class="col s12" id="commands">
							<a class="btn-floating waves-effect waves-light blue table-button-add"><i
									class="material-icons">add</i></a>
							<div class="table-values-div" style="margin-top: 10px;">
								<table class="table-values" id="commandsTable">
									<thead>
										<tr>
											<th data-name="host" class="selectInTable-hosts translate"
												style="width: 10%; text-align: center;" data-default=""
												data-type="select" data-style=""
												data-options="${hostNames.join(";")}">${_("Host")}</th>
											<th data-name="name" style="width: auto" class="translate">${_("Name")}</th>
											<th data-name="description" style="width: 20%" class="translate">${_("Description")}</th>
											<th data-name="command" style="width: 30%" class="translate">${_("Command")}</th>
											<th data-name="type" class="translate"
												style="width: 10%; text-align: center;" data-default="string"
												data-type="select" data-style=""
												data-options="string;number;boolean;button;array">${_("Type")}</th>
											<th data-name="unit" style="width: 100px; text-align: center;" class="translate">${_("Unit")}</th>												
											<th data-buttons="delete up down" style="width: 120px"></th>
										</tr>
									</thead>
								</table>
							</div>
						</div>`

	$('.container_mycommandsTable').html(element);

	values2table('commands', data, onChange);

}

function createFoldersTable(data, hosts, onChange) {
	let hostNames = [];
	for (const host of hosts) {
		if (host && host.name) {
			hostNames.push(host.name);
		}
	}

	$('.container_foldersTable').empty();

	let element = `<div class="col s12" id="folders">
							<a class="btn-floating waves-effect waves-light blue table-button-add"><i
									class="material-icons">add</i></a>
							<div class="table-values-div" style="margin-top: 10px;">
								<table class="table-values" id="foldersTable">
									<thead>
										<tr>
											<th data-name="host" class="selectInTable-hosts translate"
												style="width: 10%; text-align: center;" data-default=""
												data-type="select" data-style=""
												data-options="${hostNames.join(";")}">${_("Host")}</th>
											<th data-name="name" style="width: auto" class="translate">${_("Name")}</th>
											<th data-name="path" style="width: 40%" class="translate">${_("Path")}</th>
											<th data-name="unit" class="translate"
												style="width: 10%; text-align: center; " data-default="MB"
												data-type="select" data-style=""
												data-options="MB;GB;TB">${_("Unit")}</th>
											<th data-name="digits" data-type="number" data-default="2" style="width: 100px" class="translate">${_("Digits")}</th>												
											<th data-buttons="delete up down" style="width: 120px"></th>
										</tr>
									</thead>
								</table>
							</div>
						</div>`

	$('.container_foldersTable').html(element);

	values2table('folders', data, onChange);
}

async function getObjects(lib) {
	return new Promise((resolve, reject) => {
		$.getJSON(`./lib/${lib}.json`, function (json) {
			if (json) {
				resolve(json);
			} else {
				resolve(null);
			}
		});
	});
}

function loadHostsTable(settings, hosts, onChange) {
	if (hosts.length > 0) {
		for (const host of hosts) {
			host.password = decrypt(secret, host.password);
		}
	}

	values2table('hosts', hosts, onChange);

	onChange(false);
	// function Materialize.updateTextFields(); to reinitialize all the Materialize labels on the page if you are dynamically adding inputs.
	M.updateTextFields();
}

// This will be called by the admin adapter when the user presses the save button
function save(callback) {
	// example: select elements with class=value and build settings object
	var obj = {};
	$('.value').each(function () {
		var $this = $(this);
		if ($this.attr('type') === 'checkbox') {
			obj[$this.attr('id')] = $this.prop('checked');
		} else {
			obj[$this.attr('id')] = $this.val();
		}
	});


	obj.serviceWhiteList = {};
	obj.blacklistDatapoints = {};

	obj.hosts = table2values('hosts').filter(o => (o.name !== ''));
	if (obj.hosts.length > 0) {
		for (const host of obj.hosts) {
			host.password = encrypt(secret, host.password);
			host.name = host.name.replace(/[*?"'\[\]\s]/g, "_");

			obj.serviceWhiteList[host.name] = chips2list(`.whitelistServices_${host.name}`)
			obj.blacklistDatapoints[host.name] = chips2list(`.blacklistDatapoints_${host.name}`)
		}
	}

	obj.folders = table2values('folders').filter(o => (o.name !== ''));
	if (obj.folders.length > 0) {
		for (const host of obj.folders) {
			host.name = host.name.replace(/[*?"'\[\]\s]/g, "_");
		}
	}

	obj.commands = table2values('commands').filter(o => (o.name !== ''));
	if (obj.commands.length > 0) {
		for (const host of obj.commands) {
			host.name = host.name.replace(/[*?"'\[\]\s]/g, "_");
		}
	}

	obj.whitelist = {}
	for (const key of Object.keys(_settings.whitelist)) {
		obj.whitelist[key] = [];
	}

	$("[id*=tree_]").each(function () {
		var selected = $.ui.fancytree.getTree(`#tree_datapoints`).getSelectedNodes();
		var selectedIds = $.map(selected, function (node) {
			if (!node.folder) {
				return node.key;
			}
		});

		for (const id of selectedIds) {
			let idSplitted = id.split('.');

			obj.whitelist[idSplitted[0]].push(idSplitted[1]);
		}
	});

	callback(obj);
}

function encrypt(key, value) {
	var result = '';
	for (var i = 0; i < value.length; ++i) {
		result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
	}
	return result;
}

function decrypt(key, value) {
	var result = '';
	for (var i = 0; i < value.length; ++i) {
		result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
	}
	return result;
}

/**
 * Chips
 */
function list2chips(selector, list, onChange, placeholder) {
	const data = [];

	list.sort();

	for (let i = 0; i < list.length; i++) {
		if (list[i] && list[i].trim()) {
			data.push({ tag: list[i].trim() });
		}
	}

	$(selector).chips({
		data: data,
		placeholder: _(placeholder),
		secondaryPlaceholder: _(placeholder),
		onChipAdd: onChange,
		onChipDelete: onChange
	});
}

function chips2list(selector) {
	const list = [];
	if ($(selector).length > 0) {
		const data = $(selector).chips('getData');


		for (let i = 0; i < data.length; i++) {
			list.push(data[i].tag);
		}

		list.sort();
	}
	return list;
}