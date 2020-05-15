var hosts = [];
var folders = [];
var commands = [];
var secret;
var _settings;

// This will be called by the admin adapter when the settings page loads
async function load(settings, onChange) {
	// example: select elements with id=key and class=value and insert value
	if (!settings) return;

	hosts = settings.hosts || [];
	folders = settings.folders || [];
	commands = settings.commands || [];

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

	eventsHandler(onChange);

	onChange(false);

	// reinitialize all the Materialize labels on the page if you are dynamically adding inputs:
	if (M) M.updateTextFields();

	list2chips('.whitelistServices', settings.servicedWhitelist || [], onChange);
}

function eventsHandler(onChange) {
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
			title: _(`root_${key}`),
			key: key,
			folder: true,
			expanded: expanded,
			children: children
		})
	}

	$(`#tree_datapoints`).fancytree({
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
		click: function (event, data) {
			if (data.targetType === 'title' && !data.node.folder) {
				data.node.setSelected(!data.node.isSelected());
			}

			if (data.targetType === 'checkbox' && data.node.folder) {
				data.node.setExpanded(!data.node.isSelected());
			}
		},

		source:
			tree
		,
		select: function (event, data) {

			// Funktion um alle title auszulesen, kann für Übersetzung verwendet werden -> bitte drin lassen!
			// var selKeys = $.map(data.tree.getSelectedNodes(), function (node) {
			//     if (node.children === null) {
			//         return node.title;
			//     }
			// });
			// console.log(selKeys.join('\n').replace(/_/g, " "));

			onChange();
		}
	});

}

function createCommandsTable(data,hosts, onChange){
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
											<th data-name="command" style="width: 50%" class="translate">${_("Command")}</th>
											<th data-name="type" class="translate"
												style="width: 10%; text-align: center; " data-default="string"
												data-type="select" data-style=""
												data-options="string;number;boolean;button">${_("Type")}</th>
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

	obj.servicedWhitelist = chips2list('.whitelistServices');

	obj.hosts = table2values('hosts');
	if (obj.hosts.length > 0) {
		for (const host of obj.hosts) {
			host.password = encrypt(secret, host.password);
			host.name = host.name.replace(/[*?"'\[\]\s]/g, "_");
		}
	}

	obj.folders = table2values('folders');
	if (obj.folders.length > 0) {
		for (const host of obj.folders) {
			host.name = host.name.replace(/[*?"'\[\]\s]/g, "_");
		}
	}

	obj.commands = table2values('commands');
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
function list2chips(selector, list, onChange) {
	const data = [];

	list.sort();

	for (let i = 0; i < list.length; i++) {
		if (list[i] && list[i].trim()) {
			data.push({ tag: list[i].trim() });
		}
	}

	$(selector).chips({
		data: data,
		placeholder: _('AddService'),
		secondaryPlaceholder: _('AddService'),
		onChipAdd: onChange,
		onChipDelete: onChange
	});
}

function chips2list(selector) {
	const data = $(selector).chips('getData');

	const list = [];
	for (let i = 0; i < data.length; i++) {
		list.push(data[i].tag);
	}

	list.sort();

	return list;
}